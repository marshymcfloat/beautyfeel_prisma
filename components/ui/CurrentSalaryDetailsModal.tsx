"use client";

import { Role, PayslipStatus } from "@prisma/client";
import React, { useState, useMemo, useCallback, useTransition } from "react";
import {
  isValid, // Still useful for checking date validity
  isAfter,
  addDays,
  startOfDay,
} from "date-fns"; // Keep date-fns for math
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

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
} from "lucide-react";

import {
  SalaryBreakdownItem,
  AttendanceRecord,
  AccountData,
} from "@/lib/Types";

const PHT_TIMEZONE = "Asia/Manila";

const formatDateInPHT = (
  dateInput: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {}, // Allow passing Intl options
): string => {
  if (!dateInput) return "N/A";
  try {
    const date = new Date(dateInput); // Handles Date objects, ISO strings, or numbers
    if (!isValid(date)) {
      // isValid from date-fns
      // console.warn("[formatDateInPHT] Invalid date input:", dateInput);
      return "Invalid Date";
    }
    // Default options if none are provided, can be customized
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
  currentPeriodStartDate: Date | null; // UTC timestamp from server
  currentPeriodEndDate: Date | null; // UTC timestamp from server
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

const modifierStyles = {
  present: {
    backgroundColor: "#A7F3D0",
    color: "#065F46",
    fontWeight: "bold",
    borderRadius: "50%",
  },
  absent: {
    backgroundColor: "#FECACA",
    color: "#991B1B",
    opacity: 0.9,
    borderRadius: "50%",
  },
  today: { fontWeight: "bold", border: "1px solid #3B82F6" }, // Style for PHT today
};

export default function CurrentSalaryDetailsModal({
  isOpen,
  onClose,
  currentBreakdownItems,
  currentAttendanceRecords,
  accountData,
  currentPeriodStartDate, // UTC
  currentPeriodEndDate, // UTC
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

  console.log(currentBreakdownItems);

  const phtToday = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: PHT_TIMEZONE,
    });
    const parts = formatter.formatToParts(new Date()).reduce(
      (acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      },
      {} as Record<string, string>,
    );
    return new Date(
      parseInt(parts.year),
      parseInt(parts.month) - 1,
      parseInt(parts.day),
    );
  }, []);

  const filterAttendanceStartDate = useMemo(() => {
    if (lastReleasedPayslipEndDate) {
      const lastDate = new Date(lastReleasedPayslipEndDate);
      if (isValid(lastDate)) {
        return startOfDay(addDays(lastDate, 1)); // Result is UTC midnight
      }
    }
    return null;
  }, [lastReleasedPayslipEndDate]);

  const filterCommissionTimestampAfter = useMemo(() => {
    if (!lastReleasedTimestamp) return null;
    const timestamp = new Date(lastReleasedTimestamp); // UTC
    return isValid(timestamp) ? timestamp : null;
  }, [lastReleasedTimestamp]);

  const filterAttendanceRecords = useCallback(
    (records: AttendanceRecord[], includePresent: boolean) => {
      return (
        records
          ?.filter((r) => {
            const recordDate = new Date(r.date); // r.date from DB is 'YYYY-MM-DD', new Date() makes it T00:00:00Z (UTC)
            if (!isValid(recordDate) || r.isPresent !== includePresent)
              return false;
            if (filterAttendanceStartDate) {
              // Both recordStartOfDay and filterAttendanceStartDate are UTC midnights
              const recordStartOfDay = startOfDay(recordDate);
              return !(recordStartOfDay < filterAttendanceStartDate);
            }
            return true;
          })
          .map((r) => startOfDay(new Date(r.date))) ?? [] // Array of UTC midnight Date objects
      );
    },
    [filterAttendanceStartDate],
  );

  const presentDays = useMemo(
    () => filterAttendanceRecords(currentAttendanceRecords, true),
    [currentAttendanceRecords, filterAttendanceRecords],
  );
  const absentDays = useMemo(
    () => filterAttendanceRecords(currentAttendanceRecords, false),
    [currentAttendanceRecords, filterAttendanceRecords],
  );

  const filteredBreakdownItems = useMemo(() => {
    return (
      currentBreakdownItems?.filter((item) => {
        if (!item.completedAt) return false;
        const itemDate = new Date(item.completedAt); // item.completedAt is UTC
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

  // For DayPicker, `month`, `fromDate`, `toDate` use the UTC Date objects from props
  const displayMonthForCalendar = useMemo(() => {
    const date = currentPeriodStartDate
      ? new Date(currentPeriodStartDate)
      : new Date();
    return isValid(date) ? date : new Date();
  }, [currentPeriodStartDate]);

  const calendarFromDate = useMemo(() => {
    const date = currentPeriodStartDate
      ? new Date(currentPeriodStartDate)
      : undefined;
    return date && isValid(date) ? date : undefined;
  }, [currentPeriodStartDate]);

  const calendarToDate = useMemo(() => {
    const date = currentPeriodEndDate
      ? new Date(currentPeriodEndDate)
      : undefined;
    return date && isValid(date) ? date : undefined;
  }, [currentPeriodEndDate]);

  const presentCount = presentDays.length;
  const absentCount = absentDays.length;

  const handleRequestClick = useCallback(async () => {
    // ... (same as before)
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
  }, [accountData?.id, onRequestCurrentPayslip, startRequestTransition]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <DialogTitle>
          Current Salary Details (
          {formatDateInPHT(currentPeriodStartDate, {
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
              {calendarFromDate && calendarToDate ? (
                <div className="flex flex-col items-center">
                  {/* Month Title */}
                  <p className="mb-1 text-sm font-medium text-gray-700">
                    {formatDateInPHT(displayMonthForCalendar, {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>

                  {/* Custom Calendar Grid */}
                  <div className="w-full overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="text-xs text-gray-500">
                          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(
                            (day) => (
                              <th key={day} className="w-8 py-1 font-normal">
                                {day}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="text-center">
                        {[
                          [27, 28, 29, 30, 1, 2, 3],
                          [4, 5, 6, 7, 8, 9, 10],
                          [11, 12, 13, 14, 15, 16, 17],
                          [18, 19, 20, 21, 22, 23, 24],
                          [25, 26, 27, 28, 29, 30, 31],
                          [1, 2, 3, 4, 5, 6, 7],
                        ].map((week, weekIndex) => (
                          <tr key={weekIndex}>
                            {week.map((day, dayIndex) => {
                              const isPresent = presentDays.some(
                                (d) => new Date(d).getDate() === day,
                              );
                              const isAbsent = absentDays.some(
                                (d) => new Date(d).getDate() === day,
                              );
                              const isToday = phtToday.getDate() === day;

                              return (
                                <td
                                  key={dayIndex}
                                  className="h-8 w-8 p-0 text-xs"
                                >
                                  <div
                                    className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full ${isPresent ? "bg-green-100 font-medium text-green-800" : ""} ${isAbsent ? "bg-red-100 text-red-800 opacity-90" : ""} ${isToday ? "border border-blue-500" : ""} ${day > 20 && weekIndex === 0 ? "text-gray-400" : ""} ${day < 7 && weekIndex === 5 ? "text-gray-400" : ""} `}
                                  >
                                    {day}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="mt-2 flex justify-center space-x-3 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full border border-green-300 bg-green-100"></span>
                      Present ({presentCount})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full border border-red-300 bg-red-100"></span>
                      Absent ({absentCount})
                    </span>
                  </div>

                  <p className="mt-1 text-center text-[0.7rem] italic text-gray-500">
                    Showing attendance since day after last payout period end (
                    {formatDateInPHT(filterAttendanceStartDate, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    ).
                  </p>
                </div>
              ) : (
                <p className="py-2 text-center text-xs italic text-gray-500">
                  Period dates not available to display calendar.
                </p>
              )}
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
                    : currentBreakdownItems.length > 0 &&
                        !filterCommissionTimestampAfter
                      ? "No commissions found for this period."
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
                  <span>Days Present (Current Period):</span>
                  <span className="font-semibold text-green-700">
                    {presentCount}
                  </span>
                </p>
                <p className="mt-0.5 flex justify-between">
                  <span>Days Absent (Current Period):</span>
                  <span className="font-semibold text-red-700">
                    {absentCount}
                  </span>
                </p>
              </div>
              <p className="mt-1.5 text-xs italic text-gray-500">
                Note: Final salary calculated server-side upon payslip
                generation. Attendance and commission shown are from{" "}
                {filterAttendanceStartDate
                  ? formatDateInPHT(filterAttendanceStartDate, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : formatDateInPHT(currentPeriodStartDate, {
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
