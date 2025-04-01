// components/ui/SalaryDetails.tsx (or your path)
"use client";

import React from "react";
import Button from "../Buttons/Button"; // Adjust path
import {
  X,
  TrendingUp,
  CalendarDays,
  User,
  Tag,
  PhilippinePeso,
} from "lucide-react"; // Icons
import { SalaryBreakdownItem, SALARY_COMMISSION_RATE } from "@/lib/Types";

type SalaryDetailsProps = {
  breakdownItems: SalaryBreakdownItem[];
  onClose: () => void;
  isLoading: boolean;
  currentTotalSalary: number; // Pass the total for comparison/context
};

export default function ExpandedUserSalary({
  breakdownItems,
  onClose,
  isLoading,
  currentTotalSalary,
}: SalaryDetailsProps) {
  const formatCurrency = (valueInCents: number) => {
    return valueInCents.toLocaleString("en-US", {
      style: "currency",
      currency: "PHP", // Adjust if needed
    });
  };

  // Calculate total from breakdown items for verification (optional)
  const calculatedTotal = breakdownItems.reduce(
    (sum, item) => sum + item.commissionEarned,
    0,
  );

  return (
    <>
      {/* List/Table of Salary Contributions */}
      <div className="mb-4 min-h-[200px] space-y-3 overflow-y-auto border-y border-customGray py-4 pr-1 md:max-h-[60vh]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-customBlack/70">
            Loading details...
          </div>
        ) : breakdownItems.length > 0 ? (
          // Using a list format for better responsiveness, table is also an option
          <ul className="space-y-3">
            {breakdownItems.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-customGray/50 bg-customWhiteBlue p-3 shadow-sm"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-customBlack">
                    <Tag size={14} /> {item.serviceTitle}
                  </span>
                  <span className="text-sm font-semibold text-green-700">
                    +{formatCurrency(item.commissionEarned)}
                  </span>
                </div>
                <div className="space-y-0.5 text-xs text-customBlack/70">
                  <p className="flex items-center gap-1.5">
                    <User size={12} /> Client: {item.customerName}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <PhilippinePeso size={12} /> Service Price:{" "}
                    {formatCurrency(item.servicePrice)} (
                    {(SALARY_COMMISSION_RATE * 100).toFixed(0)}% rate)
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CalendarDays size={12} />
                    Txn Date: {item.transactionDate.toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center italic text-customBlack/60">
            No salary breakdown details found.
          </p>
        )}
      </div>

      {!isLoading && breakdownItems.length > 0 && (
        // VVV TRY INCREASING THIS MARGIN VVV
        <div className="mb-6 rounded-md border border-customGray bg-customLightBlue p-3 text-sm text-customBlack">
          {" "}
          {/* Changed mb-5 to mb-6 (or try mb-8) */}
          <p className="flex justify-between">
            <span>Total Commission Shown:</span>
            <span className="font-semibold">
              {formatCurrency(calculatedTotal)}
            </span>
          </p>
          <p className="mt-1 flex justify-between border-t border-customGray pt-1">
            <span>Current Account Salary:</span>
            <span className="font-semibold">
              {formatCurrency(currentTotalSalary)}
            </span>
          </p>
          {/* Add a note if totals might differ due to other adjustments */}
          {calculatedTotal !== currentTotalSalary && (
            <p className="mt-1.5 text-xs italic text-customBlack/70">
              Note: Account total may include adjustments not shown here.
            </p>
          )}
          {/* ... rest of summary ... */}
        </div>
      )}

      {/* Close button */}
      <div className="flex h-[50px] justify-end border-t border-customGray pt-4 lg:pt-2">
        {" "}
        {/* Removed pt-4 */}
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}
