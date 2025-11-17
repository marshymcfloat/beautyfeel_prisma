// File: components/ui/PreviewUserSalary.tsx
"use client";

import React from "react";
import Button from "../Buttons/Button";
import { Eye, History, Loader2, RefreshCcw } from "lucide-react";

// Helper function (remains the same)
// IMPORTANT: Assumes the input 'value' is an integer representing cents.
const formatCurrency = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  )
    value = 0;
  const formattedValue = value; // Divide by 100 to display in major currency unit
  return formattedValue.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

type PreviewUserSalaryProps = {
  // Now accepts the pre-calculated estimated gross pay
  estimatedGrossPay: number | null | undefined;

  onOpenDetails: () => void; // Opens the detailed modal
  onOpenHistory: () => void; // Opens payslip history modal
  isLoading: boolean; // Loading state from parent (AccountDashboardPage)
  onRefresh: () => void; // Function to trigger data refresh in parent
};

export default function PreviewUserSalary({
  estimatedGrossPay, // Use the passed calculated value
  onOpenDetails,
  onOpenHistory,
  isLoading,
  onRefresh,
}: PreviewUserSalaryProps) {
  return (
    <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
      <div>
        <div className="mb-1 flex items-center justify-between">
          {/* Display "Current Estimated Gross Pay" */}
          <h3 className="flex items-center text-base font-semibold text-gray-800">
            Current Est. Gross Pay
          </h3>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="rounded-full p-1 text-customDarkPink/80 transition hover:bg-customDarkPink/10 hover:text-customDarkPink disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Refresh salary details"
            type="button"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCcw size={18} />
            )}
          </button>
        </div>
        {/* Display the calculated value */}
        {isLoading ? (
          <div className="flex h-[40px] items-center justify-center py-3">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <p className="h-[40px] text-xl font-bold text-customDarkPink sm:text-2xl">
            {formatCurrency(estimatedGrossPay)}
          </p>
        )}
        {/* Removed the period note here, as the full details are in the modal */}
      </div>
      <div className="mt-3 flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0">
        {/* Button to open the detailed modal */}
        <Button
          size="sm"
          onClick={onOpenDetails}
          type="button"
          disabled={isLoading}
        >
          <Eye size={14} className="mr-1.5" />
          View Full Breakdown
        </Button>
        {/* Button to open history modal */}
        <Button
          size="sm"
          type="button"
          onClick={onOpenHistory}
          disabled={isLoading}
          invert
        >
          <History size={14} className="mr-1.5" />
          View Payslip History
        </Button>
      </div>
    </div>
  );
}
