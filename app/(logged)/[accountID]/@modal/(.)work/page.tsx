"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  X,
} from "lucide-react";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { getActiveTransactions } from "@/lib/ServerAction";
import { TransactionProps, AvailedServicesProps } from "@/lib/Types";

export default function WorkInterceptedModal() {
  const { accountID: accountIdParam } = useParams();
  const router = useRouter();
  const accountId = Array.isArray(accountIdParam)
    ? accountIdParam[0]
    : accountIdParam;

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

  // --- Socket.IO Setup ---
  useEffect(() => {
    if (typeof accountId !== "string" || !accountId) {
      setError("Invalid User ID.");
      setLoading(false);
      return;
    }
    const backendUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:9000";

    if (!backendUrl) {
      setError("Server Connection Error.");
      setLoading(false);
      return;
    }
    const newSocket = io(backendUrl, {
      reconnectionAttempts: 5,
      timeout: 20000,
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
      setError("Connection failed. Please refresh.");
    });
    return () => {
      if (newSocket?.connected) newSocket.disconnect();
      setSocket(null);
    };
  }, [accountId]);

  // --- Currency Formatting ---
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

  // --- Socket Event Handlers (Updates) ---
  const handleAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      if (!updatedAvailedService?.id) return;
      setProcessingCheckActions((prev) => {
        if (!prev.has(updatedAvailedService.id)) return prev;
        const next = new Set(prev);
        next.delete(updatedAvailedService.id);
        return next;
      });
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
  );

  // --- Socket Event Handlers (Completion) ---
  const handleTransactionCompletion = useCallback(
    (completedTransaction: TransactionProps) => {
      if (!completedTransaction?.id) return;
      setFetchedTransactions(
        (prev) => prev?.filter((t) => t.id !== completedTransaction.id) ?? null,
      );
      setSelectedTransaction((prev) =>
        prev?.id === completedTransaction.id ? null : prev,
      );
    },
    [],
  );

  // --- Socket Event Handlers (Errors) ---
  const handleCheckError = useCallback(
    (error: { availedServiceId?: string; message?: string }) => {
      if (!error?.availedServiceId) return;
      setError(`Action Failed: ${error.message || "Unknown error"}`);
      setProcessingCheckActions((prev) => {
        if (!prev.has(error.availedServiceId!)) return prev;
        const next = new Set(prev);
        next.delete(error.availedServiceId!);
        return next;
      });
    },
    [],
  );

  // --- Register Socket Listeners ---
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
  ]);

  // --- Fetch Initial Data ---
  useEffect(() => {
    let isMounted = true;
    async function fetchTransactionsData() {
      setLoading(true);
      setError(null);
      if (typeof accountId !== "string" || !accountId) {
        setLoading(false);
        return;
      }
      try {
        const data = await getActiveTransactions();
        if (isMounted) {
          if (!Array.isArray(data)) throw new Error("Fetched data invalid.");
          const processedData = data.map((tx) => ({
            ...tx,
            createdAt: tx.createdAt ? new Date(tx.createdAt) : undefined,
            bookedFor: tx.bookedFor ? new Date(tx.bookedFor) : undefined,
          }));
          setFetchedTransactions(processedData);
        }
      } catch (err: any) {
        if (isMounted) setError(`Fetch error: ${err.message || "Unknown"}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchTransactionsData();
    return () => {
      isMounted = false;
    };
  }, [accountId]);

  const { serveNowTransactions, futureTransactions } = useMemo(() => {
    if (!fetchedTransactions)
      return { serveNowTransactions: [], futureTransactions: [] };

    const serveNowItems: TransactionProps[] = [];
    const futureItems: TransactionProps[] = [];

    const now = new Date(); // Current date and time

    fetchedTransactions.forEach((tx) => {
      if (tx.status === "PENDING") {
        const bookedForDate = tx.bookedFor; // Assumes it's already a Date object

        if (!bookedForDate) {
          // No booking date, assume serve now
          serveNowItems.push(tx);
        } else {
          // Compare the full bookedFor timestamp with the current time "now"
          if (bookedForDate <= now) {
            // Booked for now or in the past
            serveNowItems.push(tx);
          } else {
            // Booked for a future time (could be later today or a future date)
            futureItems.push(tx);
          }
        }
      }
    });

    // Sort both lists by the original bookedFor timestamp (earliest first)
    serveNowItems.sort(
      (a, b) => (a.bookedFor?.getTime() ?? 0) - (b.bookedFor?.getTime() ?? 0),
    );
    futureItems.sort(
      (a, b) => (a.bookedFor?.getTime() ?? 0) - (b.bookedFor?.getTime() ?? 0),
    );

    return {
      serveNowTransactions: serveNowItems,
      futureTransactions: futureItems,
    };
  }, [fetchedTransactions]);
  // --- *** END UPDATED *** ---

  // --- UI Event Handlers ---
  const handleSelectTransaction = (transaction: TransactionProps) => {
    setError(null);
    setSelectedTransaction(transaction);
  };
  const handleCloseDetails = () => setSelectedTransaction(null);
  const handleModalClose = () => router.back();

  // --- Action: Toggle Service Check ---
  const handleServiceCheckToggle = useCallback(
    (availedService: AvailedServicesProps, wantsToBecomeChecked: boolean) => {
      if (
        !socket ||
        typeof accountId !== "string" ||
        !accountId ||
        processingCheckActions.has(availedService.id)
      ) {
        return;
      }
      if (!wantsToBecomeChecked && availedService.servedById) {
        return;
      }
      setProcessingCheckActions((prev) => new Set(prev).add(availedService.id));
      setError(null);
      const eventName = wantsToBecomeChecked
        ? "checkService"
        : "uncheckService";
      const payload = {
        availedServiceId: availedService.id,
        transactionId: availedService.transactionId,
        accountId,
      };
      socket.emit(eventName, payload);
    },
    [socket, accountId, processingCheckActions],
  );

  // --- Helper: Determine if Checkbox is Disabled ---
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

  // --- Render Helper: Transaction Table Section ---
  const renderTransactionTable = (
    transactions: TransactionProps[],
    title: string,
  ) => (
    <div className="mb-1">
      <h3 className="sticky top-0 z-10 border-b border-t border-customGray bg-customOffWhite px-4 py-2.5 text-sm font-semibold text-customDarkPink">
        {title} ({transactions.length})
      </h3>
      {transactions.length > 0 ? (
        <table className="min-w-full table-fixed">
          <thead className="bg-customOffWhite/70">
            <tr>
              <th className="w-[30%] border-b border-customGray px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Date/Time
              </th>
              <th className="w-[45%] border-b border-customGray px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Customer
              </th>
              <th className="w-[25%] border-b border-customGray px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-customGray bg-white">
            {transactions.map((transaction) => (
              <tr
                className="cursor-pointer hover:bg-customDarkPink/10"
                key={transaction.id}
                onClick={() => handleSelectTransaction(transaction)}
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleSelectTransaction(transaction)
                }
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-700">
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
                <td className="truncate px-3 py-2.5 text-sm font-medium text-customBlack">
                  {transaction.customer?.name ?? "Unknown"}
                </td>
                <td className="px-3 py-2.5 text-sm">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold lowercase leading-tight ${transaction.status === "PENDING" ? `bg-orange-100 text-orange-700` : ""} ${transaction.status === "DONE" ? `bg-green-100 text-green-800` : ""} ${transaction.status !== "PENDING" && transaction.status !== "DONE" ? "bg-red-100 text-red-700" : ""}`}
                  >
                    {transaction.status.toLowerCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="bg-white px-4 py-4 text-center text-sm italic text-gray-500">
          {title.includes("Ready to Serve")
            ? "No transactions for immediate service."
            : "No upcoming bookings."}
        </p>
      )}
    </div>
  );

  // --- Main Render Logic ---
  const renderContent = () => {
    if (loading)
      return (
        <div className="flex h-full items-center justify-center p-10 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
        </div>
      );

    if (
      error &&
      !loading &&
      !selectedTransaction &&
      (!fetchedTransactions || fetchedTransactions.length === 0)
    )
      return (
        <div className="flex h-full flex-col items-center justify-center p-10 text-red-600">
          <AlertCircle className="mb-2 h-8 w-8" />
          <p className="text-center font-medium">{error}</p>
        </div>
      );

    if (selectedTransaction) {
      return (
        <div className="flex h-full flex-col">
          <div className="flex-shrink-0 border-b border-customGray bg-customOffWhite p-3">
            <h2 className="mb-1 truncate text-base font-semibold text-customBlack">
              {selectedTransaction.customer?.name ?? "Unknown"}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-gray-400" /> Created:{" "}
                {selectedTransaction.createdAt?.toLocaleDateString() ?? "N/A"}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-gray-400" /> Booked:{" "}
                {selectedTransaction.bookedFor?.toLocaleDateString() ?? "N/A"} @
                {selectedTransaction.bookedFor?.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }) ?? ""}
              </span>
              <span className="flex items-center gap-1">
                Status:
                <span
                  className={`font-medium ${selectedTransaction.status === "PENDING" ? `text-orange-700` : `text-green-700`}`}
                >
                  {selectedTransaction.status}
                </span>
              </span>
            </div>
          </div>
          {error && (
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-red-200 bg-red-100 p-2 text-sm text-red-700">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="flex-grow space-y-2 overflow-y-auto bg-customOffWhite p-3">
            {selectedTransaction.availedServices.length === 0 ? (
              <p className="mt-10 text-center italic text-gray-500">
                No services selected for this transaction.
              </p>
            ) : (
              selectedTransaction.availedServices.map((service) => {
                const isProcessing = processingCheckActions.has(service.id);
                const isActuallyChecked = !!service.checkedById;
                const isCheckedByMe = service.checkedById === accountId;
                const isCheckedByOther = isActuallyChecked && !isCheckedByMe;
                const isServed = !!service.servedById;
                const isDisabled = isCheckboxDisabled(service);

                let itemClasses = `flex flex-col rounded-lg border bg-white p-3 shadow-sm transition-opacity duration-150 border-customGray`;
                if (isProcessing) itemClasses += " animate-pulse opacity-60";
                if (isCheckedByMe)
                  itemClasses += ` border-customDarkPink bg-customDarkPink/10`;
                else if (isCheckedByOther)
                  itemClasses += ` border-amber-400 bg-amber-50 opacity-90`;
                else if (isServed)
                  itemClasses += ` border-green-400 bg-green-100 opacity-90`;

                return (
                  <div key={service.id} className={itemClasses}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex min-w-0 flex-grow items-center gap-2.5">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isActuallyChecked}
                          onClick={() =>
                            handleServiceCheckToggle(
                              service,
                              !isActuallyChecked,
                            )
                          }
                          disabled={isDisabled}
                          className={`relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-customDarkPink/50 focus:ring-offset-1 ${isDisabled ? `cursor-not-allowed border-customGray bg-gray-100` : `cursor-pointer border-customGray bg-white hover:border-customDarkPink`} ${isActuallyChecked ? `border-customDarkPink bg-customDarkPink` : ""}`}
                          aria-label={`Check ${service.service?.title ?? "service"}`}
                        >
                          {isProcessing && (
                            <Loader2
                              size={12}
                              className="animate-spin text-gray-500"
                            />
                          )}
                          {!isProcessing && isActuallyChecked && (
                            <Check
                              size={14}
                              className="text-customDarkPink"
                              strokeWidth={3}
                            />
                          )}
                        </button>
                        <label
                          className={`truncate text-sm font-medium text-customBlack ${isDisabled && !isCheckedByMe ? "" : "cursor-pointer"}`}
                          onClick={() =>
                            !isDisabled &&
                            handleServiceCheckToggle(
                              service,
                              !isActuallyChecked,
                            )
                          }
                        >
                          {service.service?.title ?? "Unknown Service"}{" "}
                          {service.originatingSetTitle && (
                            <span className="ml-1 text-[10px] font-normal text-gray-500">
                              (from {service.originatingSetTitle})
                            </span>
                          )}
                        </label>
                      </div>
                      <span
                        className={`ml-2 flex-shrink-0 text-sm font-semibold ${isServed ? "text-green-700" : isCheckedByMe ? `text-customDarkPink` : `text-gray-700`}`}
                      >
                        {formatCurrency(service.price)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 pl-8 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <UserCheck
                          size={12}
                          className={`${isCheckedByOther ? "text-amber-600" : isCheckedByMe ? `text-customDarkPink` : `text-customGray`}`}
                        />
                        Checked:
                        <span
                          className={`ml-1 font-medium ${isCheckedByOther ? "text-amber-700" : isCheckedByMe ? `text-customDarkPink` : `text-gray-600`}`}
                        >
                          {service.checkedBy?.name ?? "Nobody"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-right">
                        <CheckCircle
                          size={12}
                          className={`${isServed ? "text-green-600" : `text-customGray`}`}
                        />
                        Served:
                        <span
                          className={`ml-1 font-medium ${isServed ? "text-green-700" : `text-gray-600`}`}
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

    return (
      <div className="h-full overflow-y-auto bg-customOffWhite">
        {error &&
          !loading &&
          (serveNowTransactions.length > 0 ||
            futureTransactions.length > 0) && (
            <div className="border-b border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
              <AlertCircle className="mr-1 inline h-4 w-4" /> {error}
            </div>
          )}

        {renderTransactionTable(serveNowTransactions, "Ready to Serve")}
        {renderTransactionTable(futureTransactions, "Upcoming Bookings")}

        {!loading &&
          !error &&
          serveNowTransactions.length === 0 &&
          futureTransactions.length === 0 && (
            <p className="py-10 text-center text-sm italic text-gray-500">
              No pending transactions found.
            </p>
          )}
      </div>
    );
  };

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
        className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-customGray hover:bg-customGray/20 hover:text-customBlack focus:outline-none focus:ring-1 focus:ring-customDarkPink"
        aria-label="Close"
      >
        <X size={20} />
      </button>
      {selectedTransaction && (
        <button
          onClick={handleCloseDetails}
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-customGray hover:bg-customGray/20 hover:text-customBlack focus:outline-none focus:ring-1 focus:ring-customDarkPink"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={handleModalClose}
      title={modalTitle}
      hideDefaultHeader={false}
      hideDefaultCloseButton={true}
      titleClassName="p-4 border-b border-customGray bg-customOffWhite text-customBlack"
      contentClassName="p-0"
      containerClassName="relative m-auto flex flex-col max-h-[90vh] h-[700px] w-full max-w-lg overflow-hidden rounded-lg bg-customOffWhite shadow-xl border border-customGray"
      size="lg"
    >
      {error &&
        !loading &&
        fetchedTransactions &&
        fetchedTransactions.length > 0 &&
        !selectedTransaction && (
          <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-red-200 bg-red-50 p-2 text-center text-sm text-red-600">
            <AlertCircle className="inline h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      <div className="min-h-0 flex-grow overflow-hidden bg-customOffWhite">
        {renderContent()}
      </div>
    </Modal>
  );
}
