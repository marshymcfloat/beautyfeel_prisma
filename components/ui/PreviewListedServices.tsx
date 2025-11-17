// File: components/ui/PreviewListedServices.tsx
"use client"; // Added use client

import React from "react";
import { ListChecks, RefreshCcw, Loader2 } from "lucide-react";
// Removed import of AvailedServicesProps as we no longer receive the array
// import { AvailedServicesProps } from "@/lib/Types"; // This line is no longer needed for this component's props

// Updated type definition for component props
type PreviewListedServicesProps = {
  // Receive the count directly instead of the array
  claimedUnitsCount: number;

  onOpenModal: () => void;
  isLoading: boolean; // Loading state for the source data in the parent
  onRefresh: () => void; // Function to trigger data refresh in the parent
};

export default function PreviewListedServices({
  claimedUnitsCount, // Receive claimedUnitsCount from props
  onOpenModal,
  isLoading,
  onRefresh,
}: PreviewListedServicesProps) {
  // No need to calculate checkedCount = checkedServices.length anymore
  // The count is passed directly via the claimedUnitsCount prop.

  // The isLoading prop comes from the parent (likely isLoadingTransactions)
  // It indicates that the source data for this list is being fetched.
  if (isLoading) {
    return (
      <div className="flex h-[100px] items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 text-sm text-customBlack/70 shadow-sm backdrop-blur-sm">
        <Loader2 className="-ml-1 mr-3 h-5 w-5 animate-spin text-customDarkPink" />
        Loading claimed services... {/* Updated loading message */}
      </div>
    );
  }

  return (
    <div className="min-w-md mx-auto h-full w-full rounded-lg border border-customGray/50 bg-customOffWhite p-4 text-left shadow-custom">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-customBlack">
          <ListChecks size={18} className="text-customDarkPink" /> Your Claimed
          Services
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading} // Disable if parent data is loading
            className="rounded-full p-1 text-customDarkPink/80 transition hover:bg-customDarkPink/10 hover:text-customDarkPink disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Refresh claimed services list"
            type="button"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCcw size={18} />
            )}
          </button>
          <span
            // Use claimedUnitsCount for styling
            className={`inline-flex min-w-[70px] items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              claimedUnitsCount > 0
                ? "bg-customDarkPink text-customOffWhite"
                : "bg-customGray text-customBlack/80"
            }`}
          >
            {claimedUnitsCount} Item(s) {/* Display claimedUnitsCount */}
          </span>
        </div>
      </div>

      <button
        className="mb-1 w-full text-left text-sm text-customBlack/80 hover:underline disabled:cursor-not-allowed disabled:no-underline"
        onClick={onOpenModal}
        // Disable if loading or count is zero
        disabled={isLoading || claimedUnitsCount === 0}
        type="button"
      >
        {/* Update message text */}
        {claimedUnitsCount > 0 ? (
          <>
            You have {claimedUnitsCount} claimed service item(s). Click to
            manage them.
          </>
        ) : (
          <>
            No services currently claimed by you. View the Work Queue to claim
            tasks.
          </>
        )}
      </button>
    </div>
  );
}
