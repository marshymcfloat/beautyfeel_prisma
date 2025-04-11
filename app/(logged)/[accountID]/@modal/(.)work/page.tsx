// src/components/cashier/WorkInterceptedModal.tsx (or your path)
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { ChevronLeft, Check, X as IconX, AlertCircle } from "lucide-react"; // Renamed X to IconX to avoid conflict

// --- Component Imports ---
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle"; // For title prop
// import Button from "@/components/Buttons/Button"; // Only if needed for extra buttons

// --- Server Actions & Types ---
import { getActiveTransactions } from "@/lib/ServerAction"; // Adjust path
// Import types (ensure these are correct and match ServerAction returns)
import {
  TransactionProps,
  AvailedServicesProps,
  AccountInfo,
} from "@/lib/Types"; // Adjust path

// --- Main Component ---
export default function WorkInterceptedModal() {
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
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [processingCheckActions, setProcessingCheckActions] = useState<
    Set<string>
  >(new Set());
  const [error, setError] = useState<string | null>(null);

  // --- Socket Connection ---
  useEffect(() => {
    if (typeof accountId !== "string" || !accountId) {
      console.warn(
        "WorkInterceptedModal: Account ID missing, skipping socket connection.",
      );
      return; // Don't try to connect without ID
    }
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    if (!backendUrl) {
      console.error("WorkInterceptedModal: NEXT_PUBLIC_BACKEND_URL not set.");
      setError("Server connection failed (URL missing).");
      return;
    }

    console.log(`WorkInterceptedModal: Connecting socket to ${backendUrl}`);
    const newSocket = io(backendUrl, {
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    setSocket(newSocket);

    newSocket.on("connect", () =>
      console.log("WorkInterceptedModal: Socket connected:", newSocket.id),
    );
    newSocket.on("disconnect", (reason) => {
      console.log("WorkInterceptedModal: Socket disconnected:", reason);
      // Optionally set error state on disconnect if needed
      // setError("Realtime connection lost.");
    });
    newSocket.on("connect_error", (err) => {
      console.error("WorkInterceptedModal: Socket connection error:", err);
      setError("Realtime connection failed.");
    });

    // Cleanup function
    return () => {
      if (newSocket?.connected) {
        // Check if connected before logging disconnect
        console.log("WorkInterceptedModal: Disconnecting socket.");
        newSocket.disconnect();
      }
      setSocket(null);
    };
  }, [accountId]); // Reconnect if accountId changes

  // --- Socket Event Handlers ---
  const handleAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      console.log(
        "WorkInterceptedModal: Received availedServiceUpdated:",
        updatedAvailedService.id,
      );
      setProcessingCheckActions((prev) => {
        const newSet = new Set(prev);
        newSet.delete(updatedAvailedService.id); // Remove processing state
        return newSet;
      });

      // Function to update the transaction list state safely
      const updateTransactionsState = (
        prev: TransactionProps[] | null,
      ): TransactionProps[] | null => {
        if (!prev) return null; // Handle null case
        return prev.map((transaction) =>
          transaction.id === updatedAvailedService.transactionId
            ? {
                ...transaction,
                availedServices: transaction.availedServices.map((service) =>
                  service.id === updatedAvailedService.id
                    ? updatedAvailedService
                    : service,
                ),
              }
            : transaction,
        );
      };

      setFetchedTransactions(updateTransactionsState);

      // Update the selected transaction view state safely
      setSelectedTransaction((prevSelected) => {
        if (
          !prevSelected ||
          prevSelected.id !== updatedAvailedService.transactionId
        ) {
          return prevSelected; // No change needed if not selected or different transaction
        }
        // Apply the update to the selected transaction
        return {
          ...prevSelected,
          availedServices: prevSelected.availedServices.map((service) =>
            service.id === updatedAvailedService.id
              ? updatedAvailedService
              : service,
          ),
        };
      });
    },
    [],
  ); // Dependencies: Keep empty if functional updates cover it

  const handleTransactionCompletion = useCallback(
    (completedTransaction: TransactionProps) => {
      console.log(
        "WorkInterceptedModal: Transaction completed:",
        completedTransaction.id,
      );
      setFetchedTransactions(
        (prev) => prev?.filter((t) => t.id !== completedTransaction.id) ?? null,
      );
      setSelectedTransaction((prev) =>
        prev?.id === completedTransaction.id ? null : prev,
      );
      // Consider showing a success toast instead of alert
      // toast.success(`Transaction for ${completedTransaction.customer.name} completed.`);
    },
    [],
  );

  const handleCheckError = useCallback(
    (error: { availedServiceId: string; message: string }) => {
      console.error("WorkInterceptedModal: Check/Uncheck Error:", error);
      setError(`Error processing service: ${error.message}`); // Show error state
      setProcessingCheckActions((prev) => {
        const newSet = new Set(prev);
        newSet.delete(error.availedServiceId); // Remove processing state on error
        return newSet;
      });
    },
    [],
  );

  useEffect(() => {
    if (!socket) return;
    console.log("WorkInterceptedModal: Attaching socket listeners.");
    socket.on("availedServiceUpdated", handleAvailedServiceUpdate);
    socket.on("transactionCompleted", handleTransactionCompletion);
    socket.on("serviceCheckError", handleCheckError);
    socket.on("serviceUncheckError", handleCheckError);
    return () => {
      console.log("WorkInterceptedModal: Removing socket listeners.");
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
  ]); // Include all handlers

  // --- Fetch Initial Data ---
  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true);
      setError(null);
      try {
        if (typeof accountId === "string") {
          const data = await getActiveTransactions();
          const processedData = data.map((tx) => ({
            ...tx,
            createdAt: new Date(tx.createdAt),
            bookedFor: new Date(tx.bookedFor),
            availedServices: tx.availedServices.map((as) => ({
              ...as,
              checkedBy: as.checkedBy || null,
              servedBy: as.servedBy || null,
              // Ensure nested service object exists, even if partial
              service: as.service || {
                id: "unknown",
                title: "Unknown Service",
              },
            })),
            // Ensure customer object exists
            customer: tx.customer || {
              id: "unknown",
              name: "Unknown Customer",
              email: null,
            },
          }));
          setFetchedTransactions(processedData);
        } else {
          // Don't throw error, just set state appropriately if ID is missing initially
          console.warn(
            "WorkInterceptedModal: Account ID invalid during fetch.",
          );
          setFetchedTransactions(null);
          // setError("Cannot load data: Invalid User ID."); // Optional: Set error state
        }
      } catch (err: any) {
        console.error(
          "WorkInterceptedModal: Error fetching transactions:",
          err,
        );
        setError("Failed to fetch work queue.");
        setFetchedTransactions(null);
      } finally {
        setLoading(false);
      }
    }
    fetchTransactions();
  }, [accountId]); // Re-fetch only if accountId changes

  // --- UI Event Handlers ---
  const handleSelectTransaction = (transaction: TransactionProps) =>
    setSelectedTransaction(transaction);
  const handleCloseDetails = () => setSelectedTransaction(null);
  const handleModalClose = () => router.back(); // Navigate back to close intercepted route

  // --- Check/Uncheck Handler ---
  const handleServiceCheckToggle = useCallback(
    (availedService: AvailedServicesProps, isChecked: boolean) => {
      if (
        !socket ||
        typeof accountId !== "string" ||
        processingCheckActions.has(availedService.id)
      )
        return;
      setProcessingCheckActions((prev) => new Set(prev).add(availedService.id));
      const eventName = isChecked ? "checkService" : "uncheckService";
      console.log(
        `WorkInterceptedModal: Emitting ${eventName} for ${availedService.id}`,
      );
      socket.emit(eventName, {
        availedServiceId: availedService.id,
        transactionId: availedService.transactionId,
        accountId: accountId,
      });
    },
    [socket, accountId, processingCheckActions],
  );

  // --- Checkbox Disabled Logic ---
  const isCheckboxDisabled = useCallback(
    (service: AvailedServicesProps): boolean => {
      if (processingCheckActions.has(service.id)) return true;
      if (service.checkedById && service.checkedById !== accountId) return true;
      if (service.servedById) return true;
      return false;
    },
    [accountId, processingCheckActions],
  );

  // --- Determine Background Color ---
  const getServiceBackgroundColor = useCallback(
    (service: AvailedServicesProps): string => {
      if (processingCheckActions.has(service.id))
        return "animate-pulse bg-customGray text-customBlack opacity-70";
      if (service.servedById) return "bg-green-600 text-customOffWhite";
      if (service.checkedById === accountId)
        return "bg-customDarkPink text-customOffWhite";
      if (service.checkedById) return "bg-customGray text-customBlack";
      return "bg-customBlack text-customOffWhite"; // Default available
    },
    [accountId, processingCheckActions],
  );

  // --- Render Logic for Content ---
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center p-10 text-customBlack/70">
          Loading Work Queue...
        </div>
      );
    }
    // Show error prominently if fetching failed
    if (error && !fetchedTransactions) {
      return (
        <div className="flex h-full flex-col items-center justify-center p-10 text-red-600">
          <AlertCircle className="mb-2" size={30} /> <p>{error}</p>{" "}
        </div>
      );
    }

    // --- Transaction Details View ---
    if (selectedTransaction) {
      return (
        <div className="flex h-full flex-col">
          {" "}
          {/* Takes full height of the scrollable container */}
          {/* Header Section */}
          <div className="flex-shrink-0 rounded-t-md bg-customDarkPink p-3 text-customOffWhite">
            <h2 className="mb-1 truncate text-base font-bold">
              {selectedTransaction.customer.name}
            </h2>
            <div className="space-y-0.5 text-xs text-customOffWhite/80">
              <p>
                <strong>Created:</strong>{" "}
                {selectedTransaction.createdAt.toLocaleDateString()}
              </p>
              <p>
                <strong>Booked:</strong>{" "}
                {selectedTransaction.bookedFor.toLocaleDateString()}{" "}
                {selectedTransaction.bookedFor.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p>
                <strong>Status:</strong>{" "}
                <span
                  className={`font-medium ${selectedTransaction.status === "PENDING" ? "text-orange-200" : "text-green-200"}`}
                >
                  {selectedTransaction.status}
                </span>
              </p>
            </div>
          </div>
          {/* Services List */}
          <div className="flex-grow space-y-2 overflow-y-auto bg-customWhiteBlue p-3">
            {" "}
            {/* Scrolls if needed */}
            {selectedTransaction.availedServices.length === 0 ? (
              <p className="mt-10 text-center italic text-customBlack/60">
                No services availed.
              </p>
            ) : (
              selectedTransaction.availedServices.map((service) => (
                <div
                  key={service.id}
                  className={`flex flex-col rounded-md p-2.5 shadow-sm transition-colors duration-200 ${getServiceBackgroundColor(service)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex min-w-0 flex-grow items-center">
                      {" "}
                      {/* Allow shrinking */}
                      <input
                        type="checkbox"
                        checked={!!service.checkedById}
                        onChange={(e) =>
                          handleServiceCheckToggle(service, e.target.checked)
                        }
                        className={`peer relative mr-2 size-4 flex-shrink-0 appearance-none rounded border border-customGray bg-customOffWhite checked:border-customDarkPink checked:bg-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink/50 focus:ring-offset-1 disabled:opacity-50 ${isCheckboxDisabled(service) ? "cursor-not-allowed" : "cursor-pointer"}`}
                        id={`check-${service.id}`}
                        disabled={isCheckboxDisabled(service)}
                        aria-label={`Check ${service.service.title}`}
                      />
                      <div className="pointer-events-none absolute left-[2px] top-[2px] hidden size-3 text-customOffWhite peer-checked:block peer-disabled:text-customGray/50">
                        {" "}
                        <Check strokeWidth={3} />{" "}
                      </div>
                      <label
                        htmlFor={`check-${service.id}`}
                        className={`truncate text-sm font-medium ${isCheckboxDisabled(service) ? "" : "cursor-pointer"}`}
                      >
                        {service.service.title}{" "}
                        {service.quantity > 1 ? `(x${service.quantity})` : ""}
                      </label>
                    </div>
                    <span className="ml-2 flex-shrink-0 text-sm font-semibold">
                      ₱{service.price}
                    </span>
                  </div>
                  <div
                    className={`mt-1 flex flex-wrap justify-between gap-x-2 pl-[calc(1rem+0.5rem)] text-[11px] opacity-80`}
                  >
                    {" "}
                    {/* Adjusted padding */}
                    <span>
                      Checked:{" "}
                      <span className="font-medium">
                        {service.checkedBy?.name ?? "Nobody"}
                      </span>
                    </span>
                    <span className="text-right">
                      Served:{" "}
                      <span className="font-medium">
                        {service.servedBy?.name ?? "No"}
                      </span>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    // --- Transaction List View ---
    return (
      <div className="h-full overflow-y-auto">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-customGray/90 backdrop-blur-sm">
            <tr>
              <th className="w-1/4 border-b border-customGray px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-customBlack">
                Date
              </th>
              <th className="w-1/2 border-b border-customGray px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-customBlack">
                Customer
              </th>
              <th className="w-1/4 border-b border-customGray px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-customBlack">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-customGray/50 bg-customOffWhite/80">
            {fetchedTransactions && fetchedTransactions.length > 0 ? (
              fetchedTransactions.map((transaction) => (
                <tr
                  className="cursor-pointer hover:bg-customLightBlue/40"
                  key={transaction.id}
                  onClick={() => handleSelectTransaction(transaction)}
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSelectTransaction(transaction)
                  }
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-sm text-customBlack/80">
                    {transaction.bookedFor.toLocaleDateString()}
                  </td>
                  <td className="truncate whitespace-nowrap px-3 py-2.5 text-sm font-medium text-customBlack">
                    {transaction.customer.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-sm">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold lowercase leading-tight ${transaction.status === "PENDING" ? "bg-customDarkPink/20 text-customDarkPink" : transaction.status === "DONE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}
                    >
                      {transaction.status.toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="py-10 text-center text-sm italic text-customBlack/60"
                >
                  {loading ? "Loading..." : "No pending transactions."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // --- Modal Title Definition ---
  const modalTitle = (
    <div className="relative flex items-center justify-center text-center">
      {selectedTransaction && (
        <button
          onClick={handleCloseDetails}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-1 text-customBlack/60 hover:text-customBlack"
          aria-label="Back"
        >
          {" "}
          <ChevronLeft size={20} />{" "}
        </button>
      )}
      <DialogTitle>Work Queue</DialogTitle>
      {/* Spacer to balance the back button, keeping title centered */}
      <div className="absolute right-0 h-6 w-6"></div>
    </div>
  );

  // --- Final Render using Modal ---
  return (
    <Modal
      isOpen={true} // Intercepted route modal is always considered "open" when active
      onClose={handleModalClose} // Use router.back to close
      title={modalTitle}
      // Apply specific styles for this modal's container
      containerClassName="relative m-auto flex flex-col max-h-[85vh] h-[600px] w-full max-w-md overflow-hidden rounded-lg bg-customOffWhite shadow-xl border-2 border-customDarkPink/50" // Fixed height, flex-col, overflow-hidden
    >
      {/* Error display (optional, shown below title) */}
      {error && !loading && (
        <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-red-200 bg-red-50 p-3 text-center text-sm text-red-600">
          <AlertCircle className="inline h-5 w-5" /> {error}
        </div>
      )}
      {/* This inner div handles the scrolling of the list or details */}
      <div className="min-h-0 flex-grow overflow-hidden">
        {" "}
        {/* Added min-h-0 for flexbox calculation */}
        {renderContent()}
      </div>
    </Modal>
  );
}
