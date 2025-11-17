// File: components/ui/CurrentSalaryDetailsModal.tsx

"use client";

import { Role, PayslipStatus } from "@prisma/client";
import React, { useState, useMemo, useCallback, useTransition } from "react";
import {
  isValid,
  isAfter,
  addDays, // Keep for potential future use, maybe not needed now
  startOfDay, // Keep for standard date object manipulation
  isBefore, // Keep for Date object comparisons
  isEqual, // Keep for Date object comparisons
  getYear, // Keep for calendar generation
  getMonth as getMonthFromDateFns, // Keep for calendar generation
  // Add imports from date-fns as needed for utility functions
} from "date-fns";
// We are relying on the server to provide Date objects with correct UTC values
// corresponding to PHT boundaries, so we typically don't need date-fns-tz here.

import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  User,
  Tag,
  CalendarDays,
  Send,
  Lock,
  Wallet,
  // Ensure PhilippinePeso icon is imported if needed and not globally available
  // PhilippinePeso,
} from "lucide-react";

// Make sure this type definition is correctly imported and matches the server action's data structure
// Ensure it includes currentPeriodStartDate, currentPeriodEndDate, commissionCalculationStartTime,
// lastReleasedPayslipEndDate, lastReleasedTimestamp (all as Date | null)
import {
  SalaryBreakdownItem,
  AttendanceRecord,
  AccountData,
  CurrentSalaryDetailsData,
  RequestPayslipResult, // Import result type for the request function
} from "@/lib/Types"; // Adjust import path as necessary

// --- PHT Timezone constant and helpers (replicated if not shareable) ---
const PHT_TIMEZONE = "Asia/Manila";

const getUtcForPhtStartOfDay = (date: Date): Date => {
  if (!isValid(date)) return new Date(Date.UTC(1970, 0, 1));
  try {
    const phtFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: PHT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateParts = phtFormatter.formatToParts(date);
    const year = dateParts.find((p) => p.type === "year")?.value;
    const month = dateParts.find((p) => p.type === "month")?.value;
    const day = dateParts.find((p) => p.type === "day")?.value;
    if (!year || !month || !day)
      throw new Error("Failed to get PHT date parts");
    return new Date(`${year}-${month}-${day}T00:00:00+08:00`); // Construct Date string with PHT offset
  } catch (e) {
    console.error("[ModalHelper getUtcForPhtStartOfDay] Error:", e);
    return new Date(Date.UTC(1970, 0, 1));
  }
};

const formatDateInPHT = (
  dateInput: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  if (!dateInput) return "N/A";
  try {
    const date = new Date(dateInput); // Creates Date object based on UTC timestamp
    if (!isValid(date)) {
      return "Invalid Date";
    }
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: PHT_TIMEZONE, // Use the consistent timezone string
    };
    // Format the Date object according to PHT using Intl
    return new Intl.DateTimeFormat("en-PH", {
      ...defaultOptions,
      ...options,
    }).format(date);
  } catch (e) {
    console.error(
      "[formatDateInPHT] Error formatting date:",
      e,
      "Input:",
      dateInput,
    );
    return "Error";
  }
};

const formatCurrency = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  )
    value = 0;
  // Use Number to ensure correct type for toLocaleString
  const numericValue = Number(value);
  return numericValue.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
// --- End Timezone and Formatting Helpers ---

// Calendar generation logic remains the same, it operates on Year/Month numbers and builds UTC date objects for the grid
interface CalendarDay {
  dayOfMonth: number;
  isCurrentMonth: boolean;
  date: Date; // Start of day UTC 00:00Z date object
}

