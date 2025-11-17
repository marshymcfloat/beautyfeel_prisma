// File: components/ui/ManagePaySlipModal.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  format,
  isValid,
  startOfMonth,
  startOfDay,
  addDays,
  isBefore,
  isEqual,
  isAfter,
} from "date-fns";
import {
  DayPicker,
  // Remove DayPickerDefaultProps, CalendarDay
  // Keep Modifiers
  Modifiers,
} from "react-day-picker";
import "react-day-picker/dist/style.css";

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
  PhilippinePeso,
  CalendarDays,
  // Remove Lock icon import for now
  // Lock,
} from "lucide-react";

import {
  PayslipData,
  ReleaseSalaryHandler,
  AttendanceRecord,
  SalaryBreakdownItem,
} from "@/lib/Types";
import { PayslipStatus } from "@prisma/client";

// Removed CustomDayProps type as we are not using a custom Day component

type ManagePayslipModalProps = {
  isOpen: boolean;
  onClose: () => void;
  payslipData: PayslipData;
  onReleaseSalary: ReleaseSalaryHandler;
  isReleasing: boolean;
  releaseError: string | null;

  attendanceRecords: AttendanceRecord[];
  breakdownItems: SalaryBreakdownItem[];

  lastReleasedPayslipEndDate: Date | null | undefined;
  lastReleasedTimestamp: Date | null | undefined;

  isModalDataLoading: boolean;
  modalDataError: string | null;
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

const formatDate = (dateInput: Date | string | null | undefined): string => {
  if (!dateInput) return "N/A";
  try {
    const d = new Date(dateInput);
    if (!isValid(d)) {
      console.warn("Invalid date passed to formatDate:", dateInput);
      return "Invalid Date";
    }
    return format(d, "MMM d, yyyy");
  } catch (e) {
    console.error("Error in formatDate:", e, { dateInput });
    return "Invalid Date Format";
  }
};

const formatDateRange = (start: Date | string, end: Date | string): string => {
  try {
    const validStart = typeof start === "string" ? new Date(start) : start;
    const validEnd = typeof end === "string" ? new Date(end) : end;

    if (
      !(validStart instanceof Date) ||
      !(validEnd instanceof Date) ||
      isNaN(validStart.getTime()) ||
      isNaN(validEnd.getTime())
    ) {
      console.warn("formatDateRange: Invalid date inputs", { start, end });
      return "Invalid Period";
    }

    const startDay = startOfDay(validStart);
    const endDay = startOfDay(validEnd);

    if (
      startDay.getMonth() === endDay.getMonth() &&
      startDay.getFullYear() === endDay.getFullYear()
    )
      return `${format(startDay, "MMM dd")} - ${format(endDay, "dd, yyyy")}`;
    else if (startDay.getFullYear() === endDay.getFullYear())
      return `${format(startDay, "MMM dd")} - ${format(endDay, "MMM dd, yyyy")}`;
    else return `${format(startDay, "PP")} - ${format(endDay, "PP")}`;
  } catch (e) {
    console.error("formatDateRange error:", e, { start, end });
    return "Error Formatting";
  }
};

const modifierStyles = {
  present: {
    backgroundColor: "#A7F3D0", // green-100
    color: "#065F46", // green-800
    fontWeight: "bold",
    borderRadius: "50%",
  },
  absent: {
    backgroundColor: "#FECACA", // red-100
    color: "#991B1B", // red-800
    textDecoration: "line-through",
    opacity: 0.9, // Adjusted for consistency
    borderRadius: "50%",
  },
  paid: {
    backgroundColor: "#E5E7EB", // gray-200
    color: "#9CA3AF", // gray-400
    textDecoration: "line-through",
  },
};

export default function ManagePayslipModal({
  isOpen,
  onClose,
  payslipData,
  onReleaseSalary,
  isReleasing,
  releaseError,

  attendanceRecords: rawAttendanceRecords,
  breakdownItems: rawBreakdownItems,

  lastReleasedPayslipEndDate,
  lastReleasedTimestamp,

  isModalDataLoading,
  modalDataError,
}: ManagePayslipModalProps) {
  // Period dates from payslipData for the calendar range
  // --- MOVE THESE DECLARATIONS UP ---
  const periodStartDate = useMemo(() => {
    const date = new Date(payslipData.periodStartDate);
    return isValid(date) ? date : undefined;
  }, [payslipData.periodStartDate]);

  const periodEndDate = useMemo(() => {
    const date = new Date(payslipData.periodEndDate);
    return isValid(date) ? date : undefined;
  }, [payslipData.periodEndDate]);
  // --- END MOVE ---

  const initialMonth = useMemo(() => {
    const endDate =
      payslipData.periodEndDate instanceof Date &&
      !isNaN(payslipData.periodEndDate.getTime())
        ? payslipData.periodEndDate
        : null;
    const startDate =
      payslipData.periodStartDate instanceof Date &&
      !isNaN(payslipData.periodStartDate.getTime())
        ? payslipData.periodStartDate
        : null;
    return startOfMonth(endDate || startDate || new Date());
  }, [payslipData.periodEndDate, payslipData.periodStartDate]);

  const [currentMonth, setCurrentMonth] = useState<Date>(initialMonth);

  useEffect(() => {
    const newInitialMonth = startOfMonth(
      new Date(payslipData.periodEndDate) ||
        new Date(payslipData.periodStartDate) ||
        new Date(),
    );
    if (
      isValid(newInitialMonth) &&
      !isEqual(startOfMonth(currentMonth), newInitialMonth)
    ) {
      setCurrentMonth(newInitialMonth);
    }
  }, [payslipData.id, payslipData.periodEndDate, payslipData.periodStartDate]);

  const handleReleaseClick = () => {
    if (isReleasing || payslipData.status !== PayslipStatus.PENDING) return;
    onReleaseSalary(payslipData.id);
  };

  const attendanceCountingStartDate = useMemo(() => {
    if (
      !lastReleasedPayslipEndDate ||
      !isValid(new Date(lastReleasedPayslipEndDate))
    ) {
      const payslipStart = new Date(payslipData.periodStartDate);
      return isValid(payslipStart) ? startOfDay(payslipStart) : new Date(0);
    }
    return startOfDay(addDays(new Date(lastReleasedPayslipEndDate), 1));
  }, [lastReleasedPayslipEndDate, payslipData.periodStartDate]);

  const filteredAttendanceRecordsForDisplay = useMemo(() => {
    if (!rawAttendanceRecords) return [];
    const startDate = attendanceCountingStartDate;
    return rawAttendanceRecords.filter((r) => {
      const recordDate = new Date(r.date);
      return (
        isValid(recordDate) && !isBefore(startOfDay(recordDate), startDate)
      );
    });
  }, [rawAttendanceRecords, attendanceCountingStartDate]);

  // Filtered Present and Absent days for the calendar modifiers
  const presentDays = useMemo(
    () =>
      filteredAttendanceRecordsForDisplay
        ?.filter((r) => r.isPresent)
        .map((r) => startOfDay(new Date(r.date))) // Ensure startOfDay for comparison consistency
        .filter(isValid) ?? [],
    [filteredAttendanceRecordsForDisplay],
  );

  const absentDays = useMemo(
    () =>
      filteredAttendanceRecordsForDisplay
        ?.filter((r) => !r.isPresent)
        .map((r) => startOfDay(new Date(r.date))) // Ensure startOfDay for comparison consistency
        .filter(isValid) ?? [],
    [filteredAttendanceRecordsForDisplay],
  );

  // Calculate days that are within the nominal payslip period BUT are already paid
  const paidDays = useMemo(() => {
    // Access periodStartDate and periodEndDate here (now declared above)
    if (!periodStartDate || !periodEndDate || !lastReleasedPayslipEndDate)
      return [];

    const start = startOfDay(new Date(periodStartDate));
    const end = startOfDay(new Date(periodEndDate));
    const lastPaidEnd = startOfDay(new Date(lastReleasedPayslipEndDate));

    const paidDates: Date[] = [];
    let currentDate = start;

    // Iterate from the start of the payslip period up to the last paid date (inclusive)
    // Ensure we don't go beyond the payslip's own end date
    while (
      isValid(currentDate) &&
      !isAfter(currentDate, end) &&
      !isAfter(currentDate, lastPaidEnd)
    ) {
      // Only add the date if it's within the nominal payslip period and on or before the last paid date
      // The loop condition handles being <= lastPaidEnd, and the outer loop handles <= nominalPeriodEnd
      if (!isBefore(currentDate, start)) {
        // Ensure it's not before the nominal start just in case
        paidDates.push(currentDate);
      }
      currentDate = addDays(currentDate, 1);
    }
    return paidDates;
  }, [periodStartDate, periodEndDate, lastReleasedPayslipEndDate]); // Dependencies are now correct

  const commissionFilteringTimestamp = useMemo(() => {
    if (!lastReleasedTimestamp || !isValid(new Date(lastReleasedTimestamp))) {
      const payslipStart = new Date(payslipData.periodStartDate);
      return isValid(payslipStart) ? payslipStart : new Date(0);
    }
    return new Date(lastReleasedTimestamp);
  }, [lastReleasedTimestamp, payslipData.periodStartDate]);

  const filteredBreakdownItemsForDisplay = useMemo(() => {
    if (!rawBreakdownItems) return [];
    const cutoffTimestamp = commissionFilteringTimestamp;

    return rawBreakdownItems.filter((item) => {
      if (!item.completedAt) return false;
      const itemTimestamp = new Date(item.completedAt);
      if (!isValid(itemTimestamp)) return false;

      return isAfter(itemTimestamp, cutoffTimestamp);
    });
  }, [rawBreakdownItems, commissionFilteringTimestamp]);

  // We no longer need a separate lastPaidPeriodEndUTC memo, as the paidDays memo calculates the dates directly

  // Removed getDayCellClasses helper function

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <DialogTitle>
          {payslipData.status === PayslipStatus.PENDING
            ? "Manage Payslip"
            : "Payslip Details"}
        </DialogTitle>
      }
      containerClassName="relative m-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-gray-50 shadow-xl flex flex-col"
    >
      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-10 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
        aria-label="Close modal"
      >
        <X size={20} />
      </button>

      <div className="flex-grow space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
          <h3 className="mb-2 text-base font-semibold text-gray-800 sm:text-lg">
            Payslip Summary for {payslipData.employeeName}
          </h3>
          <p className="text-sm text-gray-600">
            Period:{" "}
            {periodStartDate && periodEndDate
              ? formatDateRange(periodStartDate, periodEndDate)
              : "Invalid Period Dates"}
          </p>
          {payslipData.status === PayslipStatus.RELEASED &&
            payslipData.releasedDate && (
              <p className="text-sm text-green-600">
                Released: {format(new Date(payslipData.releasedDate), "PPpp")}
              </p>
            )}
          <div className="mt-2 border-t pt-2 text-xs italic text-gray-500">
            Attendance counted from:{" "}
            {attendanceCountingStartDate && isValid(attendanceCountingStartDate)
              ? format(attendanceCountingStartDate, "PP")
              : "Beginning (No prior release)"}
            <br /> Commissions counted from:{" "}
            {commissionFilteringTimestamp &&
            isValid(commissionFilteringTimestamp)
              ? format(commissionFilteringTimestamp, "PPpp")
              : "Beginning (No prior release)"}
          </div>

          <div className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-sm">
            <p className="flex justify-between">
              <span>Base Salary:</span>{" "}
              <span>{formatCurrency(payslipData.baseSalary)}</span>
            </p>
            <p className="flex justify-between">
              <span>Total Commissions:</span>{" "}
              <span className="font-medium text-green-600">
                (+) {formatCurrency(payslipData.totalCommissions)}
              </span>
            </p>
            <p className="flex justify-between">
              <span>Total Bonuses:</span>{" "}
              <span className="font-medium text-green-600">
                (+) {formatCurrency(payslipData.totalBonuses)}
              </span>
            </p>
            <p className="flex justify-between">
              <span>Total Deductions:</span>{" "}
              <span className="font-medium text-red-600">
                (-) {formatCurrency(payslipData.totalDeductions)}
              </span>
            </p>
            <p className="mt-2 flex justify-between border-t-2 border-gray-300 pt-2 text-base font-bold text-blue-700">
              <span>Net Pay:</span>
              <span>{formatCurrency(payslipData.netPay)}</span>
            </p>
          </div>
        </div>

        {isModalDataLoading && (
          <div className="flex items-center justify-center rounded border border-gray-200 bg-white p-6 text-gray-500 shadow-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading details...
          </div>
        )}
        {modalDataError && !isModalDataLoading && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 shadow-sm">
            <AlertCircle size={18} /> <span>{modalDataError}</span>
          </div>
        )}

        {!isModalDataLoading && !modalDataError && (
          <>
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                Attendance ({format(currentMonth, "MMMM yyyy")})
              </h4>
              <div className="flex flex-col items-center">
                {periodStartDate && periodEndDate ? (
                  <DayPicker
                    key={currentMonth.toISOString()}
                    showOutsideDays
                    fixedWeeks
                    month={currentMonth}
                    onMonthChange={setCurrentMonth}
                    fromDate={periodStartDate}
                    toDate={periodEndDate}
                    modifiers={{
                      // Pass the filtered days as modifiers
                      present: presentDays,
                      absent: absentDays,
                      paid: paidDays, // New modifier for paid days
                    }}
                    // Use modifiersStyles to apply styles based on the modifiers
                    modifiersStyles={modifierStyles}
                    className="text-sm [&_button:focus]:ring-1 [&_button:focus]:ring-offset-1 [&_button]:rounded-full [&_button]:border-0"
                    captionLayout="dropdown"
                    fromYear={periodStartDate.getFullYear()}
                    toYear={periodEndDate.getFullYear()}
                    // Remove custom components.Day renderer
                    // components={{ Day: ... }}
                  />
                ) : (
                  <p className="py-4 text-center italic text-red-600">
                    Cannot display calendar due to invalid period dates.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: modifierStyles.present.backgroundColor,
                      }}
                    ></span>{" "}
                    Present ({presentDays.length})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: modifierStyles.absent.backgroundColor,
                      }}
                    ></span>{" "}
                    Absent ({absentDays.length})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: modifierStyles.paid.backgroundColor, // Use paid modifier color
                      }}
                    ></span>{" "}
                    Paid/Covered ({paidDays.length}){" "}
                    {/* Add count for paid days */}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-center text-[0.7rem] italic text-gray-500">
                Calendar shows attendance within the payslip period (
                {periodStartDate && periodEndDate
                  ? formatDateRange(periodStartDate, periodEndDate)
                  : "Invalid Range"}
                ). Days covered by a previous payout (
                {lastReleasedPayslipEndDate
                  ? `up to ${format(new Date(lastReleasedPayslipEndDate), "PP")}`
                  : "none"}
                ) are marked as Paid/Covered.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                Commission Breakdown for Period
              </h4>
              {/* Display the filtered breakdown items */}
              {filteredBreakdownItemsForDisplay.length > 0 ? (
                <ul className="max-h-[250px] space-y-2 overflow-y-auto border-t border-gray-100 pr-1 pt-2">
                  {filteredBreakdownItemsForDisplay.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-gray-100 bg-gray-50/50 p-2.5 text-xs shadow-sm"
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
                          <PhilippinePeso size={10} /> Price:{" "}
                          {formatCurrency(item.servicePrice)}
                        </p>
                        <p className="flex items-center gap-1">
                          <CalendarDays size={10} /> Date Served:{" "}
                          {format(new Date(item.completedAt!), "PPpp")}
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
                  {rawBreakdownItems?.length > 0 &&
                  commissionFilteringTimestamp &&
                  isValid(commissionFilteringTimestamp)
                    ? `No commissions earned after ${format(commissionFilteringTimestamp, "PPpp")}.`
                    : "No commissions earned yet in this period."}
                </p>
              )}
              <p className="mt-2 text-center text-[0.7rem] italic text-gray-500">
                Commissions included are those completed after{" "}
                {commissionFilteringTimestamp &&
                isValid(commissionFilteringTimestamp)
                  ? format(commissionFilteringTimestamp, "PPpp")
                  : "the employee's start date"}
                .
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-gray-200 bg-gray-100 p-4">
        <div className="flex-grow text-left">
          {releaseError && (
            <p className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle size={14} /> {releaseError}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            size="sm"
            disabled={isReleasing}
          >
            Close
          </Button>
          {payslipData.status === PayslipStatus.PENDING && (
            <Button
              type="button"
              onClick={handleReleaseClick}
              disabled={isReleasing || isModalDataLoading}
              size="sm"
              variant="primary"
              className="bg-green-600 hover:bg-green-700 focus-visible:ring-green-500"
            >
              {isReleasing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle size={16} className="mr-1.5" />
              )}
              {isReleasing ? "Releasing..." : "Release Salary"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
