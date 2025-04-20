// src/components/ui/PreviewUserSalary.tsx
"use client";

import React from "react";
import Button from "../Buttons/Button"; // Adjust path
import { PhilippinePeso, Eye, History, Loader2 } from "lucide-react"; // Added History icon

type PreviewUserSalaryProps = {
  salary: number | null | undefined;
  onOpenDetails: () => void;
  onOpenHistory: () => void; // New prop for history modal
  isLoading: boolean; // Loading state for the salary value itself
};

const formatCurrency = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  )
    value = 0;
  // Assume value is smallest unit
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
};

export default function PreviewUserSalary({
  salary,
  onOpenDetails,
  onOpenHistory, // Destructure new prop
  isLoading,
}: PreviewUserSalaryProps) {
  return (
    <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
      <div>
        <h3 className="mb-1 flex items-center text-base font-semibold text-gray-800">
          Your Current Salary
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <p className="text-xl font-bold text-customDarkPink sm:text-2xl">
            {formatCurrency(salary)}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0">
        <Button size="sm" onClick={onOpenDetails} disabled={isLoading}>
          <Eye size={16} className="mr-1.5" />
          View Current Details
        </Button>
        {/* History Button */}
        <Button size="sm" onClick={onOpenHistory} disabled={isLoading} invert>
          <History size={16} className="mr-1.5" />
          View History
        </Button>
      </div>
    </div>
  );
}