const generateCalendarGrid = (year: number, month: number): CalendarDay[][] => {
  const grid: CalendarDay[][] = [];
  // Date.UTC(year, month, 1) creates a Date object representing the 1st of the month at 00:00:00Z UTC
  const firstDayOfMonthDate = new Date(Date.UTC(year, month, 1));
  // getUTCDay() gets the day of the week (0=Sunday) in UTC
  const dayOfWeek = firstDayOfMonthDate.getUTCDay();

  // Calendar start date calculation - find the Date object for the first day displayed (Sun of the week of the 1st)
  // Use Date.UTC arithmetic to keep it in the UTC realm
  const calendarStartDate = new Date(Date.UTC(year, month, 1 - dayOfWeek));

  let currentDatePointer = calendarStartDate;

  for (let i = 0; i < 6; i++) {
    const week: CalendarDay[] = [];
    for (let j = 0; j < 7; j++) {
      // startOfDay() on a Date object derived from UTC arithmetic or Prisma @db.Date
      // should return a Date object representing that same date at 00:00:00.000Z if
      // the local timezone has a zero offset or if running in an environment treating it as UTC.
      // Let's ensure we are consistently treating these as start of day UTC.
      // Or explicitly ensure it's UTC midnight for the day shown on the calendar.
      const currentDayUtcMidnight = new Date(
        Date.UTC(
          currentDatePointer.getUTCFullYear(),
          currentDatePointer.getUTCMonth(),
          currentDatePointer.getUTCDate(),
        ),
      );

      week.push({
        dayOfMonth: currentDatePointer.getUTCDate(),
        isCurrentMonth:
          currentDatePointer.getUTCMonth() === month &&
          currentDatePointer.getUTCFullYear() === year,
        date: currentDayUtcMidnight, // Store as UTC midnight
      });
      // Move to the next day using UTC date manipulation
      currentDatePointer.setUTCDate(currentDatePointer.getUTCDate() + 1);
    }
    grid.push(week);
  }
  return grid;
};

// Update the prop type definition to receive Date objects from server actions
type CurrentSalaryDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentBreakdownItems: SalaryBreakdownItem[]; // Pre-filtered by server using UTC boundaries
  currentAttendanceRecords: AttendanceRecord[]; // Pre-filtered by server using UTC boundaries
  accountData: AccountData | null;
  // These props are now Date objects representing UTC moments corresponding to PHT boundaries/timestamps
  currentPeriodStartDate: Date | null; // Actual calculation/display start date boundary (UTC, derived from PHT boundary)
  currentPeriodEndDate: Date | null; // Nominal end DATE boundary for display (UTC, start of PHT today)
  lastReleasedPayslipEndDate?: Date | null; // UTC 00:00Z from @db.Date or null
  lastReleasedTimestamp?: Date | null; // UTC timestamp from @db.DateTime or null
  commissionCalculationStartTime: Date | null; // Actual calculation start timestamp boundary (UTC)

  estimatedGrossPay: number | null | undefined; // Received calculated value from parent (server action result)

  isLoading: boolean; // Add isLoading here
  error: string | null; // Add error here

  onRequestCurrentPayslip: (accountId: string) => Promise<RequestPayslipResult>; // Use imported result type
};

