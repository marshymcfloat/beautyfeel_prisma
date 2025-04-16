// components/payslip/ManagePayslipModal.tsx
"use client";

import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  User,
  CalendarDays,
  Receipt, // Icon for payslip title/details
  Coins, // Icon for base salary
  Sparkles, // Icon for commissions/bonuses
  ArrowDownCircle, // Icon for deductions (optional)
  CircleDollarSign, // Icon for Net Pay
  CheckCircle2, // Icon for Released status
  Clock, // Icon for Pending status / Released Date
  Loader2, // Spinner icon
  ChevronDown, // Icon for expanding breakdown
  ChevronUp, // Icon for collapsing breakdown
  AlertCircle, // Icon for errors
} from "lucide-react";

// --- UI Components ---
import Modal from "@/components/Dialog/Modal"; // Import your Modal component (adjust path)
import DialogTitle from "@/components/Dialog/DialogTitle"; // Import DialogTitle (adjust path)
import Button from "@/components/Buttons/Button"; // Import your Button component (adjust path)

// --- Types ---
import {
  PayslipData,
  SalaryBreakdownItem, // Import if using breakdown feature
  ReleaseSalaryHandler,
} from "@/lib/Types"; // Adjust path

import { PayslipStatus } from "@prisma/client";

// --- Helper Functions ---
// Formats number (assumed smallest unit like centavos) to PHP currency string
const formatCurrency = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  ) {
    value = 0;
  }
  // Convert from smallest unit (e.g., centavos) to main unit (PHP) for display
  const amountInPHP = value;
  return amountInPHP.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (date: Date | null | undefined): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "N/A";
  try {
    return format(date, "PP p");
  } catch {
    // Format: Aug 15, 2024, 3:30 PM
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

interface ManagePayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslipData: PayslipData | null; // The specific payslip to display
  onReleaseSalary: ReleaseSalaryHandler; // Function called when 'Release' is clicked
  isLoading: boolean; // True when the release action is in progress
  releaseError?: string | null; // Error message from the release action, if any
}

