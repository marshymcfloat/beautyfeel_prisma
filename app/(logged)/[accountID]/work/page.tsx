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
} from "lucide-react";
import { getActiveTransactions } from "@/lib/ServerAction";
import { TransactionProps, AvailedServicesProps } from "@/lib/Types";

export default function WorkPage() {
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

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (typeof accountId !== "string" || !accountId) {
      setError("Invalid User ID.");
      setLoading(false);
      return;
    }
    const backendUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "https://localhost:9000";

    console.log(backendUrl);
    if (!backendUrl) {
      setError("Server Connection Error: URL not configured.");
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
      console.log("WorkPage: Socket connected:", newSocket.id);
      setError(null);
    });
    newSocket.on("disconnect", (reason) =>
      console.log("WorkPage: Socket disconnected:", reason),
    );
    newSocket.on("connect_error", (err) => {
      console.error("WorkPage: Socket connection error:", err);
      setError("Connection failed. Please check network or refresh.");
    });

    return () => {
      if (newSocket?.connected) {
        newSocket.disconnect();
      }
      setSocket(null);
    };
  }, [accountId]);

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
      setProcessingCheckActions((prev) => {
        if (!prev.has(updatedAvailedService.id)) return prev;
        const next = new Set(prev);
        next.delete(updatedAvailedService.id);
        return next;
      });
      const updateList = (
        list: AvailedServicesProps[] = [],
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

  const handleCheckError = useCallback(
    (errorData: { availedServiceId?: string; message?: string }) => {
      if (!errorData?.availedServiceId && !errorData?.message) {
        setError("An unknown action error occurred.");
        return;
      }
      const message = `Action Failed: ${errorData.message || "Unknown error"}`;
      setError(message);
      if (errorData.availedServiceId) {
        setProcessingCheckActions((prev) => {
          if (!prev.has(errorData.availedServiceId!)) return prev;
          const next = new Set(prev);
          next.delete(errorData.availedServiceId!);
          return next;
        });
      }
    },
    [],
  );

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

  useEffect(() => {
    let isMounted = true;
    async function fetchTransactionsData() {
      setLoading(true);
      setError(null);
      setFetchedTransactions(null);
      setSelectedTransaction(null);

      if (typeof accountId !== "string" || !accountId) {
        if (isMounted) {
          setError("Invalid User ID for fetching data.");
          setLoading(false);
        }
        return;
      }
      try {
        const data = await getActiveTransactions();
        if (isMounted) {
          if (!Array.isArray(data)) {
            throw new Error("Invalid data received from server.");
          }
          const processedData = data.map((tx) => ({
            ...tx,
            createdAt: tx.createdAt ? new Date(tx.createdAt) : undefined,
            bookedFor: tx.bookedFor ? new Date(tx.bookedFor) : undefined,
            availedServices:
              tx.availedServices?.map((service) => ({
                ...service,
              })) || [],
          }));
          setFetchedTransactions(processedData);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(`Fetch error: ${err.message || "Unknown error"}`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
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
    const now = new Date();

    fetchedTransactions.forEach((tx) => {
      if (tx.status === "PENDING") {
        const bookedForDate = tx.bookedFor;
        if (!bookedForDate || bookedForDate <= now) {
          serveNowItems.push(tx);
        } else {
          futureItems.push(tx);
        }
      }
    });
    const sortByBookedFor = (a: TransactionProps, b: TransactionProps) =>
      (a.bookedFor?.getTime() ?? 0) - (b.bookedFor?.getTime() ?? 0);
    serveNowItems.sort(sortByBookedFor);
    futureItems.sort(sortByBookedFor);
    return {
      serveNowTransactions: serveNowItems,
      futureTransactions: futureItems,
    };
  }, [fetchedTransactions]);

  const handleSelectTransaction = (transaction: TransactionProps) => {
    setError(null);
    setSelectedTransaction(transaction);
  };
  const handleCloseDetails = () => {
    setSelectedTransaction(null);
    setError(null);
  };

  const handleServiceCheckToggle = useCallback(
    (availedService: AvailedServicesProps, wantsToBecomeChecked: boolean) => {
      if (
        !socket ||
        !socket.connected ||
        typeof accountId !== "string" ||
        !accountId ||
        processingCheckActions.has(availedService.id)
      ) {
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

  const renderTransactionTable = (
    transactions: TransactionProps[],
    title: string,
  ) => (
    <div className="mb-1">
      {/* Make sticky header relative to its scrolling container, ensure z-index is high enough */}
      <h3 className="sticky top-0 z-20 border-b border-t border-customGray bg-customOffWhite px-4 py-2.5 text-sm font-semibold text-customDarkPink">
        {title} ({transactions.length})
      </h3>
      {transactions.length > 0 ? (
        <table className="min-w-full table-fixed">
          <thead className="bg-customOffWhite/70">
            {" "}
            {/* This thead is part of the table, not sticky itself */}
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
                className="cursor-pointer transition-colors duration-100 hover:bg-customDarkPink/10"
                key={transaction.id}
                onClick={() => handleSelectTransaction(transaction)}
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleSelectTransaction(transaction)
                }
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-customBlack/80">
                  <div>
                    {transaction.bookedFor?.toLocaleDateString() ?? "N/A"}
                  </div>
                  <div className="text-[10px] text-gray-500">
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

  const renderContent = () => {
    if (loading)
      return (
        <div className="flex h-full items-center justify-center p-10 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-customDarkPink" />{" "}
          Loading Work Queue...
        </div>
      );

    if (
      error &&
      !selectedTransaction &&
      (!fetchedTransactions || fetchedTransactions.length === 0)
    )
      return (
        <div className="flex h-full flex-col items-center justify-center p-10 text-center text-red-600">
          <AlertCircle className="mb-2 h-8 w-8" />
          <p className="font-medium">{error}</p>
          <p className="mt-1 text-sm">
            Try refreshing the page or check your connection.
          </p>
        </div>
      );

    if (selectedTransaction) {
      return (
        <div className="flex h-full flex-col">
          <div className="flex-shrink-0 border-b border-customGray bg-white p-3 shadow-sm">
            {" "}
            {/* Sticky header for details is main page header */}
            <h2 className="mb-1 truncate text-base font-semibold text-customBlack">
              Customer: {selectedTransaction.customer?.name ?? "N/A"}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-customBlack/70">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-customGray" /> Created:{" "}
                {selectedTransaction.createdAt?.toLocaleDateString() ?? "N/A"}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-customGray" /> Booked:{" "}
                {selectedTransaction.bookedFor?.toLocaleDateString() ?? "N/A"} @{" "}
                {selectedTransaction.bookedFor?.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }) ?? ""}
              </span>
              <span className="flex items-center gap-1">
                Status:
                <span
                  className={`font-medium ${selectedTransaction.status === "PENDING" ? `text-orange-600` : selectedTransaction.status === "DONE" ? `text-green-600` : `text-red-600`}`}
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
          {/* This div is the scrollable container for availed services */}
          <div className="flex-grow space-y-2 overflow-y-auto bg-customOffWhite/50 p-3">
            {(selectedTransaction.availedServices ?? []).length === 0 ? (
              <p className="mt-10 text-center italic text-gray-500">
                No services listed for this transaction.
              </p>
            ) : (
              (selectedTransaction.availedServices ?? []).map((service) => {
                const isProcessing = processingCheckActions.has(service.id);
                const isActuallyChecked = !!service.checkedById;
                const isCheckedByMe = service.checkedById === accountId;
                const isCheckedByOther = isActuallyChecked && !isCheckedByMe;
                const isServed = !!service.servedById;
                const isDisabled = isCheckboxDisabled(service);

                let itemClasses = `flex flex-col rounded-lg border bg-white p-3 shadow-sm transition-opacity duration-150`;
                if (isServed) {
                  itemClasses += ` border-green-400 bg-green-50 opacity-90`;
                } else if (isCheckedByMe) {
                  itemClasses += ` border-customDarkPink bg-customDarkPink/10`;
                } else if (isCheckedByOther) {
                  itemClasses += ` border-amber-400 bg-amber-50 opacity-90`;
                } else {
                  itemClasses += ` border-customGray`;
                }
                if (isProcessing) itemClasses += " animate-pulse opacity-60";

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
                          disabled={isDisabled || isProcessing}
                          className={`relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-customDarkPink/50 focus:ring-offset-1 ${isDisabled || isProcessing ? `cursor-not-allowed border-customGray bg-gray-100` : `cursor-pointer border-customGray bg-white hover:border-customDarkPink`} ${isActuallyChecked ? `border-customDarkPink bg-customDarkPink` : ""}`}
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
                              className="text-white"
                              strokeWidth={3}
                            />
                          )}
                        </button>
                        <label
                          className={`truncate text-sm font-medium text-customBlack ${isDisabled || isProcessing ? "" : "cursor-pointer"}`}
                          onClick={() =>
                            !(isDisabled || isProcessing) &&
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
      <div className="h-full overflow-y-auto">
        {error &&
          !loading &&
          (serveNowTransactions.length > 0 ||
            futureTransactions.length > 0) && (
            <div className="sticky top-0 z-30 border-b border-red-200 bg-red-100 p-3 text-center text-sm text-red-700 shadow-sm">
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

  const pageTitleText = selectedTransaction
    ? "Transaction Details"
    : "Work Queue";

  return (
    <div className="flex min-h-screen items-center justify-center bg-custom-gradient p-2 sm:p-4">
      <div className="flex h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-customGray bg-customOffWhite shadow-PageShadow">
        {/* Page Header - this is fixed and not part of the scrollable content below */}
        <div className="flex flex-shrink-0 items-center border-b border-customGray bg-white p-4 shadow-sm">
          <button
            onClick={
              selectedTransaction
                ? handleCloseDetails
                : () => router.push(`/${accountId}`)
            }
            className="mr-4 rounded-full p-1.5 text-customGray hover:bg-customGray/20 hover:text-customBlack focus:outline-none focus:ring-1 focus:ring-customDarkPink"
            aria-label={
              selectedTransaction
                ? "Back to Work Queue"
                : "Back to Account Dashboard"
            }
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="flex flex-grow items-center text-lg font-semibold text-customBlack">
            {selectedTransaction ? (
              <Clock size={18} className="mr-2 text-customDarkPink" />
            ) : (
              <ListChecks size={18} className="mr-2 text-customDarkPink" />
            )}
            {pageTitleText}
          </h1>
        </div>

        <div className="min-h-0 flex-grow overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
