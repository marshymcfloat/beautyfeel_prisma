"use client";

import React from "react";
import { Wallet, Eye } from "lucide-react"; // Example icons

type SalaryPreviewProps = {
  salary: number; // Current salary in cents
  onOpenDetails: () => void; // Function to open the detailed modal
  isLoading: boolean;
};

export default function PreviewUserSalary({
  salary,
  onOpenDetails,
  isLoading,
}: SalaryPreviewProps) {
  const formattedSalary = salary.toLocaleString("en-US", {
    style: "currency",
    currency: "PHP", // Adjust currency code as needed
  });

  return (
    <div className="mx-auto mt-4 w-full max-w-md rounded-lg border border-customDarkPink/30 bg-customOffWhite p-4 shadow-md transition hover:shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-customBlack">
          <Wallet size={18} />
          Your Salary
        </h2>
      </div>

      {isLoading ? (
        <div className="mx-auto my-2 h-8 w-3/4 animate-pulse rounded bg-customGray"></div>
      ) : (
        <p className="mb-4 text-center text-2xl font-bold text-customDarkPink">
          {formattedSalary}
        </p>
      )}

      <button
        onClick={onOpenDetails}
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-customDarkPink px-4 py-2 text-sm font-medium text-customOffWhite transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-customDarkPink focus:ring-offset-2 focus:ring-offset-customOffWhite disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="View salary details"
      >
        <Eye size={16} />
        View Details
      </button>
    </div>
  );
}