// --- Main Modal Component ---
export default function ManagePayslipModal({
  isOpen,
  onClose,
  payslipData,
  onReleaseSalary,
  isLoading, // This is the loading state for the RELEASE action
  releaseError,
}: ManagePayslipModalProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Trigger the release action passed from the parent
  const handleReleaseClick = async () => {
    // Prevent action if no data, already loading, or not pending
    if (
      !payslipData ||
      isLoading ||
      payslipData.status !== PayslipStatus.PENDING
    ) {
      return;
    }
    // Parent component (ManagePayslips) handles the actual server call and state update
    try {
      await onReleaseSalary(payslipData.id);
      // Parent will typically close modal on success or handle state updates
    } catch (error) {
      // Error state is managed by parent and passed via `releaseError` prop
      console.error("Release action failed (reported by parent):", error);
    }
  };

  // Memoize derived values safely
  const totalDeductions = useMemo(
    () => payslipData?.totalDeductions ?? 0,
    [payslipData],
  );
  const totalBonuses = useMemo(
    () => payslipData?.totalBonuses ?? 0,
    [payslipData],
  );
  const breakdownItems = useMemo(
    () => payslipData?.breakdownItems ?? [],
    [payslipData],
  );

  // Render nothing if modal is not open
  if (!isOpen) {
    return null;
  }

  // Render loading state if modal is open but data is null (might happen briefly)
  if (!payslipData) {
    return (
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Loading Payslip..."
        size="lg"
      >
        <div className="flex h-60 items-center justify-center text-gray-500">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading details...
        </div>
      </Modal>
    );
  }

  // Determine if the payslip is pending release
  const isPending = payslipData.status === PayslipStatus.PENDING;

  return (
    <Modal
      isOpen={true} // Controlled by parent's state
      onClose={onClose}
      title={<DialogTitle>Manage Payslip</DialogTitle>} // Use DialogTitle component
      size="2xl" // Adjust size as needed for content
      contentClassName="p-0" // Handle padding internally
      containerClassName="relative m-auto flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg bg-gray-100 shadow-xl border border-gray-200"
    >
      {/* Modal Content Structure */}
      <div className="flex h-full flex-col">
        {/* 1. Header Info */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white p-4 md:p-5">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            {/* Employee & Period */}
            <div className="flex-grow">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-800 md:text-lg">
                <User size={18} /> {payslipData.employeeName}
              </h3>
              <p className="mt-1 flex items-center gap-2 text-xs text-gray-500 md:text-sm">
                <CalendarDays size={16} />
                {formatDateRange(
                  payslipData.periodStartDate,
                  payslipData.periodEndDate,
                )}
              </p>
            </div>
            {/* Status Badge */}
            <div
              className={`ml-auto inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium sm:ml-4 ${isPending ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"} `}
            >
              {isPending ? <Clock size={14} /> : <CheckCircle2 size={14} />}
              {payslipData.status}
            </div>
          </div>
          {/* Released Date Info */}
          {!isPending && payslipData.releasedDate && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <Clock size={12} /> Released:{" "}
              {formatDate(payslipData.releasedDate)}
            </p>
          )}
        </div>
        {/* Display Release Error if it exists */}
        {releaseError && (
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-red-200 bg-red-100 p-3 text-sm text-red-700">
            <AlertCircle size={16} />
            <span>Release Failed: {releaseError}</span>
          </div>
        )}
        {/* 2. Scrollable Main Content */}
        <div className="flex-grow space-y-4 overflow-y-auto p-4 md:p-6">
          {/* Financial Summary Card */}
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-3 md:gap-6">
            {/* Column 1 & 2: Earnings & Deductions */}
            <div className="space-y-3 md:col-span-2">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                Summary
              </h4>
              {/* Base Salary */}
              <div className="flex justify-between border-b pb-1">
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Coins size={16} /> Base Salary
                </span>
                <span className="font-medium text-gray-800">
                  {formatCurrency(payslipData.baseSalary)}
                </span>
              </div>
              {/* Commissions */}
              <div className="flex justify-between border-b pb-1">
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Sparkles size={16} /> Commissions
                </span>
                <span className="font-medium text-gray-800">
                  {formatCurrency(payslipData.totalCommissions)}
                </span>
              </div>
              {/* Optional Bonuses */}
              {totalBonuses > 0 && (
                <div className="flex justify-between border-b pb-1">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Sparkles size={16} /> Bonuses
                  </span>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(totalBonuses)}
                  </span>
                </div>
              )}
              {/* Optional Deductions */}
              {totalDeductions > 0 && (
                <div className="flex justify-between border-b pb-1 text-red-600">
                  <span className="flex items-center gap-1.5 text-sm">
                    <ArrowDownCircle size={16} /> Total Deductions
                  </span>
                  <span className="font-medium">
                    ({formatCurrency(totalDeductions)})
                  </span>
                </div>
              )}
            </div>

            {/* Column 3: Net Pay */}
            <div className="flex flex-col items-start justify-center space-y-1 border-t pt-4 md:items-end md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                Net Pay
              </span>
              <span className="text-2xl font-bold text-blue-600 md:text-3xl">
                {formatCurrency(payslipData.netPay)}
              </span>
              <span className="text-xs text-gray-500">Amount to Release</span>
            </div>
          </div>

          {/* Commission Breakdown (Collapsible) */}
          {breakdownItems.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="flex w-full items-center justify-between p-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                aria-expanded={showBreakdown}
              >
                <span className="flex items-center gap-2">
                  <Receipt size={16} /> Commission Details (
                  {breakdownItems.length})
                </span>
                {showBreakdown ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </button>
              {/* Breakdown Content */}
              {showBreakdown && (
                <div className="max-h-[250px] space-y-2 overflow-y-auto border-t border-gray-200 p-3">
                  {breakdownItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded border border-gray-100 p-2 text-xs hover:bg-gray-50"
                    >
                      <div className="flex flex-wrap justify-between gap-x-2 font-medium">
                        <span className="text-gray-800">
                          {item.serviceTitle}
                        </span>
                        <span className="text-green-600">
                          +{formatCurrency(item.commissionEarned)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-gray-500">
                        <span>Client: {item.customerName} | </span>
                        <span>Date: {formatDate(item.transactionDate)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="mt-2 border-t pt-2 text-right text-sm font-semibold">
                    Total Commission:{" "}
                    {formatCurrency(payslipData.totalCommissions)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>{" "}
        {/* End Scrollable Content */}
        {/* 3. Footer Actions */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-3 border-t border-gray-200 bg-gray-100 p-4">
          <Button type="button" onClick={onClose} invert={true} size="sm">
            Close
          </Button>
          {/* Only show Release button if status is PENDING */}
          {isPending && (
            <Button
              type="button"
              onClick={handleReleaseClick}
              disabled={isLoading} // Disable while release action is running
              size="sm"
              className="min-w-[130px]" // Ensure button doesn't jump size
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="mr-1.5 animate-spin" />{" "}
                  Releasing...
                </>
              ) : (
                "Release Salary"
              )}
            </Button>
          )}
          {/* Optional: Show confirmation text when already released */}
          {!isPending && (
            <span className="flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 size={16} /> Salary Released
            </span>
          )}
        </div>
      </div>{" "}
      {/* End Modal Content Flex Container */}
    </Modal>
  );
}
