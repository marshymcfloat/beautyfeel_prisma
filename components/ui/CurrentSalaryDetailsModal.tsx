"use client";

import { Role, PayslipStatus } from "@prisma/client";
import React, { useState, useMemo, useCallback, useTransition } from "react";
import {
  isValid,
  isAfter,
  addDays,
  startOfDay,
  isBefore,
  isEqual,
  getDaysInMonth,
  getDay,
  getDate,
  getMonth as getMonthFromDateFns,
  getYear,
} from "date-fns";

import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";
import {
  Loader2,
  AlertCircle,
  X,
  User,
  Tag,
  CalendarDays,
  Send,
  Lock,
} from "lucide-react";

import {
  SalaryBreakdownItem,
  AttendanceRecord,
  AccountData,
} from "@/lib/Types";

const PHT_TIMEZONE = "Asia/Manila";

const formatDateInPHT = (
  dateInput: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  if (!dateInput) return "N/A";
  try {
    const date = new Date(dateInput);
    if (!isValid(date)) {
      return "Invalid Date";
    }
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: PHT_TIMEZONE,
    };
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

type CurrentSalaryDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentBreakdownItems: SalaryBreakdownItem[];
  currentAttendanceRecords: AttendanceRecord[];
  accountData: AccountData | null;
  currentPeriodStartDate: Date | null;
  currentPeriodEndDate: Date | null;
  isLoading: boolean;
  error: string | null;
  lastReleasedPayslipEndDate?: Date | null;
  lastReleasedTimestamp?: Date | null;
  onRequestCurrentPayslip: (accountId: string) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
    payslipId?: string;
    status?: PayslipStatus | "NOT_FOUND" | null;
  }>;
};

const formatCurrency = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  )
    value = 0;
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface CalendarDay {
  dayOfMonth: number;
  isCurrentMonth: boolean;
  date: Date;
}

const generateCalendarGrid = (year: number, month: number): CalendarDay[][] => {
  const grid: CalendarDay[][] = [];
  const firstDayOfMonthDate = new Date(Date.UTC(year, month, 1));

  let currentDatePointer = addDays(
    firstDayOfMonthDate,
    -getDay(firstDayOfMonthDate),
  );

  for (let i = 0; i < 6; i++) {
    const week: CalendarDay[] = [];
    for (let j = 0; j < 7; j++) {
      week.push({
        dayOfMonth: getDate(currentDatePointer),
        isCurrentMonth:
          getMonthFromDateFns(currentDatePointer) === month &&
          getYear(currentDatePointer) === year,
        date: startOfDay(currentDatePointer),
      });
      currentDatePointer = addDays(currentDatePointer, 1);
    }
    grid.push(week);
  }
  return grid;
};

