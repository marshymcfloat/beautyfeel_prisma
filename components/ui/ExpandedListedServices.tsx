// File: components/ui/ExpandedListedServices.tsx
"use client";
import React, { useEffect, useCallback, useMemo, useState } from "react"; // Import useState
import Button from "../Buttons/Button";
import { Socket } from "socket.io-client";
import {
  AvailedServicesProps,
  AvailedServiceUnitProps,
  ClientAccountIncluded,
  TransactionProps,
  TransactionPropsForTransactions,
} from "@/lib/Types";
import {
  CheckCircle, // Icon for served unit status
  Circle, // Icon for not served unit status
  AlertCircle, // Icon for errors
  UserCheck, // Icon for checked by
  UserMinus, // Icon for uncheck (not used in this modal)
  CalendarDays, // Icon for completed at time
  Loader2, // Spinner icon
  Tag, // Service tag icon
  Info, // Info icon (e.g., served by other, processing)
  RefreshCcw, // Refresh icon
  CircleDashed, // Pending status icon (optional, using text status)
  Clock, // Transaction booked time icon
} from "lucide-react"; // Import Clock icon
import { Status } from "@prisma/client";
import { isValid } from "date-fns"; // Import isValid

interface ExpandedListedServicesProps {
  // Component now receives an array of Transactions that contain claimed units
  transactionsWithClaimedUnits: TransactionPropsForTransactions[];
  accountId: string;
  socket: Socket | null;
  onClose: () => void;
  processingServeActions: Set<string>; // Still tracks unit IDs being processed
  setProcessingServeActions: React.Dispatch<React.SetStateAction<Set<string>>>;
  onRefresh: () => void;
  isLoading: boolean; // Still indicates loading state of the source data (allPendingTransactions)
}

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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Helper to get the current assigned user (Checked or Served) for display
// This helper is still useful for displaying who is assigned, even if we only
// filter to show units assigned to the current user.
const getAssignedUser = (
  unit: AvailedServiceUnitProps,
): ClientAccountIncluded | null => {
  if (unit.status === Status.DONE && unit.servedBy) {
    return unit.servedBy;
  }
  if (unit.status === Status.PENDING && unit.checkedBy) {
    return unit.checkedBy;
  }
  return null;
};

