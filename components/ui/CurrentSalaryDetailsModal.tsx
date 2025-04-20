// src/components/ui/CurrentSalaryDetailsModal.tsx
"use client";

import React, { useMemo } from "react";
import {
  format,
  isValid,
  endOfDay as dfnsEndOfDay,
  isAfter,
  addDays,
  startOfDay,
} from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

// --- UI Components ---
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "../Buttons/Button";
import {
  Loader2,
  AlertCircle,
  X,
  User,
  Tag,
  PhilippinePeso,
  CalendarDays,
} from "lucide-react";

// --- Types ---
import {
  SalaryBreakdownItem,
  AttendanceRecord,
  AccountData,
  SALARY_COMMISSION_RATE,
} from "@/lib/Types"; // Adjust path

// --- Prop Types ---
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
  lastReleasedPayslipEndDate?: Date | null; // For Attendance Filtering
  lastReleasedTimestamp?: Date | null; // For Commission Filtering
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
  // Assumes value is smallest unit (e.g., centavos)
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Calendar Styles
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
}: CurrentSalaryDetailsModalProps) {
  // Filter DATE for Attendance (Start of day AFTER last release end date)
  const filterAttendanceStartDate = useMemo(() => {
    if (!lastReleasedPayslipEndDate) return null;
    const lastDate = new Date(lastReleasedPayslipEndDate);
    return isValid(lastDate) ? startOfDay(addDays(lastDate, 1)) : null;
  }, [lastReleasedPayslipEndDate]);

  // Filter TIMESTAMP for Commissions (Exact release time)
  const filterCommissionTimestampAfter = useMemo(() => {
    return lastReleasedTimestamp ? new Date(lastReleasedTimestamp) : null;
  }, [lastReleasedTimestamp]);

  // Filter attendance records based on DATE
  const presentDays = useMemo(() => {
    return (
      currentAttendanceRecords
        ?.filter((r) => {
          const recordDate = new Date(r.date);
          return (
            isValid(recordDate) &&
            r.isPresent &&
            (!filterAttendanceStartDate ||
              recordDate >= filterAttendanceStartDate)
          );
        })
        .map((r) => new Date(r.date)) ?? []
    );
  }, [currentAttendanceRecords, filterAttendanceStartDate]);

  const absentDays = useMemo(() => {
    return (
      currentAttendanceRecords
        ?.filter((r) => {
          const recordDate = new Date(r.date);
          return (
            isValid(recordDate) &&
            !r.isPresent &&
            (!filterAttendanceStartDate ||
              recordDate >= filterAttendanceStartDate)
          );
        })
        .map((r) => new Date(r.date)) ?? []
    );
  }, [currentAttendanceRecords, filterAttendanceStartDate]);

  // Filter Commission Breakdown Items based on TIMESTAMP
  const filteredBreakdownItems = useMemo(() => {
    // console.log("Filtering commissions. Filter Timestamp After:", filterCommissionTimestampAfter);
    return (
      currentBreakdownItems?.filter((item) => {
        if (!item.transactionDate) {
          /* console.log(`Comm Item ${item.id} skipped (no date)`); */ return false;
        }
        const itemDate = new Date(item.transactionDate);
        if (!isValid(itemDate)) {
          /* console.log(`Comm Item ${item.id} skipped (invalid date: ${item.transactionDate})`); */ return false;
        }
        const shouldKeep =
          !filterCommissionTimestampAfter ||
          isAfter(itemDate, filterCommissionTimestampAfter);
        // console.log(`Comm Item ${item.id} (${itemDate.toISOString()}) | Keep: ${shouldKeep}`);
        return shouldKeep;
      }) ?? []
    );
  }, [currentBreakdownItems, filterCommissionTimestampAfter]);

  // Calculate totals based on FILTERED data
  const calculatedBreakdownTotal = useMemo(() => {
    return filteredBreakdownItems.reduce(
      (sum, item) => sum + (item.commissionEarned || 0),
      0,
    );
  }, [filteredBreakdownItems]);

  const baseDailyRate = accountData?.dailyRate ?? 0;
  const displayMonth = currentPeriodStartDate
    ? new Date(currentPeriodStartDate)
    : new Date(); // Ensure Date object
  const presentCount = presentDays.length;
  const absentCount = absentDays.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <DialogTitle>
          {" "}
          Current Salary Details (
          {currentPeriodStartDate
            ? format(new Date(currentPeriodStartDate), "MMMM yyyy")
            : "Loading..."}
          ){" "}
        </DialogTitle>
      }
      containerClassName="relative m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-customOffWhite shadow-xl flex flex-col"
    >
      <button
        onClick={onClose}
        className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
        aria-label="Close modal"
      >
        {" "}
        <X size={20} />{" "}
      </button>

      <div className="flex-grow space-y-4 overflow-y-auto p-4 sm:p-6">
        {isLoading && (
          <div className="flex h-[300px] items-center justify-center text-gray-500">
            {" "}
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading current
            details...{" "}
          </div>
        )}
        {error && !isLoading && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {" "}
            <AlertCircle size={18} /> <span>{error}</span>{" "}
          </div>
        )}
        {!isLoading && !error && (
          <>
            {/* Attendance Section */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                {" "}
                Current Period Attendance{" "}
              </h4>
              {currentPeriodStartDate &&
              currentPeriodEndDate &&
              isValid(new Date(currentPeriodStartDate)) &&
              isValid(new Date(currentPeriodEndDate)) ? (
                <div className="flex flex-col items-center">
                  <DayPicker
                    showOutsideDays
                    fixedWeeks
                    month={displayMonth}
                    fromDate={new Date(currentPeriodStartDate)} // Ensure Date object
                    toDate={new Date(currentPeriodEndDate)} // Ensure Date object
                    modifiers={{
                      present: presentDays,
                      absent: absentDays,
                      today: new Date(),
                    }}
                    modifiersStyles={modifierStyles}
                    className="text-sm"
                  />
                  <div className="mt-3 flex justify-center space-x-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{
                          backgroundColor:
                            modifierStyles.present.backgroundColor,
                        }}
                      ></span>{" "}
                      Present ({presentCount})
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{
                          backgroundColor:
                            modifierStyles.absent.backgroundColor,
                        }}
                      ></span>{" "}
                      Absent ({absentCount})
                    </span>
                  </div>
                  <p className="mt-2 text-center text-xs italic text-gray-500">
                    Showing attendance since last payout day.
                  </p>
                </div>
              ) : (
                <p className="py-4 text-center italic text-gray-500">
                  Period dates not available.
                </p>
              )}
            </div>

            {/* Commission Breakdown Section */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
                {" "}
                Current Period Commissions{" "}
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
                          <CalendarDays size={10} /> Date:{" "}
                          {item.transactionDate &&
                          isValid(new Date(item.transactionDate))
                            ? format(new Date(item.transactionDate), "PPp")
                            : "N/A"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center italic text-gray-500">
                  {currentBreakdownItems.length > 0
                    ? "No commissions earned after last payout time."
                    : "No commissions earned yet in this period."}
                </p>
              )}
            </div>

            {/* Summary Section */}
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
                  <span>Days Present (Current Period):</span>{" "}
                  <span className="font-semibold text-green-700">
                    {presentCount}
                  </span>
                </p>
                <p className="mt-0.5 flex justify-between">
                  <span>Days Absent (Current Period):</span>{" "}
                  <span className="font-semibold text-red-700">
                    {absentCount}
                  </span>
                </p>
              </div>
              <p className="mt-1.5 text-xs italic text-gray-500">
                {" "}
                Note: Final salary calculated server-side upon payslip
                generation.{" "}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-gray-200 bg-gray-50 p-4">
        <Button type="button" onClick={onClose} invert={true} size="sm">
          {" "}
          Close{" "}
        </Button>
      </div>
    </Modal>
  );
}
