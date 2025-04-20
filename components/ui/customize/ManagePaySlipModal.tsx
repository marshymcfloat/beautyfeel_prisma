// src/components/ui/customize/ManagePaySlipModal.tsx
"use client";

import React from "react";
import { format, isValid } from "date-fns";
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
  Clock,
  Info,
  Receipt, // Icons
} from "lucide-react";

// --- Types ---
import {
  PayslipData,
  ReleaseSalaryHandler,
  AttendanceRecord, // Import needed types
  SalaryBreakdownItem,
  SALARY_COMMISSION_RATE,
  AccountData,
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
const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return "N/A";
  try {
    return format(new Date(date), "MMM d, yyyy");
  } catch {
    return "Invalid Date";
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
  )
    return "Invalid Period";
  try {
    if (
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear()
    )
      return `${format(start, "MMM dd")} - ${format(end, "dd, yyyy")}`;
    else if (start.getFullYear() === end.getFullYear())
      return `${format(start, "MMM dd")} - ${format(end, "MMM dd, yyyy")}`;
    else return `${format(start, "PP")} - ${format(end, "PP")}`;
  } catch {
    return "Invalid Period";
  }
};

// Calendar Styles (similar to ExpandedUserSalary)
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
    textDecoration: "line-through",
    opacity: 0.8,
    borderRadius: "50%",
  },
  today: { fontWeight: "bold" },
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
  const handleReleaseClick = () => {
    if (isReleasing || payslipData.status !== PayslipStatus.PENDING) return;
    onReleaseSalary(payslipData.id);
  };

  // Prepare calendar modifiers
  const presentDays = React.useMemo(
    () =>
      attendanceRecords
        ?.filter((r) => r.isPresent)
        .map((r) => new Date(r.date))
        .filter(isValid) ?? [],
    [attendanceRecords],
  );
  const absentDays = React.useMemo(
    () =>
      attendanceRecords
        ?.filter((r) => !r.isPresent)
        .map((r) => new Date(r.date))
        .filter(isValid) ?? [],
    [attendanceRecords],
  );
  const periodStartDate = payslipData.periodStartDate;
  const periodEndDate = payslipData.periodEndDate;

  // Basic account data from payslipData
  const accountData = payslipData.accountData;

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
      // Adjust container size if needed
      containerClassName="relative m-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-customOffWhite shadow-xl flex flex-col" // Increased max-w, added flex
    >
      {/* Close Button (Top Right) */}
      <button
        onClick={onClose}
        className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
        aria-label="Close modal"
      >
        <X size={20} />
      </button>
      {/* Main Scrollable Content */}
      <div className="flex-grow space-y-4 overflow-y-auto p-4 sm:p-6">
        {/* Payslip Summary */}
        <div className="rounded border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
          <h3 className="mb-2 text-base font-semibold text-gray-800">
            Payslip Summary for {payslipData.employeeName}
          </h3>
          <p className="text-sm text-gray-600">
            Period:{" "}
            {formatDateRange(
              payslipData.periodStartDate,
              payslipData.periodEndDate,
            )}
          </p>
          {payslipData.status === PayslipStatus.RELEASED &&
            payslipData.releasedDate && (
              <p className="text-sm text-green-600">
                Released: {format(new Date(payslipData.releasedDate), "PPpp")}
              </p>
            )}
          <div className="mt-2 space-y-1 border-t border-gray-200 pt-2 text-sm">
            <p className="flex justify-between">
              <span>Base Salary:</span>{" "}
              <span>{formatCurrency(payslipData.baseSalary)}</span>
            </p>
            <p className="flex justify-between">
              <span>Total Commissions:</span>{" "}
              <span className="text-green-600">
                (+) {formatCurrency(payslipData.totalCommissions)}
              </span>
            </p>
            <p className="flex justify-between">
              <span>Total Bonuses:</span>{" "}
              <span className="text-green-600">
                (+) {formatCurrency(payslipData.totalBonuses)}
              </span>
            </p>
            <p className="flex justify-between">
              <span>Total Deductions:</span>{" "}
              <span className="text-red-600">
                (-) {formatCurrency(payslipData.totalDeductions)}
              </span>
            </p>
            <p className="mt-1 flex justify-between border-t border-gray-300 pt-1 text-base font-bold text-blue-700">
              <span>Net Pay:</span>
              <span>{formatCurrency(payslipData.netPay)}</span>
            </p>
          </div>
        </div>

        {/* Loading/Error state for historical data */}
        {isModalDataLoading && (
          <div className="flex items-center justify-center py-6 text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading details...
          </div>
        )}
        {modalDataError && !isModalDataLoading && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={18} /> <span>{modalDataError}</span>
          </div>
        )}

        {/* Conditional display of Attendance and Breakdown */}
        {!isModalDataLoading && !modalDataError && (
          <>
            {/* Attendance Section */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                Attendance ({format(periodStartDate, "MMMM yyyy")})
              </h4>
              <div className="flex flex-col items-center">
                <DayPicker
                  showOutsideDays
                  fixedWeeks
                  month={periodStartDate}
                  fromDate={periodStartDate}
                  toDate={periodEndDate}
                  modifiers={{
                    present: presentDays,
                    absent: absentDays,
                    today: new Date(),
                  }}
                  modifiersStyles={modifierStyles}
                  className="text-sm" // Make calendar slightly smaller
                />
                <div className="mt-3 flex justify-center space-x-4 text-xs text-gray-600">
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

            {/* Commission Breakdown Section */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                Commission Breakdown for Period
              </h4>
              {breakdownItems.length > 0 ? (
                <ul className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                  {breakdownItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-gray-100 bg-white p-2.5 text-xs"
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="flex items-center gap-1.5 font-medium text-gray-800">
                          <Tag size={12} className="text-blue-500" />{" "}
                          {item.serviceTitle || "Unknown"}
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
                          {item.transactionDate
                            ? format(new Date(item.transactionDate), "PP")
                            : "N/A"}
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
      </div>{" "}
      {/* End Scrollable Content */}
      {/* Footer / Actions */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 p-4">
        {/* Release Error Display */}
        <div className="flex-grow text-left">
          {releaseError && (
            <p className="text-sm text-red-600">{releaseError}</p>
          )}
        </div>
        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={onClose}
            invert={true}
            size="sm"
            disabled={isReleasing}
          >
            Close
          </Button>
          {payslipData.status === PayslipStatus.PENDING && (
            <Button
              type="button"
              onClick={handleReleaseClick}
              disabled={isReleasing || isModalDataLoading} // Disable if releasing or details still loading
              size="sm"
              className="bg-green-600 text-white hover:bg-green-700" // Explicit styling for primary action
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
