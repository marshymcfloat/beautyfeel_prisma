import React from "react";
import { ListChecks } from "lucide-react"; // Example icon

// --- Use the SAME Type Definitions ---
type AvailedServicesProps = {
  /* ... same as above ... */
};

type PreviewListedServicesProps = {
  // Expects only services CHECKED by the current user
  checkedServices: AvailedServicesProps[];
  onOpenModal: () => void; // Function to open the detailed modal
};

export default function PreviewListedServices({
  checkedServices,
  onOpenModal,
}: PreviewListedServicesProps) {
  const checkedCount = checkedServices.length;

  return (
    <button // Make the whole thing clickable
      className="min-w-md mx-auto mt-4 block rounded-lg border border-slate-200 bg-blue-50 p-4 text-left shadow-md transition hover:border-blue-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:cursor-not-allowed disabled:opacity-60 lg:w-[450px] disabled:lg:max-w-[450px] dark:bg-blue-900/50"
      onClick={onOpenModal}
      disabled={checkedCount === 0} // Disable if nothing is checked
      aria-label={`View your ${checkedCount} claimed service(s)`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-blue-800 dark:text-blue-200">
          <ListChecks size={18} /> {/* Icon */}
          Your Claimed Services
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${checkedCount > 0 ? "min-w-[70px] bg-blue-600 text-white" : "min-w-[70px] bg-gray-400 text-gray-800"}`}
        >
          {checkedCount} Item(s)
        </span>
      </div>

      {checkedCount > 0 ? (
        <p className="mb-1 text-sm text-blue-700 dark:text-blue-300">
          You have {checkedCount} service(s) checked out. Click to manage them.
        </p>
      ) : (
        <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
          No services currently checked out. View the Work Queue to claim tasks.
        </p>
      )}
    </button>
  );
}