export default function CurrentSalaryDetailsModal({
  isOpen,
  onClose,
  currentBreakdownItems,
  currentAttendanceRecords,
  accountData,
  currentPeriodStartDate,
  currentPeriodEndDate,
  isLoading,
  error,
  lastReleasedPayslipEndDate,
  lastReleasedTimestamp,
  onRequestCurrentPayslip,
}: CurrentSalaryDetailsModalProps) {
  const [isRequesting, startRequestTransition] = useTransition();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccessMessage, setRequestSuccessMessage] = useState<
    string | null
  >(null);

  const phtToday = useMemo(() => {
    const nowInPHTRaw = new Date(
      new Date().toLocaleString("en-US", { timeZone: PHT_TIMEZONE }),
    );

    return new Date(
      Date.UTC(
        nowInPHTRaw.getFullYear(),
        nowInPHTRaw.getMonth(),
        nowInPHTRaw.getDate(),
      ),
    );
  }, []);

  const lastReleasedPayslipEndDateUTC = useMemo(() => {
    if (!lastReleasedPayslipEndDate) return null;
    const date = new Date(lastReleasedPayslipEndDate);
    return isValid(date) ? startOfDay(date) : null;
  }, [lastReleasedPayslipEndDate]);

  const filterAttendanceStartDateForCounts = useMemo(() => {
    if (lastReleasedPayslipEndDateUTC) {
      return addDays(lastReleasedPayslipEndDateUTC, 1);
    }
    return currentPeriodStartDate
      ? startOfDay(new Date(currentPeriodStartDate))
      : new Date(0);
  }, [lastReleasedPayslipEndDateUTC, currentPeriodStartDate]);

  const filterAttendanceRecords = useCallback(
    (records: AttendanceRecord[], includePresent: boolean) => {
      return (
        records
          ?.filter((r) => {
            const recordDate = new Date(r.date);
            if (!isValid(recordDate) || r.isPresent !== includePresent)
              return false;
            const recordStartOfDay = startOfDay(recordDate);
            return !isBefore(
              recordStartOfDay,
              filterAttendanceStartDateForCounts,
            );
          })
          .map((r) => startOfDay(new Date(r.date))) ?? []
      );
    },
    [filterAttendanceStartDateForCounts],
  );

  const presentDays = useMemo(
    () => filterAttendanceRecords(currentAttendanceRecords, true),
    [currentAttendanceRecords, filterAttendanceRecords],
  );
  const absentDays = useMemo(
    () => filterAttendanceRecords(currentAttendanceRecords, false),
    [currentAttendanceRecords, filterAttendanceRecords],
  );

  const filterCommissionTimestampAfter = useMemo(() => {
    if (!lastReleasedTimestamp) return null;
    const timestamp = new Date(lastReleasedTimestamp);
    return isValid(timestamp) ? timestamp : null;
  }, [lastReleasedTimestamp]);

  const filteredBreakdownItems = useMemo(() => {
    return (
      currentBreakdownItems?.filter((item) => {
        if (!item.completedAt) return false;
        const itemDate = new Date(item.completedAt);
        if (!isValid(itemDate)) return false;
        return (
          !filterCommissionTimestampAfter ||
          isAfter(itemDate, filterCommissionTimestampAfter)
        );
      }) ?? []
    );
  }, [currentBreakdownItems, filterCommissionTimestampAfter]);

  const calculatedBreakdownTotal = useMemo(() => {
    return filteredBreakdownItems.reduce(
      (sum, item) => sum + (item.commissionEarned || 0),
      0,
    );
  }, [filteredBreakdownItems]);

  const baseDailyRate = accountData?.dailyRate ?? 0;

  const displayMonthDateForCalendar = useMemo(() => {
    if (currentPeriodStartDate && isValid(new Date(currentPeriodStartDate))) {
      return new Date(currentPeriodStartDate);
    }
    const now = new Date();
    const phtFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: PHT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
    });
    const [yearStr, monthStr] = phtFormatter.format(now).split("-");
    return new Date(Date.UTC(parseInt(yearStr), parseInt(monthStr) - 1, 1));
  }, [currentPeriodStartDate]);

  const calendarGrid = useMemo(() => {
    const year = getYear(displayMonthDateForCalendar);
    const month = getMonthFromDateFns(displayMonthDateForCalendar);
    return generateCalendarGrid(year, month);
  }, [displayMonthDateForCalendar]);

  const presentCount = presentDays.length;
  const absentCount = absentDays.length;

  const handleRequestClick = useCallback(async () => {
    if (!accountData?.id) {
      setRequestError("Account data missing. Cannot submit request.");
      return;
    }
    setRequestError(null);
    setRequestSuccessMessage(null);
    startRequestTransition(async () => {
      try {
        const result = await onRequestCurrentPayslip(accountData.id);
        if (result.success) {
          setRequestSuccessMessage(
            result.message || "Payslip release requested successfully.",
          );
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
    return (
      accountData &&
      !accountData.role.includes(Role.OWNER) &&
      accountData.canRequestPayslip === true
    );
  }, [accountData]);

  const isRequestButtonDisabled = useMemo(() => {
    return (
      isLoading ||
      isRequesting ||
      !accountData?.id ||
      accountData?.canRequestPayslip === false
    );
  }, [isLoading, isRequesting, accountData]);

  const getDayCellClassNames = (
    calendarDay: CalendarDay,
    isThePhtToday: boolean,
    lastPaidDate: Date | null,
  ) => {
    const { date, isCurrentMonth } = calendarDay;

    let classNames =
      "mx-auto flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs sm:text-sm relative";

    if (!isCurrentMonth) {
      classNames += " text-gray-300";
    } else {
      classNames += " text-gray-700";
    }

    if (isThePhtToday && isCurrentMonth) {
      classNames += " border-2 border-blue-500 font-semibold";
    }

    const isCoveredByLastPayslip =
      lastPaidDate &&
      (isBefore(date, lastPaidDate) || isEqual(date, lastPaidDate));

    if (isCurrentMonth && isCoveredByLastPayslip) {
      classNames += " bg-gray-200 text-gray-400 line-through";
    } else if (isCurrentMonth) {
      const isPresent = presentDays.some((d) => isEqual(d, date));
      const isAbsent = absentDays.some((d) => isEqual(d, date));

      if (isPresent) {
        classNames += " bg-green-100 font-medium text-green-800";
      } else if (isAbsent) {
        classNames += " bg-red-100 text-red-800 opacity-90";
      }
    }
    return classNames;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <DialogTitle>
          Current Salary Details (
          {formatDateInPHT(displayMonthDateForCalendar, {
            month: "long",
            year: "numeric",
          })}
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
            <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm sm:p-3">
              <h4 className="mb-2 text-center text-sm font-semibold text-gray-800 sm:text-left sm:text-base">
                Current Period Attendance
              </h4>
              <p className="mb-1 text-center text-sm font-medium text-gray-700">
                {formatDateInPHT(displayMonthDateForCalendar, {
                  month: "long",
                  year: "numeric",
                })}
              </p>

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
                            <div
                              className={getDayCellClassNames(
                                calendarDay,
                                isEqual(calendarDay.date, phtToday),
                                lastReleasedPayslipEndDateUTC,
                              )}
                            >
                              {calendarDay.dayOfMonth}
                              {calendarDay.isCurrentMonth &&
                                lastReleasedPayslipEndDateUTC &&
                                (isBefore(
                                  calendarDay.date,
                                  lastReleasedPayslipEndDateUTC,
                                ) ||
                                  isEqual(
                                    calendarDay.date,
                                    lastReleasedPayslipEndDateUTC,
                                  )) && (
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

              <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-green-300 bg-green-100"></span>
                  Present ({presentCount})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-red-300 bg-red-100"></span>
                  Absent ({absentCount})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-gray-400 bg-gray-200"></span>{" "}
                  {}
                  Paid/Covered
                </span>
              </div>

              <p className="mt-1 text-center text-[0.7rem] italic text-gray-500">
                Attendance counts are since the day after the last payout (
                {formatDateInPHT(filterAttendanceStartDateForCounts, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                ). Calendar shows paid days.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                Current Period Commissions
              </h4>
              {filteredBreakdownItems.length > 0 ? (
                <ul className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                  {filteredBreakdownItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-gray-100 bg-white p-2.5 text-xs"
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="flex items-center gap-1.5 font-medium text-gray-800">
                          <Tag size={12} className="text-blue-500" />{" "}
                          {item.serviceTitle || "Unknown Service"}
                        </span>
                        <span className="whitespace-nowrap font-semibold text-green-600">
                          +{formatCurrency(item.commissionEarned)}
                        </span>
                      </div>
                      <div className="space-y-0.5 text-gray-500">
                        <p className="flex items-center gap-1">
                          <User size={10} /> Client:{" "}
                          {item.customerName || "N/A"}
                        </p>
                        <p className="flex items-center gap-1">
                          <CalendarDays size={10} /> Date Served:{" "}
                          {formatDateInPHT(item.completedAt, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
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
                  {currentBreakdownItems.length > 0 &&
                  filterCommissionTimestampAfter
                    ? `No commissions earned after the last payout time (${formatDateInPHT(filterCommissionTimestampAfter, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true })}).`
                    : "No commissions earned yet in this period."}
                </p>
              )}
            </div>

            <div className="shrink-0 rounded-md border border-gray-200 bg-blue-50/80 p-3 text-sm text-gray-800 shadow-sm">
              <p className="flex justify-between">
                <span>Total Commission (Current Period):</span>
                <span className="font-semibold text-green-700">
                  {formatCurrency(calculatedBreakdownTotal)}
                </span>
              </p>
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
                    {presentCount}
                  </span>
                </p>
                <p className="mt-0.5 flex justify-between">
                  <span>Days Absent (for current payout):</span>
                  <span className="font-semibold text-red-700">
                    {absentCount}
                  </span>
                </p>
              </div>
              <p className="mt-1.5 text-xs italic text-gray-500">
                Note: Final salary calculated server-side. Counts are from{" "}
                {formatDateInPHT(filterAttendanceStartDateForCounts, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                .
              </p>
            </div>

            {accountData && !accountData.role.includes(Role.OWNER) && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                <div>
                  <h5 className="mb-1 font-semibold text-gray-800">
                    Payslip Release Request
                  </h5>
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
                {showRequestButton && (
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
                )}
              </div>
            )}

            {requestSuccessMessage && (
              <div className="mt-2 flex items-center gap-2 rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">
                <AlertCircle size={16} /> <span>{requestSuccessMessage}</span>
              </div>
            )}
            {requestError && (
              <div className="mt-2 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                <AlertCircle size={16} /> <span>{requestError}</span>
              </div>
            )}
          </>
        ) : (
          !isLoading &&
          !error &&
          !accountData && (
            <div className="py-4 text-center italic text-red-500">
              Required account data is not available.
            </div>
          )
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-gray-200 bg-gray-50 p-4">
        <Button type="button" onClick={onClose} variant="outline" size="sm">
          Close
        </Button>
      </div>
    </Modal>
  );
}
