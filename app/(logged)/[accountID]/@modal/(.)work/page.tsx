"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import {
  ChevronLeft,
  Check,
  AlertCircle,
  Loader2,
  Circle,
  CheckCircle,
  UserCheck,
  Clock,
  ListChecks,
  X,
} from "lucide-react";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { getActiveTransactions } from "@/lib/ServerAction"; // Adjust path
import {
  TransactionProps,
  AvailedServicesProps,
  AccountInfo,
} from "@/lib/Types"; // Adjust path
// import { toast } from 'react-hot-toast';

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
  const [loading, setLoading] = useState(true); // Loading state for initial fetch
  const [socket, setSocket] = useState<Socket | null>(null);
  const [processingCheckActions, setProcessingCheckActions] = useState<
    Set<string>
  >(new Set()); // IDs of services being checked/unchecked
  const [error, setError] = useState<string | null>(null); // General error display

  // --- Socket Connection ---
  useEffect(() => {
    if (typeof accountId !== "string" || !accountId) {
      setError("Invalid User ID.");
      setLoading(false);
      return;
    }
    const backendUrl = "https://beautyfeel-prisma.onrender.com";

    if (!backendUrl) {
      setError("Server Connection Error.");
      setLoading(false);
      return;
    }
    const newSocket = io(backendUrl, {
      reconnectionAttempts: 5,
      timeout: 10000,
      query: { accountId },
    });
    setSocket(newSocket);
    newSocket.on("connect", () => {
      console.log("WorkInterceptedModal: Socket connected:", newSocket.id);
      setError(null);
    });
    newSocket.on("disconnect", (reason) =>
      console.log("WorkInterceptedModal: Socket disconnected:", reason),
    );
    newSocket.on("connect_error", (err) => {
      console.error("WorkInterceptedModal: Socket connection error:", err);
      setError("Connection failed. Refresh?");
    });
    return () => {
      if (newSocket?.connected) newSocket.disconnect();
      setSocket(null);
    };
  }, [accountId]);

  // --- Format Currency ---
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

  const handleAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      if (!updatedAvailedService?.id) return;
      console.log(
        `WorkInterceptedModal: Update for AS_ID=${updatedAvailedService.id}, TX_ID=${updatedAvailedService.transactionId}`,
      );
      setProcessingCheckActions((prev) => {
        if (!prev.has(updatedAvailedService.id)) return prev;
        const next = new Set(prev);
        next.delete(updatedAvailedService.id);
        return next;
      });
      // Immutable update logic
      const updateList = (
        list: AvailedServicesProps[],
      ): AvailedServicesProps[] =>
        list.map((s) =>
          s.id === updatedAvailedService.id
            ? { ...s, ...updatedAvailedService }
            : s,
        );
      setFetchedTransactions(
        (prev) =>
          prev?.map((tx) =>
            tx.id === updatedAvailedService.transactionId
              ? { ...tx, availedServices: updateList(tx.availedServices ?? []) }
              : tx,
          ) ?? null,
      );
      setSelectedTransaction((prev) =>
        prev?.id === updatedAvailedService.transactionId
          ? { ...prev, availedServices: updateList(prev.availedServices ?? []) }
          : prev,
      );
    },
    [],
  ); // Empty deps - uses functional updates

  const handleTransactionCompletion = useCallback(
    (completedTransaction: TransactionProps) => {
      if (!completedTransaction?.id) return;
      console.log(
        `WorkInterceptedModal: Transaction completed: ${completedTransaction.id}`,
      );
      setFetchedTransactions(
        (prev) => prev?.filter((t) => t.id !== completedTransaction.id) ?? null,
      );
      setSelectedTransaction((prev) =>
        prev?.id === completedTransaction.id ? null : prev,
      );
      // toast.success(`Transaction completed.`);
    },
    [],
  ); // Empty deps

  const handleCheckError = useCallback(
    (error: { availedServiceId?: string; message?: string }) => {
      if (!error?.availedServiceId) return;
      console.error(
        `WorkInterceptedModal: Check Error for ${error.availedServiceId}:`,
        error.message,
      );
      setError(`Action Failed: ${error.message || "Unknown error"}`); // Display error
      // toast.error(`Action Failed: ${error.message || "Unknown error"}`);
      setProcessingCheckActions((prev) => {
        if (!prev.has(error.availedServiceId!)) return prev;
        const next = new Set(prev);
        next.delete(error.availedServiceId!);
        return next;
      }); // Clear processing on error
    },
    [],
  ); // Empty deps

  // Attach/Detach Listeners
  useEffect(() => {
    if (!socket) return;
    socket.on("availedServiceUpdated", handleAvailedServiceUpdate);
    socket.on("transactionCompleted", handleTransactionCompletion);
    socket.on("serviceCheckError", handleCheckError);
    socket.on("serviceUncheckError", handleCheckError);
    return () => {
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
  ]); // Include stable handlers

  // --- Fetch Initial Data ---
  useEffect(() => {
    let isMounted = true;
    async function fetchTransactions() {
      setLoading(true);
      setError(null);
      setFetchedTransactions(null);
      setSelectedTransaction(null);
      if (typeof accountId !== "string" || !accountId) {
        setLoading(false);
        return;
      }
      try {
        const data = await getActiveTransactions(); // Assume action returns correct TransactionProps[]
        if (isMounted) {
          if (!Array.isArray(data)) throw new Error("Fetched data invalid.");
          setFetchedTransactions(data);
        }
      } catch (err: any) {
        if (isMounted) setError(`Fetch error: ${err.message || "Unknown"}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchTransactions();
    return () => {
      isMounted = false;
    };
  }, [accountId]);

  // --- UI Event Handlers ---
  const handleSelectTransaction = (transaction: TransactionProps) => {
    setError(null);
    setSelectedTransaction(transaction);
  }; // Clear error when selecting details
  const handleCloseDetails = () => setSelectedTransaction(null);
  const handleModalClose = () => router.back();

  // --- Check/Uncheck Handler ---
  const handleServiceCheckToggle = useCallback(
    (availedService: AvailedServicesProps, isChecked: boolean) => {
      if (
        !socket ||
        typeof accountId !== "string" ||
        !accountId ||
        processingCheckActions.has(availedService.id)
      )
        return;
      setProcessingCheckActions((prev) => new Set(prev).add(availedService.id));
      setError(null); // Clear general error before new action
      const eventName = isChecked ? "checkService" : "uncheckService";
      const payload = {
        availedServiceId: availedService.id,
        transactionId: availedService.transactionId,
        accountId,
      };
      socket.emit(eventName, payload);
    },
    [socket, accountId, processingCheckActions],
  ); // Include processingCheckActions

  // --- Checkbox Disabled Logic ---
  const isCheckboxDisabled = useCallback(
    (service: AvailedServicesProps): boolean => {
      return (
        processingCheckActions.has(service.id) ||
        (!!service.checkedById && service.checkedById !== accountId) ||
        !!service.servedById
      );
    },
    [accountId, processingCheckActions],
  );

  // --- Render Logic ---
  const renderContent = () => {
    if (loading)
      return (
        <div className="flex h-full items-center justify-center p-10 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
        </div>
      );
    // Only show critical fetch error if NO transactions loaded
    if (
      error &&
      !loading &&
      !selectedTransaction &&
      !fetchedTransactions?.length
    )
      return (
        <div className="flex h-full flex-col items-center justify-center p-10 text-red-600">
          <AlertCircle className="mb-2 h-8 w-8" />
          <p className="text-center font-medium">{error}</p>
        </div>
      );

    // Details View
    if (selectedTransaction) {
      return (
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-customDarkPink/30 bg-customDarkPink/10 p-3">
            <h2 className="mb-1 truncate text-base font-semibold text-customDarkPink">
              {selectedTransaction.customer?.name ?? "Unknown"}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Clock size={12} /> Created:{" "}
                {selectedTransaction.createdAt?.toLocaleDateString() ?? "N/A"}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> Booked:{" "}
                {selectedTransaction.bookedFor?.toLocaleDateString() ?? "N/A"} @{" "}
                {selectedTransaction.bookedFor?.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }) ?? ""}
              </span>
              <span className="flex items-center gap-1">
                Status:{" "}
                <span
                  className={`font-medium ${selectedTransaction.status === "PENDING" ? "text-orange-600" : "text-green-600"}`}
                >
                  {selectedTransaction.status}
                </span>
              </span>
            </div>
          </div>
          {/* Error specific to this transaction's actions */}
          {error && (
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-red-200 bg-red-100 p-2 text-sm text-red-700">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          {/* Services List */}
          <div className="flex-grow space-y-2 overflow-y-auto bg-gray-50 p-3">
            {selectedTransaction.availedServices.length === 0 ? (
              <p className="mt-10 text-center italic text-gray-500">
                No services.
              </p>
            ) : (
              selectedTransaction.availedServices.map((service) => {
                const isProcessing = processingCheckActions.has(service.id);
                const isCheckedByMe = service.checkedById === accountId;
                const isCheckedByOther =
                  !!service.checkedById && !isCheckedByMe;
                const isServed = !!service.servedById;
                const isDisabled = isCheckboxDisabled(service);
                return (
                  <div
                    key={service.id}
                    className={`flex flex-col rounded-lg border bg-white p-3 shadow-sm transition-opacity duration-150 ${isProcessing ? "animate-pulse opacity-60" : ""} ${isCheckedByMe ? "border-blue-300 bg-blue-50" : "border-gray-200"} ${isCheckedByOther ? "border-yellow-300 bg-yellow-50 opacity-80" : ""} ${isServed ? "border-green-300 bg-green-50 opacity-80" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex min-w-0 flex-grow items-center gap-2.5">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={!!service.checkedById}
                          onClick={() =>
                            handleServiceCheckToggle(
                              service,
                              !service.checkedById,
                            )
                          }
                          disabled={isDisabled || isProcessing}
                          className={`relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-customDarkPink/50 focus:ring-offset-1 ${isDisabled ? "cursor-not-allowed border-gray-300 bg-gray-100" : "cursor-pointer border-gray-400 bg-white hover:border-customDarkPink"} ${service.checkedById ? "border-customDarkPink bg-customDarkPink" : ""}`}
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
                              className="text-black"
                              strokeWidth={3}
                            />
                          )}
                        </button>
                        <label
                          className={`truncate text-sm font-medium text-gray-800 ${isDisabled ? "" : "cursor-pointer"}`}
                          onClick={() =>
                            !isDisabled &&
                            !isProcessing &&
                            handleServiceCheckToggle(
                              service,
                              !service.checkedById,
                            )
                          }
                        >
                          {service.service?.title ?? "Unknown"}{" "}
                          {service.originatingSetTitle && (
                            <span className="ml-1 text-[10px] font-normal text-gray-500">
                              (from {service.originatingSetTitle})
                            </span>
                          )}
                        </label>
                      </div>
                      <span
                        className={`ml-2 flex-shrink-0 text-sm font-semibold ${isServed ? "text-green-700" : isCheckedByMe ? "text-blue-700" : "text-gray-700"}`}
                      >
                        {formatCurrency(service.price)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 pl-8 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <UserCheck
                          size={12}
                          className={`${isCheckedByOther ? "text-yellow-600" : isCheckedByMe ? "text-blue-600" : "text-gray-400"}`}
                        />
                        Checked:
                        <span
                          className={`ml-1 font-medium ${isCheckedByOther ? "text-yellow-700" : isCheckedByMe ? "text-blue-700" : "text-gray-600"}`}
                        >
                          {service.checkedBy?.name ?? "Nobody"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-right">
                        <CheckCircle
                          size={12}
                          className={`${isServed ? "text-green-600" : "text-gray-400"}`}
                        />
                        Served:
                        <span
                          className={`ml-1 font-medium ${isServed ? "text-green-700" : "text-gray-600"}`}
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

    // Transaction List View
    return (
      <div className="h-full overflow-y-auto">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-100/80 backdrop-blur-sm">
            <tr>
              <th className="w-[30%] border-b border-gray-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Date/Time
              </th>
              <th className="w-[45%] border-b border-gray-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Customer
              </th>
              <th className="w-[25%] border-b border-gray-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {/* Show error inline if list fetch failed but component didn't unmount */}
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
            {/* Table rows */}
            {fetchedTransactions && fetchedTransactions.length > 0
              ? fetchedTransactions.map((transaction) => (
                  <tr
                    className="cursor-pointer hover:bg-blue-50/50"
                    key={transaction.id}
                    onClick={() => handleSelectTransaction(transaction)}
                    tabIndex={0}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleSelectTransaction(transaction)
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-600">
                      <div>
                        {transaction.bookedFor?.toLocaleDateString() ?? "N/A"}
                      </div>
                      <div className="text-[10px]">
                        {transaction.bookedFor?.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        }) ?? ""}
                      </div>
                    </td>
                    <td className="truncate px-3 py-2.5 text-sm font-medium text-gray-800">
                      {transaction.customer?.name ?? "Unknown"}
                    </td>
                    <td className="px-3 py-2.5 text-sm">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold lowercase leading-tight ${transaction.status === "PENDING" ? "bg-orange-100 text-orange-700" : ""} ${transaction.status === "DONE" ? "bg-green-100 text-green-800" : ""} ${transaction.status !== "PENDING" && transaction.status !== "DONE" ? "bg-red-100 text-red-700" : ""}`}
                      >
                        {transaction.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))
              : !error &&
                !loading && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-10 text-center text-sm italic text-gray-500"
                    >
                      No pending transactions.
                    </td>
                  </tr>
                )}
          </tbody>
        </table>
      </div>
    );
  };

  // Modal Title
  const modalTitle = (
    <div className="relative w-full text-center">
      <div className="flex items-center justify-center">
        {!selectedTransaction && (
          <ListChecks size={18} className="mr-2 text-customDarkPink" />
        )}
        <DialogTitle>
          {selectedTransaction ? "Transaction Details" : "Work Queue"}
        </DialogTitle>
      </div>
      <button
        onClick={handleModalClose}
        className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-customDarkPink"
        aria-label="Close"
      >
        <X size={20} />
      </button>
      {selectedTransaction && (
        <button
          onClick={handleCloseDetails}
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-customDarkPink"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
      )}
    </div>
  );

  // Final Render
  return (
    <Modal
      isOpen={true}
      onClose={handleModalClose}
      title={modalTitle}
      hideDefaultHeader={false}
      hideDefaultCloseButton={true}
      titleClassName="p-4 border-b border-gray-200 bg-white"
      contentClassName="p-0"
      containerClassName="relative m-auto flex flex-col max-h-[90vh] h-[700px] w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl border border-gray-200"
      size="lg"
    >
      {/* Error Display (Only shows non-critical errors after initial load) */}
      {error && !loading && fetchedTransactions && (
        <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-red-200 bg-red-50 p-2 text-center text-sm text-red-600">
          <AlertCircle className="inline h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {/* Main Content */}
      <div className="min-h-0 flex-grow overflow-hidden bg-gray-50">
        {renderContent()}
      </div>
    </Modal>
  );
}
