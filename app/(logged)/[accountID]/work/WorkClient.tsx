"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import {
  ChevronLeft,
  AlertCircle,
  Loader2,
  CheckCircle,
  UserCheck,
  Clock,
  ListChecks,
  X,
  CircleDashed,
} from "lucide-react";
import { getActiveTransactions } from "@/lib/ServerAction";
import { TransactionPropsForTransactions, AvailedServicesProps, AvailedServicesPropsForTransactions } from "@/lib/Types";
import { Status } from "@prisma/client";

interface WorkClientProps {
  initialTransactions: TransactionPropsForTransactions[];
  accountId: string;
  loggedInUserId: string;
}

export default function WorkClient({
  initialTransactions,
  accountId,
  loggedInUserId,
}: WorkClientProps) {
  const router = useRouter();
  const [fetchedTransactions, setFetchedTransactions] = useState<
    TransactionPropsForTransactions[] | null
  >(initialTransactions || null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionPropsForTransactions | null>(null);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
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
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:9000";

    if (!backendUrl) {
      setError("Server Connection Error: URL not configured.");
      setLoading(false);
      return;
    }

    if (
      socketRef.current?.connected &&
      (socketRef.current.io.opts.query as { accountId?: string })?.accountId ===
        accountId
    ) {
      setSocket(socketRef.current);
      setSocketConnected(true);
      return;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const newSocket = io(backendUrl, {
      reconnectionAttempts: 5,
      timeout: 20000,
      query: { accountId },
    });
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on("connect", () => {
      console.log("WorkPage: Socket connected:", newSocket.id);
      setSocketConnected(true);
      setError(null);
    });
    newSocket.on("disconnect", (reason) => {
      console.log("WorkPage: Socket disconnected:", reason);
      setSocketConnected(false);
    });
    newSocket.on("connect_error", (err) => {
      console.error("WorkPage: Socket connection error:", err);
      setError("Connection failed. Please check network or refresh.");
      setSocketConnected(false);
    });

    return () => {
      if (newSocket?.connected) {
        newSocket.disconnect();
      }
      setSocket(null);
      setSocketConnected(false);
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
    (updatedAvailedService: AvailedServicesPropsForTransactions) => {
      if (!updatedAvailedService?.id) return;
      setProcessingCheckActions((prev) => {
        if (!prev.has(updatedAvailedService.id)) return prev;
        const next = new Set(prev);
        next.delete(updatedAvailedService.id);
        return next;
      });
      const updateList = (
        list: AvailedServicesPropsForTransactions[] = [],
      ): AvailedServicesPropsForTransactions[] =>
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
    (completedTransaction: TransactionPropsForTransactions) => {
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

  const refreshTransactions = useCallback(async () => {
    if (typeof accountId !== "string" || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveTransactions(loggedInUserId);
      if (!Array.isArray(data)) {
        throw new Error("Invalid data received from server.");
      }
      // getActiveTransactions already returns TransactionPropsForTransactions[] with proper types
      setFetchedTransactions(data);
    } catch (err: any) {
      setError(`Fetch error: ${err.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [accountId, loggedInUserId]);

  const { serveNowTransactions, futureTransactions } = useMemo(() => {
    if (!fetchedTransactions)
      return { serveNowTransactions: [], futureTransactions: [] };

    const serveNowItems: TransactionPropsForTransactions[] = [];
    const futureItems: TransactionPropsForTransactions[] = [];
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
    const sortByBookedFor = (a: TransactionPropsForTransactions, b: TransactionPropsForTransactions) =>
      (a.bookedFor?.getTime() ?? 0) - (b.bookedFor?.getTime() ?? 0);
    serveNowItems.sort(sortByBookedFor);
    futureItems.sort(sortByBookedFor);
    return {
      serveNowTransactions: serveNowItems,
      futureTransactions: futureItems,
    };
  }, [fetchedTransactions]);

  const handleSelectTransaction = (transaction: TransactionPropsForTransactions) => {
    setError(null);
    setSelectedTransaction(transaction);
  };
  const handleCloseDetails = () => {
    setSelectedTransaction(null);
    setError(null);
  };

  const handleServiceCheckToggle = useCallback(
    (availedService: AvailedServicesPropsForTransactions, wantsToBecomeChecked: boolean) => {
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
    (service: AvailedServicesPropsForTransactions): boolean => {
      // Check if any unit is being processed
      if (processingCheckActions.has(service.id)) return true;
      
      // Check if any unit is checked by someone else or served
      if (service.units && service.units.length > 0) {
        return service.units.some(
          (unit) =>
            (unit.checkedById && unit.checkedById !== accountId) ||
            !!unit.servedById
        );
      }
      
      return false;
    },
    [accountId, processingCheckActions],
  );

  const renderTransactionTable = (
    transactions: TransactionPropsForTransactions[],
    title: string,
  ) => (
    <div className="mb-1">
      <h3 className="sticky top-0 z-20 border-b border-t border-customGray bg-customOffWhite px-4 py-2.5 text-sm font-semibold text-customDarkPink">
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

          <div className="flex-grow space-y-2 overflow-y-auto bg-customOffWhite/50 p-3">
            {selectedTransaction.availedServices?.map((service) => (
              <div
                key={service.id}
                className="rounded-lg border border-customGray/30 bg-white p-3 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-customBlack">
                      {service.service?.title ||
                        service.originatingSet?.title ||
                        "Unknown Service"}
                    </h4>
                    <p className="text-sm text-gray-600">
                      Quantity: {service.quantity} ×{" "}
                      {formatCurrency(service.price / (service.quantity || 1))}
                    </p>
                    <p className="text-sm font-medium text-customDarkPink">
                      Total: {formatCurrency(service.price)}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    {service.units && service.units.some((unit) => unit.checkedById === accountId) ? (
                      <button
                        onClick={() => handleServiceCheckToggle(service, false)}
                        disabled={isCheckboxDisabled(service)}
                        className="flex items-center gap-1 rounded bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200 disabled:opacity-50"
                      >
                        <UserCheck size={14} />
                        Checked In
                      </button>
                    ) : (
                      <button
                        onClick={() => handleServiceCheckToggle(service, true)}
                        disabled={isCheckboxDisabled(service)}
                        className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                      >
                        <CircleDashed size={14} />
                        Check In
                      </button>
                    )}
                  </div>
                </div>

                {service.units && service.units.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-customGray/30 pt-2">
                    {service.units.map((unit, idx) => (
                      <div
                        key={unit.id || idx}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-600">
                          Unit {unit.unitIndex + 1}
                        </span>
                        <span
                          className={`font-medium ${
                            unit.status === Status.DONE
                              ? "text-green-600"
                              : unit.status === Status.PENDING &&
                                  unit.checkedById === accountId
                                ? "text-orange-600"
                              : "text-gray-500"
                          }`}
                        >
                          {unit.status === Status.DONE
                            ? "Served"
                            : unit.checkedById === accountId
                              ? "Checked In"
                              : "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex-shrink-0 border-t border-customGray bg-white p-3">
            <button
              onClick={handleCloseDetails}
              className="w-full rounded bg-customDarkPink px-4 py-2 text-sm font-medium text-white hover:bg-customDarkPink/90"
            >
              Close Details
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex-shrink-0 border-b border-customGray bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-customBlack">
              Work Queue
            </h1>
            <div className="flex items-center gap-2">
              {!socketConnected && (
                <span className="text-xs text-orange-600">
                  Connecting...
                </span>
              )}
              <button
                onClick={refreshTransactions}
                disabled={loading}
                className="rounded bg-customDarkPink px-3 py-1 text-xs text-white hover:bg-customDarkPink/90 disabled:opacity-50"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        {error && !selectedTransaction && (
          <div className="flex-shrink-0 border-b border-red-200 bg-red-100 p-2 text-sm text-red-700">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="flex-grow overflow-y-auto bg-customOffWhite">
          {renderTransactionTable(
            serveNowTransactions,
            "Ready to Serve Now",
          )}
          {renderTransactionTable(futureTransactions, "Upcoming Bookings")}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-customOffWhite">
      <div className="flex-shrink-0 border-b border-customGray bg-white p-3">
        <button
          onClick={() => router.push(`/${accountId}`)}
          className="flex items-center gap-2 text-customDarkPink hover:text-customDarkPink/70"
        >
          <ChevronLeft size={20} />
          <span>Back to Dashboard</span>
        </button>
      </div>
      <div className="flex-grow overflow-hidden">{renderContent()}</div>
    </div>
  );
}

