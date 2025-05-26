"use client";

import React from "react";
import Button from "../Buttons/Button";
import { Eye, History, Loader2, RefreshCcw } from "lucide-react";

type PreviewUserSalaryProps = {
  salary: number | null | undefined;
  onOpenDetails: () => void;
  onOpenHistory: () => void;
  isLoading: boolean;
  onRefresh: () => void;
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
  onRefresh,
}: PreviewUserSalaryProps) {
  return (
    <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center text-base font-semibold text-gray-800">
            Your Current Salary
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
        {isLoading ? (
          <div className="flex h-[40px] items-center justify-center py-3">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <p className="h-[40px] text-xl font-bold text-customDarkPink sm:text-2xl">
            {formatCurrency(salary)}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0">
        <Button size="sm" onClick={onOpenDetails} disabled={isLoading}>
          <Eye size={14} className="mr-1.5" />
          View Current Details
        </Button>
        <Button size="sm" onClick={onOpenHistory} disabled={isLoading} invert>
          <History size={14} className="mr-1.5" />
          View History
        </Button>
      </div>
    </div>
  );
}