export default function CurrentSalaryDetailsModal({
  isOpen,
  onClose,
  currentBreakdownItems, // Pre-filtered by server using PHT/UTC logic
  currentAttendanceRecords, // Pre-filtered by server using PHT/UTC logic
  accountData,
  currentPeriodStartDate: attendanceCountingStartDateFromProps, // Renamed for clarity (Actual Calc Start UTC Date)
  currentPeriodEndDate: nominalPeriodEndDate_forDisplay, // Renamed for clarity (Nominal Display End Date - UTC start of day PHT)
  lastReleasedPayslipEndDate, // UTC 00:00Z Date object or null
  lastReleasedTimestamp, // UTC Timestamp Date object or null
  commissionCalculationStartTime: commissionFilteringTimestampFromProps, // Renamed for clarity (Actual Calc Start UTC Timestamp)
  estimatedGrossPay,
  isLoading,
  error,
  onRequestCurrentPayslip,
}: CurrentSalaryDetailsModalProps) {
  const [isRequesting, startRequestTransition] = useTransition();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccessMessage, setRequestSuccessMessage] = useState<
    string | null
  >(null);

  // Calculate start of PHT today as a UTC Date object for highlighting today
  const phtTodayUtcStart = useMemo(() => {
    return getUtcForPhtStartOfDay(new Date());
  }, []);

  // Use the Date object props directly for displaying the calculation boundaries
  // Ensure validity checks before formatting/using dates
  const attendanceCountingStartDateForDisplay = useMemo(() => {
    return attendanceCountingStartDateFromProps &&
      isValid(attendanceCountingStartDateFromProps)
      ? attendanceCountingStartDateFromProps
      : null;
  }, [attendanceCountingStartDateFromProps]);

  const commissionFilteringTimestampAfter = useMemo(() => {
    return commissionFilteringTimestampFromProps &&
      isValid(commissionFilteringTimestampFromProps)
      ? commissionFilteringTimestampFromProps
      : null;
  }, [commissionFilteringTimestampFromProps]);

  // Filtered attendance and breakdown items are ALREADY filtered by the server action.
  // The logic below simply prepares them for the modal display/summing.
  const filteredAttendanceRecordsForDisplay = currentAttendanceRecords || []; // Use passed, server-filtered records
  const filteredBreakdownItemsForDisplay = currentBreakdownItems || []; // Use passed, server-filtered items

  const presentDaysForDisplay = useMemo(() => {
    if (!filteredAttendanceRecordsForDisplay) return [];
    return filteredAttendanceRecordsForDisplay
      .filter((r) => r.isPresent)
      .map((r) => {
        const date = new Date(r.date); // @db.Date -> UTC 00:00Z Date object
        return isValid(date) ? date : null;
      })
      .filter((date): date is Date => date !== null); // Filter out null/invalid dates
  }, [filteredAttendanceRecordsForDisplay]);

  const absentDaysForDisplay = useMemo(() => {
    if (!filteredAttendanceRecordsForDisplay) return [];
    return filteredAttendanceRecordsForDisplay
      .filter((r) => !r.isPresent)
      .map((r) => {
        const date = new Date(r.date); // @db.Date -> UTC 00:00Z Date object
        return isValid(date) ? date : null;
      })
      .filter((date): date is Date => date !== null); // Filter out null/invalid dates
  }, [filteredAttendanceRecordsForDisplay]);

  // Calculate days that were considered paid by a previous payout, relevant to the CURRENT period displayed
  // Days in the past since epoch up to and including the last released payslip end date (if valid)
  // NOTE: This isn't days *within* a specific nominal period, but days that are chronologically before the CURRENT period's calculation start date.
  const paidDaysRelevantToCurrentPeriod = useMemo(() => {
    if (!attendanceCountingStartDateForDisplay) {
      // If the current calculation period starts from the very beginning (no prior payout info or start date is epoch),
      // then no days *before* the calculation start date within a typical display window are considered "paid by THIS period's cutoff".
      // Days outside the currently displayed calendar month would be handled by month navigation/generation.
      // For the CURRENT period calendar display, days marked "paid" should only be if there's a valid previous payout cutoff.
      return []; // No prior payout -> no "paid days" marked *within* the calendar view due to a cutoff
    }

    const days: Date[] = [];
    // Find the day *before* the attendanceCountingStartDateForDisplay (which is UTC for start of PHT day AFTER last release end)
    // Need the day equivalent of the UTC start of the last released period end date in PHT
    const lastReleasedPeriodEndPHT_UtcMidnight =
      lastReleasedPayslipEndDate && isValid(lastReleasedPayslipEndDate)
        ? lastReleasedPayslipEndDate // lastReleasedPayslipEndDate is UTC 00:00Z Date from @db.Date
        : null;

    if (
      !lastReleasedPeriodEndPHT_UtcMidnight ||
      isEqual(lastReleasedPeriodEndPHT_UtcMidnight, new Date(0))
    ) {
      return []; // No valid last released date, no paid days defined this way.
    }

    // The range to mark as paid are days chronologically from epoch (or a reasonable early date)
    // up to the lastReleasedPeriodEndPHT_UtcMidnight (inclusive).
    // For calendar display, we typically only mark days *within* or near the current calendar view.
    // However, the prompt/image shows the note "Days before this date are considered covered".
    // The lock icon appears on days BEFORE `attendanceCountingStartDateForDisplay`.
    // The 'Paid/Covered' circle applies to those days marked before the start date boundary.
    // So we don't need a list of 'paid days' dates as a modifier here, the `getDayCellClassNames`
    // logic handles the display class based on comparison with `attendanceCountingStartDateForDisplay`.
    // Let's remove this unused `paidDaysRelevantToCurrentPeriod` memo.
    return [];
  }, [attendanceCountingStartDateForDisplay, lastReleasedPayslipEndDate]); // Removed memo

  // Filtered Breakdown items are already filtered by server using commissionFilteringTimestampFromProps (GT).
  // Nothing more to filter here unless the modal needs to show the RAW list and then filter.
  // Assuming server sends only relevant items:
  // const filteredBreakdownItemsForDisplay = currentBreakdownItems || [];

  const baseDailyRate = accountData?.dailyRate ?? 0;

  // Display calendar month based on the attendance counting start date, fallback to today PHT
  const displayMonthDateForCalendar = useMemo(() => {
    if (
      attendanceCountingStartDateForDisplay &&
      isValid(attendanceCountingStartDateForDisplay)
    ) {
      return new Date(attendanceCountingStartDateForDisplay); // Use the UTC date from server
    }
    // Fallback to the month of the nominalPeriodEndDate_forDisplay (UTC start of PHT today)
    if (
      nominalPeriodEndDate_forDisplay &&
      isValid(new Date(nominalPeriodEndDate_forDisplay))
    ) {
      return new Date(nominalPeriodEndDate_forDisplay); // Use the UTC date from server
    }
    // Default to the month of the current moment in PHT (calculated as UTC start of day)
    return getUtcForPhtStartOfDay(new Date());
  }, [attendanceCountingStartDateForDisplay, nominalPeriodEndDate_forDisplay]); // Use UTC dates from server props

  const calendarGrid = useMemo(() => {
    const year = getYear(displayMonthDateForCalendar); // These fns operate on Date object (UTC value)
    const month = getMonthFromDateFns(displayMonthDateForCalendar); // These fns operate on Date object (UTC value)
    return generateCalendarGrid(year, month); // Generates UTC start of day dates
  }, [displayMonthDateForCalendar]);

  const handleRequestClick = useCallback(async () => {
    if (!accountData?.id) {
      setRequestError("Account data missing. Cannot submit request.");
      return;
    }
    setRequestError(null);
    setRequestSuccessMessage(null);
    startRequestTransition(async () => {
      try {
        // Server action already handles which period the request is for based on the last release
        const result = await onRequestCurrentPayslip(accountData.id);
        if (result.success) {
          setRequestSuccessMessage(
            result.message || "Payslip release requested successfully.",
          );
          // Consider adding a prop to refresh dashboard data here if needed,
          // although the calling component (`app\(logged)...work\page.tsx`)
          // already calls `handleViewCurrentDetails(true)` on success, which refetches this modal data.
        } else {
          setRequestError(
            result.error ||
              result.message ||
              "Failed to submit payslip request.",
          );
        }
      } catch (err: any) {
        setRequestError(err.message || "An unexpected error occurred.");
      }
    });
  }, [accountData?.id, onRequestCurrentPayslip]);

  const showRequestButton = useMemo(() => {
    // Ensure accountData is available before accessing properties
    return (
      accountData &&
      !accountData.role.includes(Role.OWNER) && // Owners don't request payslips
      accountData.canRequestPayslip === true
    );
  }, [accountData]);

  const isRequestButtonDisabled = useMemo(() => {
    // Disable if generally loading, transition is happening, account ID missing, or permission is off
    return (
      isLoading || // Overall modal loading
      isRequesting || // Payslip request transition
      !accountData?.id ||
      accountData?.canRequestPayslip === false
    );
  }, [isLoading, isRequesting, accountData]);

  // Updated getDayCellClassNames logic
  // calendarDay.date is a UTC start of day Date object from generateCalendarGrid
  // phtTodayUtcStart is the UTC start of today in PHT Date object
  // attendanceCountingStartDate (from server) is the UTC Date object representing the PHT start date cut-off
  // presentDays, absentDays are arrays of UTC start of day Date objects from server data filtering.
  const getDayCellClassNames = (
    calendarDay: CalendarDay,
    isThePhtToday: boolean,
    // Attendance start date (UTC Date object) - calculated cutoff based on last payout
    attendanceCountingStartDate: Date | null,
    presentDays: Date[], // Array of UTC start of day Date objects (from server data)
    absentDays: Date[], // Array of UTC start of day Date objects (from server data)
  ) => {
    const { date: calendarDate, isCurrentMonth } = calendarDay; // calendarDate is UTC start of day Date object

    let classNames =
      "mx-auto flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs sm:text-sm relative";

    if (!isCurrentMonth) {
      classNames += " text-gray-300";
    } else {
      classNames += " text-gray-700";
    }

    // Highlight today's date - comparing two UTC Date objects (calendar day vs PHT today)
    if (isThePhtToday && isCurrentMonth) {
      classNames += " border-2 border-blue-500 font-semibold";
    }

    // Check if the calendar day (UTC start of day) is strictly *before* the attendance counting start date (UTC start of PHT day)
    // Both are Date objects representing UTC moments, standard isBefore works.
    const isCoveredByPreviousPayout =
      attendanceCountingStartDate &&
      isValid(attendanceCountingStartDate) &&
      !isEqual(attendanceCountingStartDate, new Date(0)) // Exclude epoch fallback
        ? isBefore(calendarDate, attendanceCountingStartDate)
        : false; // If start date is null/invalid/epoch, no days before it are "covered by a cutoff" in this logic

    // Only apply attendance coloring for days on or after the attendance counting start date boundary
    // AND within the calendar's current month
    if (
      isCurrentMonth &&
      attendanceCountingStartDate &&
      isValid(attendanceCountingStartDate) &&
      !isBefore(calendarDate, attendanceCountingStartDate)
    ) {
      // Day is in the current PHT period being counted.
      // Check if the calendar day's date (UTC start of day) is present or absent in the *server-filtered* lists (arrays of UTC start of day Dates)
      const isPresent = presentDays.some((d) => isEqual(d, calendarDate));
      const isAbsent = absentDays.some((d) => isEqual(d, calendarDate));

      if (isPresent) {
        classNames += " bg-green-100 font-medium text-green-800";
      } else if (isAbsent) {
        classNames += " bg-red-100 text-red-800 opacity-90";
      }
      // Else it's a gray cell for a day in the current month, on or after the start date, but not marked present/absent, and not today
    } else if (isCurrentMonth && isCoveredByPreviousPayout) {
      // Day was before the current attendance counting period starts due to a prior payout
      classNames += " bg-gray-200 text-gray-400 line-through";
    }
    // If isCurrentMonth is false, it gets greyed out naturally. If !attendanceCountingStartDate
    // (meaning counting starts from epoch), the !isBefore check will be true for almost all visible dates,
    // and it falls through to check isPresent/isAbsent based on server data. This seems correct for
    // the initial period where no prior payslip exists.

    return classNames;
  };

  // Text notes reference
  const formattedAttendanceStartDateNote =
    attendanceCountingStartDateForDisplay &&
    isValid(attendanceCountingStartDateForDisplay) &&
    !isEqual(attendanceCountingStartDateForDisplay, new Date(0))
      ? formatDateInPHT(attendanceCountingStartDateForDisplay, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "the beginning";

  const formattedCommissionStartTimeNote =
    commissionFilteringTimestampAfter &&
    isValid(commissionFilteringTimestampAfter) &&
    !isEqual(commissionFilteringTimestampAfter, new Date(0))
      ? formatDateInPHT(commissionFilteringTimestampAfter, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        })
      : "the beginning";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <DialogTitle>
          Current Salary Details (
          {/* Display month based on the displayMonthDateForCalendar, which uses server dates or PHT today fallback */}
          {formatDateInPHT(
            displayMonthDateForCalendar, // This is a UTC Date object representing the chosen month/year PHT
            {
              month: "long",
              year: "numeric",
            },
          )}
          )
        </DialogTitle>
      }
      containerClassName="relative m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-customOffWhite shadow-xl flex flex-col"
    >
      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-10 p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
        aria-label="Close modal"
      >
        <X size={20} />
      </button>

      <div className="flex-grow space-y-4 overflow-y-auto p-4 sm:p-6">
        {/* Loading and Error messages match */}
        {isLoading && (
          <div className="flex h-[300px] items-center justify-center text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading current
            details...
          </div>
        )}
        {error && !isLoading && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={18} /> <span>{error}</span>
          </div>
        )}

        {!isLoading && !error && accountData ? (
          <>
            {/* Estimated Gross Pay - Displayed directly from server prop */}
            <div className="flex items-center justify-between rounded-lg bg-blue-100/60 p-4 text-gray-800 shadow-md">
              <div className="flex items-center gap-3">
                <Wallet size={28} className="text-blue-600" />
                <h4 className="text-lg font-semibold sm:text-xl">
                  Estimated Gross Pay:
                </h4>
              </div>
              {/* EstimatedGrossPay comes already calculated from server */}
              <span className="text-lg font-bold text-green-700 sm:text-2xl">
                {formatCurrency(estimatedGrossPay)}
              </span>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm sm:p-3">
              <h4 className="mb-2 text-center text-sm font-semibold text-gray-800 sm:text-left sm:text-base">
                Current Period Attendance
              </h4>
              {/* Display month based on the displayMonthDateForCalendar (UTC Date) */}
              <p className="mb-1 text-center text-sm font-medium text-gray-700">
                {formatDateInPHT(displayMonthDateForCalendar, {
                  month: "long",
                  year: "numeric",
                })}
              </p>

              {/* Calendar remains */}
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (day) => (
                          <th
                            key={day}
                            className="py-1 text-center font-normal sm:w-10"
                          >
                            {day.substring(0, 2)}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="text-center">
                    {calendarGrid.map((week, weekIndex) => (
                      <tr key={weekIndex}>
                        {week.map((calendarDay, dayIndex) => (
                          <td
                            key={`${weekIndex}-${dayIndex}`}
                            className="h-8 w-8 p-0.5 sm:h-10 sm:w-10"
                          >
                            {/* calendarDay.date is UTC 00:00Z Date. phtTodayUtcStart is UTC 00:00Z Date for PHT today.
                            attendanceCountingStartDateForDisplay is UTC Date object for PHT cutoff.
                            presentDaysForDisplay, absentDaysForDisplay are arrays of UTC 00:00Z Date objects */}
                            <div
                              className={getDayCellClassNames(
                                calendarDay,
                                isEqual(calendarDay.date, phtTodayUtcStart), // Comparison of UTC dates
                                attendanceCountingStartDateForDisplay, // UTC Date object from server
                                presentDaysForDisplay, // Array of UTC Date objects
                                absentDaysForDisplay, // Array of UTC Date objects
                              )}
                            >
                              {calendarDay.dayOfMonth}
                              {/* Lock icon for days BEFORE the attendance counting start date boundary (UTC Date comparison) */}
                              {/* attendanceCountingStartDateForDisplay is already checked for isValid and non-epoch in getDayCellClassNames */}
                              {calendarDay.isCurrentMonth &&
                                attendanceCountingStartDateForDisplay &&
                                isBefore(
                                  calendarDay.date,
                                  attendanceCountingStartDateForDisplay,
                                ) && (
                                  <Lock
                                    size={10}
                                    className="absolute bottom-0.5 right-0.5 text-gray-400"
                                  />
                                )}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Attendance legend remains */}
              <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-green-300 bg-green-100"></span>
                  Present ({presentDaysForDisplay.length})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-red-300 bg-red-100"></span>
                  Absent ({absentDaysForDisplay.length})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-gray-400 bg-gray-200"></span>{" "}
                  Paid/Covered
                </span>
              </div>

              {/* Update attendance note text using formatted start date note */}
              <p className="mt-1 text-center text-[0.7rem] italic text-gray-500">
                Attendance counts are since {formattedAttendanceStartDateNote}.
                Days before this date are considered covered by previous
                payouts.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                Current Period Commissions
              </h4>
              {/* Display the pre-filtered items */}
              {filteredBreakdownItemsForDisplay.length > 0 ? (
                <ul className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                  {filteredBreakdownItemsForDisplay.map((item) => (
                    <li
                      key={item.id} // Use unit ID
                      className="rounded-md border border-gray-100 bg-white p-2.5 text-xs"
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="flex items-center gap-1.5 font-medium text-gray-800">
                          <Tag size={12} className="text-blue-500" />{" "}
                          {item.serviceTitle || "Unknown Service"}
                        </span>
                        {/* item.commissionEarned is already rounded by the server */}
                        <span className="whitespace-nowrap font-semibold text-green-600">
                          +{formatCurrency(item.commissionEarned)}
                        </span>
                      </div>
                      <div className="space-y-0.5 text-gray-500">
                        <p className="flex items-center gap-1">
                          <User size={10} /> Client:{" "}
                          {item.customerName || "N/A"}
                        </p>
                        {/* servicePrice is calculated/rounded by server */}
                        {/* Add PhilippinePeso icon if available */}
                        {/* <p className="flex items-center gap-1">
                             {<PhilippinePeso size={10} />} Price: {formatCurrency(item.servicePrice)}
                         </p> */}
                        <p className="flex items-center gap-1">
                          {/* item.completedAt is UTC Date object (from unit.servedAt) - format to PHT */}
                          <CalendarDays size={10} /> Date Served:{" "}
                          {formatDateInPHT(item.completedAt, {
                            month: "short",
                            day: "numeric",
                            year: "numeric", // Include year for clarity
                            hour: "numeric",
                            minute: "numeric",
                            hour12: true,
                          })}
                        </p>
                        {item.originatingSetTitle && (
                          <p className="flex items-center gap-1">
                            <Tag size={10} /> Set: {item.originatingSetTitle}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center italic text-gray-500">
                  {/* Update empty state message to reflect formatted start time note */}
                  {commissionFilteringTimestampAfter &&
                  isValid(commissionFilteringTimestampAfter) &&
                  !isEqual(commissionFilteringTimestampAfter, new Date(0))
                    ? `No commissions earned after ${formattedCommissionStartTimeNote}.`
                    : "No commissions earned yet in this period."}
                </p>
              )}
            </div>

            {/* Components Contributing section remains */}
            <div className="shrink-0 rounded-md border border-gray-200 bg-blue-50/80 p-3 text-sm text-gray-800 shadow-sm">
              <p className="flex justify-between">
                <span>Base Daily Rate:</span>
                <span className="font-semibold">
                  {formatCurrency(baseDailyRate)}
                </span>
              </p>
              <div className="mt-2 border-t border-gray-200 pt-2">
                <p className="flex justify-between">
                  <span>Days Present (for current payout):</span>
                  <span className="font-semibold text-green-700">
                    {/* Use the count from the server-filtered list */}
                    {presentDaysForDisplay.length}
                  </span>
                </p>
                {/* No days absent counted towards pay, but shown for info */}
                <p className="mt-0.5 flex justify-between">
                  <span>Days Absent (for current payout):</span>
                  <span className="font-semibold text-red-700">
                    {/* Use the count from the server-filtered list */}
                    {absentDaysForDisplay.length}
                  </span>
                </p>
                <p className="mt-0.5 flex justify-between">
                  <span>Total Commission (for current payout):</span>
                  {/* Calculate commission total from the (server-filtered) list */}
                  <span className="font-semibold text-green-700">
                    {/* Sum server-calculated commissionEarned values */}
                    {formatCurrency(
                      filteredBreakdownItemsForDisplay.reduce(
                        (sum, item) => sum + (item.commissionEarned || 0),
                        0,
                      ),
                    )}
                  </span>
                </p>
              </div>
              {/* Update components note using formatted notes */}
              <p className="mt-1.5 text-xs italic text-gray-500">
                Components contributing to the estimated gross pay shown above.
                Attendance counts are from {formattedAttendanceStartDateNote}{" "}
                and commissions earned after {formattedCommissionStartTimeNote}.
              </p>
            </div>

            {/* Payslip Request section remains */}
            {/* Check showRequestButton derived from accountData props */}
            {showRequestButton && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                <div>
                  <h5 className="mb-1 font-semibold text-gray-800">
                    Payslip Release Request
                  </h5>
                  {/* Display permission status from accountData prop */}
                  {accountData.canRequestPayslip ? (
                    <p className="text-xs text-green-600">
                      Requests enabled by owner.
                    </p>
                  ) : (
                    <p className="text-xs text-orange-600">
                      Requests currently disabled by owner.
                    </p>
                  )}
                </div>
                {/* Button action uses the callback derived from onRequestCurrentPayslip prop */}
                <Button
                  size="sm"
                  onClick={handleRequestClick}
                  disabled={isRequestButtonDisabled}
                  icon={
                    isRequesting ? (
                      <Loader2 size={16} className="mr-1 animate-spin" />
                    ) : (
                      <Send size={16} className="mr-1" />
                    )
                  }
                  variant={isRequesting ? "secondary" : "primary"}
                >
                  {isRequesting ? "Requesting..." : "Request Release"}
                </Button>
              </div>
            )}

            {/* Request feedback messages remain */}
            {requestSuccessMessage && (
              <div className="mt-2 flex items-center gap-2 rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">
                <CheckCircle size={16} /> <span>{requestSuccessMessage}</span>
              </div>
            )}
            {requestError && (
              <div className="mt-2 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                <AlertCircle size={16} /> <span>{requestError}</span>
              </div>
            )}
          </>
        ) : (
          // Show fallback message if data is null but not loading/erroring
          !isLoading &&
          !error &&
          !accountData && (
            <div className="py-4 text-center italic text-red-500">
              Required account data is not available.
            </div>
          )
        )}
      </div>

      {/* Footer Close button remains */}
      <div className="flex shrink-0 items-center justify-end border-t border-gray-200 bg-gray-50 p-4">
        <Button type="button" onClick={onClose} variant="outline" size="sm">
          Close
        </Button>
      </div>
    </Modal>
  );
}