export default function ExpandedListedServices({
  transactionsWithClaimedUnits, // Receive the list of transactions
  accountId,
  socket,
  onClose,
  processingServeActions,
  setProcessingServeActions,
  onRefresh,
  isLoading,
}: ExpandedListedServicesProps) {
  const [unitErrors, setUnitErrors] = React.useState<Map<string, string>>(
    new Map(),
  );

  // --- NEW STATE: Locally managed list of transactions to display ---
  // This state holds the full transaction structure, filtered at the transaction level
  const [displayedTransactions, setDisplayedTransactions] = useState<
    TransactionPropsForTransactions[]
  >([]);
  // --- END NEW STATE ---

  const clearUnitError = useCallback((unitId: string) => {
    setUnitErrors((prev) => {
      const next = new Map(prev);
      if (next.has(unitId)) {
        console.log(
          `[ExpandedListedServices] Clearing error for unit ${unitId}.`,
        );
        next.delete(unitId);
        return next;
      }
      return prev;
    });
  }, []); // No dependencies needed, setUnitErrors is stable

  // --- EFFECT: Initialize and update local state when parent prop changes ---
  // This effect runs when the parent's transactionsWithClaimedUnits prop changes.
  // It takes the prop, sorts it, and sets the local displayedTransactions state.
  useEffect(() => {
    if (!transactionsWithClaimedUnits) {
      console.log(
        "[ExpandedListedServices] Prop transactionsWithClaimedUnits is null. Setting displayedTransactions to empty.",
      );
      setDisplayedTransactions([]);
      return;
    }
    console.log(
      "[ExpandedListedServices] Prop transactionsWithClaimedUnits changed. Initializing/Updating displayedTransactions.",
    );

    // Create a mutable copy and sort the transactions.
    // The units *within* these transactions are NOT filtered here; they are all included as fetched.
    const sortedTransactions = [...transactionsWithClaimedUnits].sort(
      (a, b) => {
        const bookedForA = a.bookedFor?.getTime() ?? 0; // 0 means sort null dates first
        const bookedForB = b.bookedFor?.getTime() ?? 0;
        return bookedForA - bookedForB;
      },
    );

    // Set the sorted transactions array to the local state
    setDisplayedTransactions(sortedTransactions);

    // Note: The filtering of which *units* are claimed by the user for display logic
    // happens in the JSX rendering loop itself, not when setting the state.
    // This ensures we render ALL units, but highlight/action only the claimed ones.
  }, [transactionsWithClaimedUnits, Status]); // Dependencies: Update when the parent prop changes or Status enum (stable)
  // --- END EFFECT ---

  // --- Socket Listeners ---
  // This handler receives a single updated AvailedService object with its units.
  // It now updates the relevant AvailedService within the local 'displayedTransactions' state.
  const handleUpdate = useCallback(
    (
      updatedService: AvailedServicesProps & {
        units: AvailedServiceUnitProps[];
      },
    ) => {
      console.log(
        "[ExpandedListedServices] Socket: Received availedServiceUpdated for service:",
        updatedService.id,
      );
      // === Wrap state updates in setTimeout(0) ===
      // This is crucial to prevent "update while rendering" errors
      setTimeout(() => {
        // --- Phase 1: Clear processing state for units in the updated service ---
        setProcessingServeActions((prev) => {
          const next = new Set(prev);
          let changed = false;
          if (updatedService.units) {
            updatedService.units.forEach((unit) => {
              if (prev.has(unit.id)) {
                console.log(
                  `[ExpandedListedServices] Socket: Clearing processing state for unit ${unit.id} due to update.`,
                );
                next.delete(unit.id);
                changed = true;
                // No need to clear unitErrors here, the next render cycle will hide it if the unit state changed successfully
              }
            });
          }
          return changed ? next : prev;
        });

        // --- Phase 2: Update the displayedTransactions state ---
        setDisplayedTransactions((currentDisplayedTransactions) => {
          // Find the transaction that contains this updated AvailedService
          const transactionIndex = currentDisplayedTransactions.findIndex(
            (tx) => tx.id === updatedService.transactionId,
          );

          // If the transaction is found in the currently displayed list
          if (transactionIndex > -1) {
            let nextDisplayedTransactions = [...currentDisplayedTransactions]; // Copy transactions array
            let currentTransaction = {
              ...nextDisplayedTransactions[transactionIndex],
            }; // Copy the transaction object

            // Find the index of the updated AvailedService within that transaction
            const serviceIndex = currentTransaction.availedServices.findIndex(
              (as) => as.id === updatedService.id,
            );

            // If the AvailedService is found within the transaction
            if (serviceIndex > -1) {
              // Update the specific AvailedService object with the new data (including units)
              console.log(
                `[ExpandedListedServices] Socket: Updating existing service ${updatedService.id} within transaction ${currentTransaction.id} in displayed state.`,
              );

              // Update the AvailedServices array immutably
              currentTransaction.availedServices =
                currentTransaction.availedServices.map(
                  (as) =>
                    as.id === updatedService.id
                      ? {
                          ...as,
                          ...updatedService,
                          units: updatedService.units,
                        } // Merge and replace units
                      : as, // Keep other services
                );

              // Update the transaction object in the transactions array
              nextDisplayedTransactions[transactionIndex] = currentTransaction;

              // Check if this transaction should still be displayed
              // A transaction is displayed in this modal if it contains *any* unit claimed by the user.
              // We need to re-check this condition after the update.
              const hasClaimedUnitAfterUpdate =
                currentTransaction.availedServices.some((as) =>
                  as.units.some(
                    (unit) =>
                      (unit.status === Status.PENDING &&
                        unit.checkedById === accountId) ||
                      (unit.status === Status.DONE &&
                        unit.servedById === accountId),
                  ),
                );

              // NOTE: We DO NOT filter out the transaction here if it becomes DONE
              // The filter for Status.PENDING happens in the render method now.
              // This ensures the transaction object remains in the state until the parent
              // list (allPendingTransactions) is updated, avoiding flicker.
              // if (!hasClaimedUnitAfterUpdate) {
              //     // If the transaction no longer contains claimed units, remove it from the list
              //     console.log(`ExpandedListedServices Socket: Transaction ${currentTransaction.id} no longer has claimed units. Removing.`);
              //     nextDisplayedTransactions.splice(transactionIndex, 1);
              // }
            } else {
              // This case shouldn't happen if data is consistent, but log it.
              console.warn(
                `[ExpandedListedServices] Socket: Received update for service ${updatedService.id} but could not find it in transaction ${currentTransaction.id}. Ignoring.`,
              );
            }

            // Return the updated list of transactions (including potentially DONE transactions if the parent hasn't filtered them yet)
            return nextDisplayedTransactions;
          } else {
            // The transaction containing the updated service is NOT currently displayed.
            // This implies it was filtered out by the parent's transactionsWithClaimedUnits memo (e.g. it was already DONE).
            // If it's now relevant (unlikely for a DONE transaction update), the parent will update its state, triggering the useEffect
            // which will re-initialize this component's state. So, no direct update needed here.
            console.log(
              `[ExpandedListedServices] Socket: Received update for service ${updatedService.id} whose transaction ${updatedService.transactionId} is not currently displayed. Ignoring.`,
            );
            return currentDisplayedTransactions; // Return the state unchanged
          }
        });
      }, 0); // Push update logic to the next tick
      // === End setTimeout ===
    },
    // Dependencies: setProcessingServeActions, setDisplayedTransactions, accountId, Status
    [setProcessingServeActions, setDisplayedTransactions, accountId, Status],
  );

  // --- Unit Action Error Handler ---
  // Remains the same, clears processing state and sets error for the specific unit.
  const handleUnitActionError = useCallback(
    (errorPayload: { unitId?: string; message?: string }) => {
      console.error(
        "[ExpandedListedServices] Socket: Raw Socket Unit Action Error Received:",
        errorPayload,
      );
      const unitId = errorPayload?.unitId;
      if (!unitId) {
        console.error(
          "[ExpandedListedServices] Socket: Received unit action error with missing unitId. Cannot process.",
        );
        return;
      }

      console.error(
        "[ExpandedListedServices] Socket: Processing Error for UNIT_ID:",
        unitId,
        "Message:",
        errorPayload.message,
      );

      // === Wrap state updates in setTimeout(0) ===
      setTimeout(() => {
        // --- Phase 1: Clear processing state for the unit ---
        setProcessingServeActions((prev) => {
          const isCurrentlyProcessing = prev.has(unitId);
          if (isCurrentlyProcessing) {
            console.log(
              `[ExpandedListedServices] Socket: Clearing processing state for unit ${unitId} due to received error.`,
            );
            const next = new Set(prev);
            next.delete(unitId); // Remove the unit from processing state
            return next; // State changed
          } else {
            console.warn(
              `[ExpandedListedServices] Socket: Received error for UNIT_ID ${unitId}, but it was not found in the current processing state.`,
            );
            return prev; // State unchanged
          }
        });

        // --- Phase 2: Set a user-visible error message for this specific unit ---
        // The clearUnitError function already has its own timeout
        const errorMessage =
          errorPayload.message || "Unknown error during unit action.";
        setUnitErrors((prev) => new Map(prev).set(unitId, errorMessage)); // Set the error

        // The clearUnitError setTimeout is already called below
        setTimeout(() => clearUnitError(unitId), 5000);

        // --- Phase 3: Revert local UI state if action failed ---
        // This part is tricky and optional. If you had optimistic updates (e.g., changing status to DONE immediately on click),
        // you'd revert that change here. Since we rely on the socket update for the *actual* state change,
        // we don't need to revert an optimistic update here. The UI will simply not update to DONE
        // until a successful socket update is received by handleUpdate.
      }, 0); // Push update logic to the next tick
      // === End setTimeout ===
    },
    // Dependencies: setProcessingServeActions, setUnitErrors, clearUnitError
    [setProcessingServeActions, setUnitErrors, clearUnitError],
  );

  useEffect(() => {
    if (!socket) {
      console.warn(
        "[ExpandedListedServices] Socket Effect: Socket is null, listeners not attached.",
      );
      // Clear local states if socket is null (e.g., on logout)
      setProcessingServeActions(new Set());
      setUnitErrors(new Map());
      // Do NOT clear displayedTransactions here, as it's initialized by the prop.
      return;
    }
    console.log("[ExpandedListedServices] Socket Effect: Attaching listeners.");
    socket.on("availedServiceUpdated", handleUpdate);
    socket.on("unitActionError", handleUnitActionError);

    return () => {
      console.log(
        "[ExpandedListedServices] Socket Effect: Removing listeners.",
      );
      if (socket) {
        socket.off("availedServiceUpdated", handleUpdate);
        socket.off("unitActionError", handleUnitActionError);
      }
      // Clear local states on unmount/socket change
      setProcessingServeActions(new Set());
      setUnitErrors(new Map());
      // Do NOT clear displayedTransactions here
    };
  }, [
    socket,
    handleUpdate,
    handleUnitActionError,
    setProcessingServeActions,
    setUnitErrors,
  ]); // Dependencies

  // --- Unit Serve Logic ---
  const handleMarkUnitServed = useCallback(
    (unit: AvailedServiceUnitProps) => {
      // Frontend pre-validation: Must be PENDING and checked by ME, not served.
      if (
        unit.status !== Status.PENDING ||
        unit.checkedById !== accountId ||
        unit.servedById ||
        processingServeActions.has(unit.id) ||
        !socket ||
        typeof accountId !== "string" ||
        !accountId ||
        accountId === "undefined" ||
        accountId === "null"
      ) {
        console.warn(
          `[ExpandedListedServices] Mark Unit Served prevented for ${unit.id}: Status=${unit.status}, CheckedByMe=${unit.checkedById === accountId}, Served=${!!unit.servedById}, Processing=${processingServeActions.has(unit.id)}, Socket=${!!socket}, Account=${accountId}`,
        );
        let errorMessage = "Cannot perform action.";
        if (
          !socket ||
          typeof accountId !== "string" ||
          !accountId ||
          accountId === "undefined" ||
          accountId === "null"
        )
          errorMessage = "Cannot connect to server or user missing.";
        else if (processingServeActions.has(unit.id))
          errorMessage = "Action already in progress.";
        else if (unit.status !== Status.PENDING)
          errorMessage = `Cannot mark served: Unit is ${unit.status.toLowerCase()}.`;
        else if (unit.checkedById !== accountId)
          errorMessage = "Cannot mark served: Unit not checked by you.";
        else if (unit.servedById)
          errorMessage = `Cannot mark served: Unit already served by ${unit.servedBy?.name || "someone else"}.`;
        setUnitErrors((prev) => new Map(prev).set(unit.id, errorMessage));
        setTimeout(() => clearUnitError(unit.id), 5000);
        return;
      }

      setProcessingServeActions((prev) => new Set(prev).add(unit.id));
      setUnitErrors((prev) => {
        // Clear any error on this unit when action starts
        const next = new Map(prev);
        next.delete(unit.id);
        return next;
      });

      // Get transactionId from the unit's relation
      const transactionId = unit.availedService?.transactionId;
      if (!transactionId) {
        console.error(
          `[ExpandedListedServices] Mark Unit Served failed: Missing transactionId for unit ${unit.id}`,
        );
        // Fix: Correctly remove from processing state
        setProcessingServeActions((prev) => {
          const next = new Set(prev);
          next.delete(unit.id);
          return next;
        });
        setUnitErrors((prev) =>
          new Map(prev).set(unit.id, "Internal Error: Transaction ID missing."),
        );
        setTimeout(() => clearUnitError(unit.id), 5000);
        return;
      }

      console.log(
        `[ExpandedListedServices] Emitting markUnitServed for unit ${unit.id}`,
      );
      socket.emit("markUnitServed", {
        unitId: unit.id,
        availedServiceId: unit.availedServiceId,
        transactionId: transactionId,
        accountId: accountId,
      });
    },
    [
      socket,
      accountId,
      processingServeActions,
      setProcessingServeActions,
      setUnitErrors,
      Status,
      clearUnitError,
    ], // Dependencies
  );

  // --- Unit Unserve Logic ---
  const handleUnmarkUnitServed = useCallback(
    (unit: AvailedServiceUnitProps) => {
      // Frontend pre-validation: Must be DONE and served by ME.
      if (
        unit.status !== Status.DONE ||
        unit.servedById !== accountId ||
        processingServeActions.has(unit.id) ||
        !socket ||
        typeof accountId !== "string" ||
        !accountId ||
        accountId === "undefined" ||
        accountId === "null"
      ) {
        console.warn(
          `[ExpandedListedServices] Unmark Unit Served prevented for ${unit.id}: Status=${unit.status}, ServedByMe=${unit.servedById === accountId}, Processing=${processingServeActions.has(unit.id)}, Socket=${!!socket}, Account=${accountId});`,
        );
        let errorMessage = "Cannot perform action.";
        if (
          !socket ||
          typeof accountId !== "string" ||
          !accountId ||
          accountId === "undefined" ||
          accountId === "null"
        )
          errorMessage = "Cannot connect to server or user missing.";
        else if (processingServeActions.has(unit.id))
          errorMessage = "Action already in progress.";
        else if (unit.status !== Status.DONE)
          errorMessage = `Cannot unmark served: Unit status is ${unit.status}.`;
        else if (unit.servedById !== accountId) {
          if (!unit.servedById)
            errorMessage =
              "Cannot unmark: Unit is not currently marked as Served.";
          else
            errorMessage = `Cannot unmark: Unit served by ${unit.servedBy?.name || "someone else"}.`;
        }
        setUnitErrors((prev) => new Map(prev).set(unit.id, errorMessage));
        setTimeout(() => clearUnitError(unit.id), 5000);
        return;
      }

      setProcessingServeActions((prev) => new Set(prev).add(unit.id));
      setUnitErrors((prev) => {
        // Clear any error on this unit when action starts
        const next = new Map(prev);
        next.delete(unit.id);
        return next;
      });

      const transactionId = unit.availedService?.transactionId;
      if (!transactionId) {
        console.error(
          `[ExpandedListedServices] Unmark Unit Served failed: Missing transactionId for unit ${unit.id}`,
        );
        // Fix: Correctly remove from processing state
        setProcessingServeActions((prev) => {
          const next = new Set(prev);
          next.delete(unit.id);
          return next;
        });
        setUnitErrors((prev) =>
          new Map(prev).set(unit.id, "Internal Error: Transaction ID missing."),
        );
        setTimeout(() => clearUnitError(unit.id), 5000);
        return;
      }

      console.log(
        `[ExpandedListedServices] Emitting unmarkUnitServed for unit ${unit.id}`,
      );
      socket.emit("unmarkUnitServed", {
        unitId: unit.id,
        availedServiceId: unit.availedServiceId,
        transactionId: transactionId,
        accountId: accountId,
      });
    },
    [
      socket,
      accountId,
      processingServeActions,
      setProcessingServeActions,
      setUnitErrors,
      Status,
      clearUnitError,
    ], // Dependencies
  );

  // Filter transactions to display only those that are PENDING
  // This acts as a safety net to hide transactions that might be marked DONE on the server
  // but haven't been removed from the parent's allPendingTransactions list yet.
  const pendingDisplayedTransactions = useMemo(() => {
    return displayedTransactions.filter((tx) => tx.status === Status.PENDING);
  }, [displayedTransactions, Status]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-grow space-y-3 overflow-y-auto border-y border-gray-200 bg-gray-50 px-4 py-4 md:max-h-[calc(75vh-80px)]">
        {/* Show loading spinner */}
        {/* Use pendingDisplayedTransactions.length for check */}
        {isLoading && pendingDisplayedTransactions.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading
            services...
          </div>
        ) : // Map over the filtered local state (pending transactions)
        pendingDisplayedTransactions.length > 0 ? (
          pendingDisplayedTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="mb-6 rounded-lg border border-customGray/50 bg-white p-4 shadow-sm last:mb-0" // Add margin-bottom to transactions
            >
              {/* === Transaction Header === */}
              <div className="mb-4 border-b border-gray-100 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-base font-semibold text-customBlack">
                    {transaction.customer?.name ?? "Unknown Customer"}
                  </h3>
                  <span className="whitespace-nowrap text-sm font-semibold text-gray-700">
                    Total: {formatCurrency(transaction.grandTotal)}{" "}
                    {/* Display transaction total */}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                  <Clock size={12} className="text-gray-400" />
                  Booked:{" "}
                  {transaction.bookedFor &&
                  isValid(new Date(transaction.bookedFor))
                    ? `${new Date(transaction.bookedFor).toLocaleDateString()} @ ${new Date(transaction.bookedFor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "N/A Date"}
                  {/* Optional: Add Transaction Status or Branch if relevant here */}
                  {/* <span className="ml-2">Status: {transaction.status}</span> */}
                  {/* {transaction.branch?.title && <span className="ml-2">Branch: {transaction.branch.title}</span>} */}
                </div>
              </div>
              {/* === End Transaction Header === */}

              {/* === Availed Services within this Transaction === */}
              <div className="space-y-4">
                {" "}
                {/* Increased space */}
                {transaction.availedServices &&
                transaction.availedServices.length > 0 ? (
                  transaction.availedServices.map((service) => (
                    <div
                      key={service.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-3" // Style for each Availed Service block
                    >
                      {/* Availed Service Header */}
                      <div className="mb-3 border-b border-gray-200 pb-2 last:border-b-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                            {" "}
                            {/* Smaller font */}
                            <Tag size={14} className="text-blue-600" />{" "}
                            {/* Smaller icon */}
                            {service.service?.title ??
                              service.originatingSetTitle ??
                              "Unknown"}
                            {service.quantity > 0
                              ? ` (x${service.quantity})`
                              : ""}
                          </span>
                          {/* Display Total Price for the AS line item */}
                          <span className="whitespace-nowrap text-sm font-semibold text-gray-700">
                            Total: {formatCurrency(service.price)}{" "}
                          </span>
                        </div>
                        {/* Optional: Display AS CommissionValue if needed */}
                        {/* <div className="text-xxs text-gray-600 mt-0.5">
                         AS Commission: {formatCurrency(service.commissionValue)}
                     </div> */}
                      </div>
                      {/* End Availed Service Header */}
                      {/* === Units within this Availed Service === */}
                      <div className="space-y-3 pl-4">
                        {" "}
                        {/* Added left padding */}
                        {service.units && service.units.length > 0
                          ? service.units.map((unit) => {
                              // Units here are ALL units for this AS, not just claimed ones.
                              // Filtering logic for display/actions is applied *here*.
                              const isProcessing = processingServeActions.has(
                                unit.id,
                              );
                              const isServed = unit.status === Status.DONE;
                              const servedByMe =
                                isServed && unit.servedById === accountId;
                              const servedByOther =
                                isServed && unit.servedById !== accountId;

                              const isChecked = !!unit.checkedById;
                              const checkedByMe =
                                isChecked && unit.checkedById === accountId;
                              const checkedByOther =
                                isChecked && unit.checkedById !== accountId;

                              // Determine if this unit is claimed by the current user for highlighting
                              const isClaimedByMe =
                                (unit.status === Status.PENDING &&
                                  checkedByMe) ||
                                (unit.status === Status.DONE && servedByMe);

                              // Can Mark Served only if PENDING AND checked by ME, not served, not processing
                              const canMark =
                                unit.status === Status.PENDING &&
                                checkedByMe && // Must be checked by THIS account
                                !unit.servedById && // Must not be served yet
                                !isProcessing; // Not currently processing action

                              // Can Unmark Served only if DONE and served by ME, not processing
                              const canUnmark =
                                unit.status === Status.DONE &&
                                servedByMe && // Must be served by THIS account
                                !isProcessing; // Not currently processing

                              const unitErrorMessage = unitErrors.get(unit.id);

                              // Styling for individual unit cards
                              let unitClasses = `relative flex flex-col gap-2 rounded border p-3 text-sm transition-opacity duration-150 `;
                              if (isProcessing)
                                unitClasses +=
                                  " pointer-events-none opacity-60 animate-pulse";

                              // Highlight based on claimed status
                              if (isClaimedByMe) {
                                if (isServed)
                                  unitClasses += ` border-green-400 bg-green-50`; // Green for DONE & ServedByMe
                                else if (
                                  unit.status === Status.PENDING &&
                                  checkedByMe
                                )
                                  unitClasses += ` border-customDarkPink bg-customDarkPink/5`; // Lighter pink for PENDING & CheckedByMe
                                // else if (unit.status === Status.PENDING && !isChecked) unitClasses += ` border-orange-400 bg-orange-50`; // Orange for Unassigned PENDING (Should not happen in Claims modal)
                              } else {
                                // Styling for units NOT claimed by the current user (but still displayed)
                                if (isServed)
                                  unitClasses += ` border-green-100 bg-green-50`; // Lighter green for DONE & ServedByOther
                                else if (unit.status === Status.PENDING) {
                                  if (checkedByOther)
                                    unitClasses += ` border-blue-100 bg-blue-50`; // Lighter blue for PENDING & CheckedByOther
                                  else
                                    unitClasses += ` border-gray-200 bg-white`; // Default for PENDING & Unassigned (Should not happen in Claims modal)
                                } else if (unit.status === Status.CANCELLED)
                                  unitClasses += ` border-red-100 bg-red-50`; // Lighter red for Cancelled
                                else unitClasses += ` border-gray-200 bg-white`; // Fallback
                              }

                              return (
                                <div key={unit.id} className={unitClasses}>
                                  {unitErrorMessage && (
                                    <div className="absolute -top-6 left-0 right-0 z-10 flex items-center gap-1 rounded-t bg-red-100 px-2 py-0.5 text-xs text-red-700">
                                      <AlertCircle size={12} />
                                      <span className="truncate">
                                        {unitErrorMessage}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="relative flex min-w-0 flex-grow items-center gap-2.5">
                                      <span className="flex-shrink-0 font-medium text-gray-800">
                                        Unit {unit.unitIndex + 1}
                                      </span>

                                      {/* Status Badge */}
                                      <span
                                        className={`inline-block flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold lowercase leading-tight ${unit.status === Status.PENDING ? `bg-orange-100 text-orange-700` : ""} ${unit.status === Status.DONE ? `bg-green-100 text-green-800` : ""} ${unit.status === Status.CANCELLED ? "bg-red-100 text-red-700" : ""}`}
                                      >
                                        {unit.status.toLowerCase()}
                                      </span>

                                      {/* Assignment Info */}
                                      {unit.status === Status.DONE &&
                                      unit.servedBy ? (
                                        <span
                                          className={`text-xxs ml-auto flex-shrink-0 font-semibold sm:ml-0 ${servedByMe ? "text-green-700" : "text-gray-600"}`}
                                        >
                                          {" "}
                                          {/* Use a neutral color for others */}
                                          Served By:{" "}
                                          {servedByMe
                                            ? "You"
                                            : (unit.servedBy?.name ??
                                              "Unknown")}
                                        </span>
                                      ) : unit.status === Status.PENDING &&
                                        unit.checkedBy ? (
                                        <span
                                          className={`text-xxs ml-auto flex-shrink-0 font-semibold sm:ml-0 ${checkedByMe ? "text-customDarkPink" : "text-gray-600"}`}
                                        >
                                          {" "}
                                          {/* Use a neutral color for others */}
                                          Checked By:{" "}
                                          {checkedByMe
                                            ? "You"
                                            : (unit.checkedBy?.name ??
                                              "Unknown")}
                                        </span>
                                      ) : unit.status === Status.PENDING ? (
                                        <span className="text-xxs ml-auto flex-shrink-0 text-gray-500 sm:ml-0">
                                          Unassigned
                                        </span>
                                      ) : null}
                                    </div>
                                    <span
                                      className={`ml-2 flex-shrink-0 text-sm font-semibold ${unit.status === Status.DONE ? "text-green-700" : "text-gray-700"}`}
                                    >
                                      {formatCurrency(
                                        service.quantity > 0
                                          ? (service.service?.price ??
                                              service.price / service.quantity)
                                          : 0,
                                      )}
                                    </span>
                                  </div>

                                  {/* Unit Details / Actions Row */}
                                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px]">
                                    {/* Checked Time (only for units that were checked) */}
                                    {unit.checkedAt &&
                                      unit.checkedBy && ( // Only show checked time if checkedBy is not null
                                        <span className="ml-auto text-xs text-gray-600">
                                          Checked:{" "}
                                          {new Date(
                                            unit.checkedAt,
                                          ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      )}

                                    {/* Completed Time (only for DONE units) */}
                                    {unit.status === Status.DONE &&
                                      unit.completedAt && (
                                        <span
                                          className={`${unit.checkedAt ? "" : "ml-auto"} text-xs text-gray-600`}
                                        >
                                          {" "}
                                          {/* Add ml-auto if no checked time */}
                                          Completed:{" "}
                                          {new Date(
                                            unit.completedAt,
                                          ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      )}

                                    {/* --- Action Buttons (Only for Units Claimed by ME) --- */}
                                    {/* Mark Served Button */}
                                    {canMark && (
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          handleMarkUnitServed(unit)
                                        }
                                        disabled={!canMark}
                                        className="min-w-[120px] justify-center px-3"
                                        title={`Mark Unit ${
                                          unit.unitIndex + 1
                                        } as served`}
                                      >
                                        {isProcessing ? (
                                          <Loader2
                                            size={16}
                                            className="animate-spin"
                                          />
                                        ) : (
                                          "Mark Served"
                                        )}
                                      </Button>
                                    )}

                                    {/* Unmark Served Button */}
                                    {canUnmark && (
                                      <Button
                                        size="sm"
                                        invert
                                        onClick={() =>
                                          handleUnmarkUnitServed(unit)
                                        }
                                        disabled={!canUnmark}
                                        className="min-w-[120px] justify-center px-3"
                                        title={`Unmark Unit ${
                                          unit.unitIndex + 1
                                        } as served`}
                                      >
                                        {isProcessing ? (
                                          <Loader2
                                            size={16}
                                            className="animate-spin"
                                          />
                                        ) : (
                                          "Unmark Served"
                                        )}
                                      </Button>
                                    )}

                                    {isProcessing && !canMark && !canUnmark && (
                                      <div className="flex min-w-[120px] items-center justify-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 sm:min-w-[120px]">
                                        <Loader2
                                          size={14}
                                          className="animate-spin"
                                        />{" "}
                                        Processing...
                                      </div>
                                    )}

                                    {unit.status === Status.DONE &&
                                      servedByOther &&
                                      !isProcessing && (
                                        <div
                                          className="flex min-w-[120px] items-center justify-center gap-1 rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800 sm:min-w-[120px]"
                                          title={`Served by ${unit.servedBy?.name || "someone else"}`}
                                        >
                                          <Info size={14} /> Served by other
                                        </div>
                                      )}

                                    {unit.status === Status.PENDING &&
                                      checkedByOther &&
                                      !isProcessing && (
                                        <div
                                          className="flex min-w-[120px] items-center justify-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs text-blue-800 sm:min-w-[120px]"
                                          title={`Checked by ${unit.checkedBy?.name || "someone else"}`}
                                        >
                                          <Info size={14} /> Checked by other
                                        </div>
                                      )}
                                  </div>
                                </div>
                              );
                            })
                          : // Messages for AvailedService line items where the quantity > 0 but *no* units were mapped (because the units array was empty or null)
                            service.quantity > 0 && (
                              <p className="mt-2 text-center text-xs italic text-gray-500">
                                Data issue: Units missing for this service line
                                (Quantity: {service.quantity}).
                              </p>
                            )}
                        {service.quantity === 0 && ( // Only show if original quantity was 0
                          <p className="mt-2 text-center text-xs italic text-gray-500">
                            No units expected for this service line (Quantity:
                            0).
                          </p>
                        )}
                      </div>{" "}
                      {/* End Units */}
                    </div> // End Availed Service block
                  ))
                ) : (
                  // Message if a transaction has no Availed Services (should not happen)
                  <p className="mt-4 text-center italic text-gray-500">
                    No services found for this transaction.
                  </p>
                )}
              </div>
              {/* End Availed Services within Transaction */}
            </div> // End Transaction block
          ))
        ) : // Show no services found message only if not loading and the local filtered list is empty
        !isLoading && pendingDisplayedTransactions.length === 0 ? (
          <div className="py-10 text-center">
            <Tag size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="italic text-gray-500">
              You currently have no claimed services for pending transactions.
            </p>
          </div>
        ) : null /* Don't show anything while loading if the list is empty */}
        {/* Show spinner if loading AND there are items currently displayed */}
        {isLoading && pendingDisplayedTransactions.length > 0 && (
          <div className="flex items-center justify-center py-4 text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating list...
          </div>
        )}
      </div>{" "}
      {/* End scrollable content area */}
      <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-gray-100 px-4 py-3">
        <Button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          size="sm"
          className="flex items-center gap-1.5"
          aria-label="Refresh claimed services list"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCcw size={16} />
          )}
          Refresh
        </Button>
        <Button type="button" onClick={onClose} invert size="sm">
          Close
        </Button>
      </div>
    </div>
  );
}
