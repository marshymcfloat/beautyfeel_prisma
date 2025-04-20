"use client"; // Still needs client directive for hooks and interactions

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import {
  ChevronLeft,
  Check,
  AlertCircle,
  Loader2,
  CheckCircle,
  UserCheck,
  Clock,
  ListChecks,
} from "lucide-react";
import { getActiveTransactions } from "@/lib/ServerAction"; // Adjust path if needed
import { TransactionProps, AvailedServicesProps } from "@/lib/Types"; // Adjust path if needed
// import { toast } from 'react-hot-toast'; // Uncomment if you use toasts

// Renamed component for clarity
export default function WorkPage() {
  const { accountID: accountIdParam } = useParams();
  const router = useRouter();
  const accountId = Array.isArray(accountIdParam)
    ? accountIdParam[0]
    : accountIdParam;

  // --- State ---
  const [fetchedTransactions, setFetchedTransactions] = useState<
    TransactionProps[] | null
  >(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionProps | null>(null);
  const [loading, setLoading] = useState(true); // Loading state for initial fetch
  const [socket, setSocket] = useState<Socket | null>(null);
  const [processingCheckActions, setProcessingCheckActions] = useState<
    Set<string>
  >(new Set()); // IDs of services being checked/unchecked
  const [error, setError] = useState<string | null>(null); // General error display

  // --- Socket Connection ---
  useEffect(() => {
    // Ensure accountId is valid before connecting
    if (typeof accountId !== "string" || !accountId) {
      setError("Invalid User ID provided.");
      setLoading(false);
      return;
    }
    // TODO: Consider moving URL to environment variable
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "https://beautyfeel-prisma.onrender.com";

    if (!backendUrl) {
      console.error("Backend URL is not defined.");
      setError("Configuration Error: Server URL missing.");
      setLoading(false);
      return;
    }

    console.log(`WorkPage: Connecting to socket at ${backendUrl}`);
    const newSocket = io(backendUrl, {
      reconnectionAttempts: 5,
      timeout: 10000,
      query: { accountId }, // Send accountId for potential server-side filtering/auth
    });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("WorkPage: Socket connected:", newSocket.id);
      setError(null); // Clear connection error on successful connection
    });

    newSocket.on("disconnect", (reason) => {
      console.log("WorkPage: Socket disconnected:", reason);
      // Optionally set an error state or show a notification
      // setError("Disconnected. Attempting to reconnect...");
    });

    newSocket.on("connect_error", (err) => {
      console.error("WorkPage: Socket connection error:", err);
      setError("Connection failed. Please check network or refresh.");
      // Consider stopping loading if connection permanently fails
      // setLoading(false);
    });

    // Cleanup on component unmount
    return () => {
      if (newSocket?.connected) {
        console.log("WorkPage: Disconnecting socket on unmount");
        newSocket.disconnect();
      }
      setSocket(null);
    };
  }, [accountId]); // Reconnect if accountId changes

  // --- Format Currency ---
  const formatCurrency = (value: number | null | undefined): string => {
    if (
      value == null ||
      typeof value !== "number" ||
      isNaN(value) ||
      !isFinite(value)
    ) {
      value = 0; // Default to 0 if value is invalid
    }
    return value.toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // --- Socket Event Handlers (Memoized) ---
  const handleAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      if (!updatedAvailedService?.id) {
        console.warn("Received invalid availed service update data");
        return;
      }
      console.log(
        `WorkPage: Received update for AS_ID=${updatedAvailedService.id}, TX_ID=${updatedAvailedService.transactionId}`,
      );

      // Remove from processing set upon successful update
      setProcessingCheckActions((prev) => {
        if (!prev.has(updatedAvailedService.id)) return prev; // No change needed if not processing
        const next = new Set(prev);
        next.delete(updatedAvailedService.id);
        return next;
      });

      // Helper for immutable update
      const updateList = (
        list: AvailedServicesProps[] = [], // Default to empty array
      ): AvailedServicesProps[] =>
        list.map((s) =>
          s.id === updatedAvailedService.id
            ? { ...s, ...updatedAvailedService } // Merge updates
            : s,
        );

      // Update the main transaction list
      setFetchedTransactions((prev) => {
        if (!prev) return null;
        return prev.map((tx) =>
          tx.id === updatedAvailedService.transactionId
            ? { ...tx, availedServices: updateList(tx.availedServices) }
            : tx,
        );
      });

      // Update the selected transaction if it's the one being viewed
      setSelectedTransaction((prev) => {
        if (!prev || prev.id !== updatedAvailedService.transactionId)
          return prev;
        return { ...prev, availedServices: updateList(prev.availedServices) };
      });
    },
    [],
  ); // Empty dependency array as it uses functional state updates

  const handleTransactionCompletion = useCallback(
    (completedTransaction: TransactionProps) => {
      if (!completedTransaction?.id) {
        console.warn("Received invalid transaction completion data");
        return;
      }
      console.log(
        `WorkPage: Received transaction completed event: ${completedTransaction.id}`,
      );

      // Remove completed transaction from the main list
      setFetchedTransactions(
        (prev) => prev?.filter((t) => t.id !== completedTransaction.id) ?? null,
      );

      // If the completed transaction was selected, deselect it
      setSelectedTransaction((prev) =>
        prev?.id === completedTransaction.id ? null : prev,
      );

      // Optionally show a notification
      // toast.success(`Transaction for ${completedTransaction.customer?.name ?? 'customer'} completed.`);
    },
    [],
  ); // Empty dependency array

  const handleCheckError = useCallback(
    (errorData: { availedServiceId?: string; message?: string }) => {
      if (!errorData?.availedServiceId) {
        console.error(
          "Received check error without availedServiceId:",
          errorData,
        );
        setError(errorData.message || "An unknown action error occurred.");
        return;
      }
      console.error(
        `WorkPage: Received check error for AS_ID=${errorData.availedServiceId}:`,
        errorData.message,
      );

      // Display the error message
      setError(`Action Failed: ${errorData.message || "Unknown error"}`);
      // toast.error(`Action Failed: ${error.message || "Unknown error"}`);

      // Remove from processing set on error
      setProcessingCheckActions((prev) => {
        if (!prev.has(errorData.availedServiceId!)) return prev;
        const next = new Set(prev);
        next.delete(errorData.availedServiceId!);
        return next;
      });
    },
    [],
  ); // Empty dependency array

  // --- Attach/Detach Socket Listeners ---
  useEffect(() => {
    if (!socket) return; // Only attach if socket is connected

    console.log("WorkPage: Attaching socket listeners");
    socket.on("availedServiceUpdated", handleAvailedServiceUpdate);
    socket.on("transactionCompleted", handleTransactionCompletion);
    socket.on("serviceCheckError", handleCheckError); // Catches errors from checkService
    socket.on("serviceUncheckError", handleCheckError); // Catches errors from uncheckService

    // Cleanup: Remove listeners when socket changes or component unmounts
    return () => {
      console.log("WorkPage: Detaching socket listeners");
      socket.off("availedServiceUpdated", handleAvailedServiceUpdate);
      socket.off("transactionCompleted", handleTransactionCompletion);
      socket.off("serviceCheckError", handleCheckError);
      socket.off("serviceUncheckError", handleCheckError);
    };
  }, [
    socket,
    handleAvailedServiceUpdate,
    handleTransactionCompletion,
    handleCheckError,
  ]); // Re-attach if socket or handlers change (handlers are stable due to useCallback)

  // --- Fetch Initial Data ---
  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component

    async function fetchTransactions() {
      console.log("WorkPage: Fetching initial transactions...");
      setLoading(true);
      setError(null); // Clear previous errors
      setFetchedTransactions(null); // Clear previous data
      setSelectedTransaction(null);

      // Ensure accountId is valid before fetching
      if (typeof accountId !== "string" || !accountId) {
        console.warn("Fetch aborted: Invalid accountId");
        if (isMounted) setLoading(false);
        return;
      }

      try {
        // Assuming getActiveTransactions takes no arguments or uses context/cookies server-side
        const data = await getActiveTransactions();

        if (isMounted) {
          // Basic data validation
          if (!Array.isArray(data)) {
            console.error("Fetched data is not an array:", data);
            throw new Error("Invalid data received from server.");
          }
          console.log(`WorkPage: Fetched ${data.length} transactions.`);
          setFetchedTransactions(data);
        }
      } catch (err: any) {
        console.error("WorkPage: Error fetching transactions:", err);
        if (isMounted) {
          setError(`Failed to load data: ${err.message || "Unknown error"}`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchTransactions();

    // Cleanup function to set isMounted to false
    return () => {
      console.log("WorkPage: Unmounting fetch effect");
      isMounted = false;
    };
  }, [accountId]); // Refetch if accountId changes

  // --- UI Event Handlers ---
  const handleSelectTransaction = (transaction: TransactionProps) => {
    setError(null); // Clear general errors when viewing details
    setSelectedTransaction(transaction);
  };
  const handleCloseDetails = () => {
    setSelectedTransaction(null);
    // setError(null); // Optionally clear error when going back to list
  };

  // --- Check/Uncheck Handler (Memoized) ---
  const handleServiceCheckToggle = useCallback(
    (availedService: AvailedServicesProps, shouldCheck: boolean) => {
      if (
        !socket || // Check if socket exists and is connected
        !socket.connected ||
        typeof accountId !== "string" || // Ensure accountId is valid
        !accountId ||
        processingCheckActions.has(availedService.id) // Prevent double-clicks
      ) {
        console.warn("Check toggle aborted:", {
          socketConnected: socket?.connected,
          accountId,
          isProcessing: processingCheckActions.has(availedService.id),
        });
        return;
      }

      // Optimistically add to processing set
      setProcessingCheckActions((prev) => new Set(prev).add(availedService.id));
      setError(null); // Clear previous errors before new action

      const eventName = shouldCheck ? "checkService" : "uncheckService";
      const payload = {
        availedServiceId: availedService.id,
        transactionId: availedService.transactionId, // Send transactionId for context
        accountId, // Send accountId performing the action
      };

      console.log(
        `WorkPage: Emitting '${eventName}' for AS_ID=${payload.availedServiceId}`,
      );
      socket.emit(eventName, payload);
    },
    [socket, accountId, processingCheckActions],
  ); // Dependencies

  // --- Checkbox Disabled Logic (Memoized) ---
  const isCheckboxDisabled = useCallback(
    (service: AvailedServicesProps): boolean => {
      // Disabled if currently processing this specific service
      if (processingCheckActions.has(service.id)) {
        return true;
      }
      // Disabled if already checked by *another* user
      if (!!service.checkedById && service.checkedById !== accountId) {
        return true;
      }
      // Disabled if already marked as served
      if (!!service.servedById) {
        return true;
      }
      // Otherwise, it's enabled
      return false;
    },
    [accountId, processingCheckActions],
  ); // Dependencies

  // --- Render Logic ---
  const renderContent = () => {
    // 1. Loading State
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center p-10 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Work
          Queue...
        </div>
      );
    }

    // 2. Critical Fetch Error (only if nothing loaded yet)
    if (
      error &&
      !selectedTransaction && // Not viewing details
      (!fetchedTransactions || fetchedTransactions.length === 0) // And list is empty/failed
    ) {
      return (
        <div className="flex h-full flex-col items-center justify-center p-10 text-center text-red-600">
          <AlertCircle className="mb-2 h-8 w-8" />
          <p className="font-medium">{error}</p>
          {/* Optional: Add a retry button */}
        </div>
      );
    }

    // 3. Details View
    if (selectedTransaction) {
      return (
        <div className="flex h-full flex-col">
          {/* Header for Details */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-white p-3 shadow-sm">
            {/* Back button within details view */}
            <button
              onClick={handleCloseDetails}
              className="mb-2 flex items-center rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-customDarkPink"
              aria-label="Back to List"
            >
              <ChevronLeft size={16} className="mr-1" />
              Back to List
            </button>
            <h2 className="mb-1 truncate text-base font-semibold text-gray-800">
              Customer: {selectedTransaction.customer?.name ?? "N/A"}
            </h2>
            {/* Transaction Meta Info */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Clock size={12} /> Created:{" "}
                {selectedTransaction.createdAt
                  ? new Date(selectedTransaction.createdAt).toLocaleDateString()
                  : "N/A"}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> Booked:{" "}
                {selectedTransaction.bookedFor
                  ? new Date(selectedTransaction.bookedFor).toLocaleDateString()
                  : "N/A"}{" "}
                @{" "}
                {selectedTransaction.bookedFor
                  ? new Date(selectedTransaction.bookedFor).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit" },
                    )
                  : ""}
              </span>
              <span className="flex items-center gap-1">
                Status:{" "}
                <span
                  className={`font-medium ${
                    selectedTransaction.status === "PENDING"
                      ? "text-orange-600"
                      : selectedTransaction.status === "DONE"
                        ? "text-green-600"
                        : "text-red-600" // Assuming other statuses are errors/cancelled
                  }`}
                >
                  {selectedTransaction.status}
                </span>
              </span>
            </div>
          </div>

          {/* Non-critical error related to this specific transaction's actions */}
          {error && (
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-red-200 bg-red-100 p-2 text-sm text-red-700">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Services List */}
          <div className="flex-grow space-y-2 overflow-y-auto bg-gray-50 p-3">
            {(selectedTransaction.availedServices ?? []).length === 0 ? (
              <p className="mt-10 text-center italic text-gray-500">
                No services listed for this transaction.
              </p>
            ) : (
              (selectedTransaction.availedServices ?? []).map((service) => {
                const isProcessing = processingCheckActions.has(service.id);
                const isCheckedByMe = service.checkedById === accountId;
                const isCheckedByOther =
                  !!service.checkedById && !isCheckedByMe;
                const isServed = !!service.servedById;
                const isDisabled = isCheckboxDisabled(service);

                // Determine background and border based on state
                let cardClasses = "border-gray-200 bg-white";
                if (isServed)
                  cardClasses = "border-green-300 bg-green-50/80 opacity-90";
                else if (isCheckedByMe)
                  cardClasses = "border-blue-300 bg-blue-50";
                else if (isCheckedByOther)
                  cardClasses = "border-yellow-300 bg-yellow-50/80 opacity-90";

                return (
                  <div
                    key={service.id}
                    className={`flex flex-col rounded-lg border p-3 shadow-sm transition-opacity duration-150 ${cardClasses} ${isProcessing ? "animate-pulse opacity-60" : ""}`}
                  >
                    {/* Main Row: Checkbox, Title, Price */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex min-w-0 flex-grow items-center gap-2.5">
                        {/* Custom Checkbox Button */}
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={!!service.checkedById}
                          onClick={() =>
                            handleServiceCheckToggle(
                              service,
                              !service.checkedById, // Toggle based on current checked state
                            )
                          }
                          disabled={isDisabled || isProcessing}
                          className={`relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-customDarkPink/50 focus:ring-offset-1 ${
                            isDisabled
                              ? "cursor-not-allowed border-gray-300 bg-gray-100"
                              : "cursor-pointer border-gray-400 bg-white hover:border-customDarkPink"
                          } ${
                            service.checkedById
                              ? "border-customDarkPink bg-customDarkPink" // Style for checked state
                              : ""
                          }`}
                          aria-label={`Check ${service.service?.title ?? "service"}`}
                        >
                          {isProcessing && (
                            <Loader2
                              size={12}
                              className="animate-spin text-gray-500"
                            />
                          )}
                          {!isProcessing && service.checkedById && (
                            <Check
                              size={14}
                              className="text-white"
                              strokeWidth={3}
                            /> // White checkmark on dark background
                          )}
                        </button>
                        {/* Service Title and Origin (if any) */}
                        <label
                          className={`truncate text-sm font-medium text-gray-800 ${
                            isDisabled || isProcessing ? "" : "cursor-pointer"
                          }`}
                          onClick={() =>
                            !isDisabled &&
                            !isProcessing &&
                            handleServiceCheckToggle(
                              service,
                              !service.checkedById,
                            )
                          }
                        >
                          {service.service?.title ?? "Unknown Service"}
                          {service.originatingSetTitle && (
                            <span className="ml-1 text-[10px] font-normal text-gray-500">
                              (from {service.originatingSetTitle})
                            </span>
                          )}
                        </label>
                      </div>
                      {/* Price */}
                      <span
                        className={`ml-2 flex-shrink-0 text-sm font-semibold ${
                          isServed
                            ? "text-green-700"
                            : isCheckedByMe
                              ? "text-blue-700"
                              : "text-gray-700"
                        }`}
                      >
                        {formatCurrency(service.price)}
                      </span>
                    </div>
                    {/* Sub Row: Checked By / Served By Info */}
                    <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 pl-8 text-[11px] text-gray-500">
                      {/* Checked By Info */}
                      <span className="flex items-center gap-1">
                        <UserCheck
                          size={12}
                          className={`${
                            isCheckedByOther
                              ? "text-yellow-600"
                              : isCheckedByMe
                                ? "text-blue-600"
                                : "text-gray-400"
                          }`}
                        />
                        Checked:
                        <span
                          className={`ml-1 font-medium ${
                            isCheckedByOther
                              ? "text-yellow-700"
                              : isCheckedByMe
                                ? "text-blue-700"
                                : "text-gray-600"
                          }`}
                        >
                          {service.checkedBy?.name ?? "Nobody"}
                        </span>
                      </span>
                      {/* Served By Info */}
                      <span className="flex items-center gap-1 text-right">
                        <CheckCircle
                          size={12}
                          className={`${
                            isServed ? "text-green-600" : "text-gray-400"
                          }`}
                        />
                        Served:
                        <span
                          className={`ml-1 font-medium ${
                            isServed ? "text-green-700" : "text-gray-600"
                          }`}
                        >
                          {service.servedBy?.name ?? "No"}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    // 4. Transaction List View (Default)
    return (
      <div className="h-full overflow-y-auto">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-100/90 backdrop-blur-sm">
            <tr>
              <th className="w-[30%] border-b border-gray-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Booked Date/Time
              </th>
              <th className="w-[45%] border-b border-gray-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Customer Name
              </th>
              <th className="w-[25%] border-b border-gray-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {/* Inline error if fetch failed but list view is shown */}
            {error && !loading && (
              <tr className="bg-red-50">
                <td
                  colSpan={3}
                  className="px-3 py-2 text-center text-sm text-red-700"
                >
                  {error}
                </td>
              </tr>
            )}
            {/* Transaction Rows */}
            {fetchedTransactions && fetchedTransactions.length > 0
              ? fetchedTransactions.map((transaction) => (
                  <tr
                    className="cursor-pointer transition-colors duration-100 hover:bg-blue-50/50"
                    key={transaction.id}
                    onClick={() => handleSelectTransaction(transaction)}
                    tabIndex={0} // Make it focusable
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleSelectTransaction(transaction)
                    }
                  >
                    {/* Date/Time Column */}
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-600">
                      <div>
                        {transaction.bookedFor
                          ? new Date(transaction.bookedFor).toLocaleDateString()
                          : "N/A"}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {transaction.bookedFor
                          ? new Date(transaction.bookedFor).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )
                          : ""}
                      </div>
                    </td>
                    {/* Customer Name Column */}
                    <td className="truncate px-3 py-2.5 text-sm font-medium text-gray-800">
                      {transaction.customer?.name ?? "Unknown Customer"}
                    </td>
                    {/* Status Column */}
                    <td className="px-3 py-2.5 text-sm">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold lowercase leading-tight ${
                          transaction.status === "PENDING"
                            ? "bg-orange-100 text-orange-700"
                            : transaction.status === "DONE"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-700" // Default/other statuses
                        }`}
                      >
                        {transaction.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))
              : // Empty State (and not loading/error)
                !error &&
                !loading && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-10 text-center text-sm italic text-gray-500"
                    >
                      No pending transactions found.
                    </td>
                  </tr>
                )}
          </tbody>
        </table>
      </div>
    );
  };

  // --- Define Page Title based on state ---
  const pageTitle = selectedTransaction ? "Transaction Details" : "Work Queue";

  // --- Final Render - Standard Page Structure ---
  return (
    // Main page container - ensure it fills height within its parent layout
    <div className="flex h-full flex-col bg-gray-100">
      {/* Page Header */}
      <div className="flex flex-shrink-0 items-center border-b border-gray-200 bg-white p-4 shadow-sm">
        {/* Back Button - Always goes back to the account's main page */}
        <button
          onClick={() => router.push(`/${accountId}`)} // Navigate to the main account page
          className="mr-4 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-customDarkPink"
          aria-label="Back to Account Dashboard"
        >
          <ChevronLeft size={22} />
        </button>

        {/* Page Title */}
        <h1 className="flex flex-grow items-center text-lg font-semibold text-gray-800">
          {/* Icon changes based on view */}
          {selectedTransaction ? (
            <Clock size={18} className="mr-2 text-customDarkPink" />
          ) : (
            <ListChecks size={18} className="mr-2 text-customDarkPink" />
          )}
          {pageTitle}
        </h1>
        {/* Optionally add other header controls here */}
      </div>

      {/* Non-critical Error Display Area (e.g., socket errors after load) */}
      {/* Placed below header, above main content */}
      {error &&
        !loading &&
        fetchedTransactions &&
        !selectedTransaction && ( // Show general errors only in list view?
          <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-red-200 bg-red-50 p-2 text-center text-sm text-red-600">
            <AlertCircle className="inline h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

      {/* Main Content Area - Takes remaining height and scrolls internally */}
      <div className="min-h-0 flex-grow overflow-hidden bg-gray-50">
        {renderContent()}
      </div>
    </div>
  );
}
