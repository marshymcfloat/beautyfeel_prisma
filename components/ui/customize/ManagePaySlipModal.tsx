// src/components/ui/customize/ManagePaySlipModal.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { format, isValid, startOfMonth } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

// --- UI Components ---
import Modal from "@/components/Dialog/Modal"; // Adjust path
import DialogTitle from "@/components/Dialog/DialogTitle"; // Adjust path
import Button from "@/components/Buttons/Button"; // Adjust path
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  User,
  Tag,
  PhilippinePeso,
  CalendarDays,
  // Clock, // Clock icon might not be used anymore
  // Info, // Info icon might not be used anymore
  Receipt, // Icons
} from "lucide-react";

// --- Types ---
import {
  PayslipData,
  ReleaseSalaryHandler,
  AttendanceRecord, // Import needed types
  SalaryBreakdownItem,
  SALARY_COMMISSION_RATE, // Assuming this is defined correctly
  AccountData, // Assuming this is defined correctly
} from "@/lib/Types"; // Adjust path
import { PayslipStatus } from "@prisma/client";

// --- Props ---
type ManagePayslipModalProps = {
  isOpen: boolean;
  onClose: () => void;
  payslipData: PayslipData; // The core payslip data
  onReleaseSalary: ReleaseSalaryHandler;
  isReleasing: boolean; // Loading state specifically for the release action
  releaseError: string | null; // Error from the release action
  // --- Added Props for Historical Data Display ---
  attendanceRecords: AttendanceRecord[];
  breakdownItems: SalaryBreakdownItem[];
  isModalDataLoading: boolean; // Loading state for attendance/breakdown
  modalDataError: string | null; // Error fetching attendance/breakdown
};

// --- Helper Functions ---
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
// Updated formatDate to handle invalid dates more robustly
const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return "N/A";
  try {
    const d = new Date(date);
    // Check if the constructed date is valid
    if (!isValid(d)) {
      console.warn("Invalid date passed to formatDate:", date);
      return "Invalid Date";
    }
    return format(d, "MMM d, yyyy");
  } catch (e) {
    console.error("Error in formatDate:", e, { date });
    return "Invalid Date Format";
  }
};
const formatDateRange = (start: Date, end: Date): string => {
  if (
    !start ||
    !end ||
    !(start instanceof Date) ||
    !(end instanceof Date) ||
    isNaN(start.getTime()) ||
    isNaN(end.getTime())
  ) {
    console.warn("Invalid start or end date in formatDateRange:", {
      start,
      end,
    });
    return "Invalid Period";
  }

  try {
    const validStart = new Date(start);
    const validEnd = new Date(end);
    if (isNaN(validStart.getTime()) || isNaN(validEnd.getTime())) {
      console.warn("Invalid Date objects constructed in formatDateRange:", {
        validStart,
        validEnd,
      });
      return "Invalid Date Objects";
    }

    if (
      validStart.getMonth() === validEnd.getMonth() &&
      validStart.getFullYear() === validEnd.getFullYear()
    )
      return `${format(validStart, "MMM dd")} - ${format(validEnd, "dd, yyyy")}`;
    else if (validStart.getFullYear() === validEnd.getFullYear())
      return `${format(validStart, "MMM dd")} - ${format(validEnd, "MMM dd, yyyy")}`;
    else return `${format(validStart, "PP")} - ${format(validEnd, "PP")}`;
  } catch (e) {
    console.error("Error formatting date range:", e, { start, end });
    return "Error Formatting Period";
  }
};

// Calendar Styles
const modifierStyles = {
  present: {
    backgroundColor: "#A7F3D0", // green-200
    color: "#065F46", // green-800
    fontWeight: "bold",
    borderRadius: "50%",
  },
  absent: {
    backgroundColor: "#FECACA", // red-200
    color: "#991B1B", // red-800
    textDecoration: "line-through",
    opacity: 0.8,
    borderRadius: "50%",
  },
  // 'today' modifier is less critical in historical view, but can be kept
  // today: { fontWeight: 'bold', border: '1px solid currentColor' },
};

// --- Component ---
export default function ManagePayslipModal({
  isOpen,
  onClose,
  payslipData,
  onReleaseSalary,
  isReleasing,
  releaseError,
  // --- Destructure new props ---
  attendanceRecords,
  breakdownItems,
  isModalDataLoading,
  modalDataError,
}: ManagePayslipModalProps) {
  // --- State for Calendar Month ---
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
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
  });

  // Reset month when the payslip data changes
  useEffect(() => {
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
    setCurrentMonth(startOfMonth(endDate || startDate || new Date()));
  }, [payslipData.id, payslipData.periodEndDate, payslipData.periodStartDate]);

  const handleReleaseClick = () => {
    if (isReleasing || payslipData.status !== PayslipStatus.PENDING) return;
    onReleaseSalary(payslipData.id);
  };

  const presentDays = useMemo(
    () =>
      attendanceRecords
        ?.filter((r) => r.isPresent)
        .map((r) => new Date(r.date))
        .filter(isValid) ?? [],
    [attendanceRecords],
  );
  const absentDays = useMemo(
    () =>
      attendanceRecords
        ?.filter((r) => !r.isPresent)
        .map((r) => new Date(r.date))
        .filter(isValid) ?? [],
    [attendanceRecords],
  );

  const periodStartDate = useMemo(() => {
    const date = new Date(payslipData.periodStartDate);
    return isValid(date) ? date : undefined;
  }, [payslipData.periodStartDate]);

  const periodEndDate = useMemo(() => {
    const date = new Date(payslipData.periodEndDate);
    return isValid(date) ? date : undefined;
  }, [payslipData.periodEndDate]);

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
                      present: presentDays,
                      absent: absentDays,
                    }}
                    modifiersStyles={modifierStyles}
                    className="text-sm [&_button:focus]:ring-1 [&_button:focus]:ring-offset-1 [&_button]:rounded-full [&_button]:border-0"
                    captionLayout="dropdown" // Corrected: Use "dropdown"
                    fromYear={periodStartDate.getFullYear()}
                    toYear={periodEndDate.getFullYear()}
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
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                Commission Breakdown for Period
              </h4>
              {breakdownItems.length > 0 ? (
                <ul className="max-h-[250px] space-y-2 overflow-y-auto border-t border-gray-100 pr-1 pt-2">
                  {breakdownItems.map((item) => (
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
                          {formatCurrency(item.servicePrice)} (
                          {(SALARY_COMMISSION_RATE * 100).toFixed(0)}% rate)
                        </p>
                        <p className="flex items-center gap-1">
                          <CalendarDays size={10} /> Date:{" "}
                          {formatDate(item.completedAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center italic text-gray-500">
                  No commission details found for this period.
                </p>
              )}
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
