// src/components/ui/PreviewUserSalary.tsx
"use client";

import React from "react";
import Button from "../Buttons/Button"; // Adjust path
import { Eye, History, Loader2 } from "lucide-react"; // PhilippinePeso was unused, History is used

type PreviewUserSalaryProps = {
  salary: number | null | undefined;
  onOpenDetails: () => void;
  onOpenHistory: () => void;
  isLoading: boolean;
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
  });
};

export default function PreviewUserSalary({
  salary,
  onOpenDetails,
  onOpenHistory,
  isLoading,
}: PreviewUserSalaryProps) {
  return (
    <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
      <div>
        <h3 className="mb-1 flex items-center text-base font-semibold text-gray-800">
          {/* Optional: Add a small icon before "Your Current Salary" if desired, e.g., Wallet icon */}
          {/* <Wallet size={18} className="mr-2 text-customDarkPink/70" /> */}
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
          <Eye size={14} className="mr-1.5" />{" "}
          {/* Reduced size from 16 to 14 */}
          View Current Details
        </Button>
        <Button size="sm" onClick={onOpenHistory} disabled={isLoading} invert>
          <History size={14} className="mr-1.5" />{" "}
          {/* Reduced size from 16 to 14 */}
          View History
        </Button>
      </div>
    </div>
  );
}
