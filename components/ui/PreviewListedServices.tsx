// src/components/ui/PreviewListedServices.tsx
import React from "react";
import { ListChecks } from "lucide-react";
import { AvailedServicesProps } from "@/lib/Types";

type PreviewListedServicesProps = {
  checkedServices: AvailedServicesProps[];
  onOpenModal: () => void;
  isLoading: boolean;
};

export default function PreviewListedServices({
  checkedServices,
  onOpenModal,
  isLoading,
}: PreviewListedServicesProps) {
  const checkedCount = checkedServices.length;

  if (isLoading) {
    return (
      <div className="flex h-[100px] items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite/80 p-4 text-sm text-customBlack/70 shadow-sm backdrop-blur-sm">
        <svg
          className="-ml-1 mr-3 h-5 w-5 animate-spin text-customDarkPink" // h-5 w-5 is already small
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        Loading services...
      </div>
    );
  }

  return (
    <button
      className="min-w-md mx-auto block w-full rounded-lg border border-customGray/50 bg-customWhiteBlue p-4 text-left shadow-custom transition hover:border-customDarkPink/50 hover:bg-customLightBlue/30 focus:outline-none focus:ring-2 focus:ring-customDarkPink focus:ring-opacity-50 disabled:cursor-not-allowed disabled:opacity-60"
      onClick={onOpenModal}
      disabled={checkedCount === 0}
      aria-label={`View your ${checkedCount} claimed service(s)`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-customBlack">
          <ListChecks size={18} className="text-customDarkPink" /> Your Claimed
          Services
        </h2>
        <span
          className={`inline-flex min-w-[70px] items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            checkedCount > 0
              ? "bg-customDarkPink text-customOffWhite"
              : "bg-customGray text-customBlack/80"
          }`}
        >
          {checkedCount} Item(s)
        </span>
      </div>

      {checkedCount > 0 ? (
        <p className="mb-1 text-sm text-customBlack/80">
          You have {checkedCount} service(s) checked out. Click to manage them.
        </p>
      ) : (
        <p className="mb-1 text-sm text-customBlack/60">
          No services currently checked out. View the Work Queue to claim tasks.
        </p>
      )}
    </button>
  );
}
