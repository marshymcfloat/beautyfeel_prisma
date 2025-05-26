import React from "react";
import { ListChecks, RefreshCcw, Loader2 } from "lucide-react";
import { AvailedServicesProps } from "@/lib/Types";

type PreviewListedServicesProps = {
  checkedServices: AvailedServicesProps[];
  onOpenModal: () => void;
  isLoading: boolean; // This prop is used to show the internal loader
  onRefresh: () => void;
};

export default function PreviewListedServices({
  checkedServices,
  onOpenModal,
  isLoading,
  onRefresh,
}: PreviewListedServicesProps) {
  const checkedCount = checkedServices.length;

  if (isLoading) {
    // This conditional renders the internal loader
    return (
      <div className="flex h-[100px] items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 text-sm text-customBlack/70 shadow-sm backdrop-blur-sm">
        <Loader2 className="-ml-1 mr-3 h-5 w-5 animate-spin text-customDarkPink" />
        Loading services...
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
            disabled={isLoading}
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
            className={`inline-flex min-w-[70px] items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              checkedCount > 0
                ? "bg-customDarkPink text-customOffWhite"
                : "bg-customGray text-customBlack/80"
            }`}
          >
            {checkedCount} Item(s)
          </span>
        </div>
      </div>

      <button
        className="mb-1 w-full text-left text-sm text-customBlack/80 hover:underline disabled:cursor-not-allowed disabled:no-underline"
        onClick={onOpenModal}
        disabled={isLoading || checkedCount === 0}
        type="button"
      >
        {checkedCount > 0 ? (
          <>
            You have {checkedCount} service(s) checked out. Click to manage
            them.
          </>
        ) : (
          <>
            No services currently checked out. View the Work Queue to claim
            tasks.
          </>
        )}
      </button>
    </div>
  );
}
