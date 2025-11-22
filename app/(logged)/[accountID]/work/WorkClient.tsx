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
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/Separator";
import { toast } from "sonner";
import { getActiveTransactions } from "@/lib/ServerAction";
import {
  TransactionPropsForTransactions,
  AvailedServicesProps,
  AvailedServicesPropsForTransactions,
} from "@/lib/Types";
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
      toast.success("Connected to server", {
        description: "Real-time updates are now active.",
        duration: 2000,
      });
    });
    newSocket.on("disconnect", (reason) => {
      console.log("WorkPage: Socket disconnected:", reason);
      setSocketConnected(false);
      if (reason === "io server disconnect") {
        toast.error("Disconnected from server", {
          description: "Please refresh the page to reconnect.",
        });
      }
    });
    newSocket.on("connect_error", (err) => {
      console.error("WorkPage: Socket connection error:", err);
      const errorMsg = "Connection failed. Please check network or refresh.";
      setError(errorMsg);
      setSocketConnected(false);
      toast.error("Connection error", {
        description: errorMsg,
      });
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

      // Show success toast
      const serviceTitle =
        updatedAvailedService.service?.title ||
        updatedAvailedService.originatingSet?.title ||
        "Service";
      toast.success("Service updated", {
        description: `${serviceTitle} has been updated successfully.`,
        duration: 2000,
      });
    },
    [],
  );

  const handleTransactionCompletion = useCallback(
    (completedTransaction: TransactionPropsForTransactions) => {
      if (!completedTransaction?.id) return;

      const customerName = completedTransaction.customer?.name || "Customer";
      toast.success("Transaction completed", {
        description: `Transaction for ${customerName} has been completed.`,
      });

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
        const errorMsg = "An unknown action error occurred.";
        setError(errorMsg);
        toast.error("Action failed", {
          description: errorMsg,
        });
        return;
      }

      const message = `Action Failed: ${errorData.message || "Unknown error"}`;
      setError(message);
      toast.error("Action failed", {
        description: errorData.message || "Unknown error occurred.",
      });

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
      setFetchedTransactions(data);
      toast.success("Refreshed", {
        description: "Work queue has been refreshed.",
        duration: 2000,
      });
    } catch (err: any) {
      const errorMsg = `Fetch error: ${err.message || "Unknown error"}`;
      setError(errorMsg);
      toast.error("Failed to refresh", {
        description: err.message || "Unknown error occurred.",
      });
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
    const sortByBookedFor = (
      a: TransactionPropsForTransactions,
      b: TransactionPropsForTransactions,
    ) => (a.bookedFor?.getTime() ?? 0) - (b.bookedFor?.getTime() ?? 0);
    serveNowItems.sort(sortByBookedFor);
    futureItems.sort(sortByBookedFor);
    return {
      serveNowTransactions: serveNowItems,
      futureTransactions: futureItems,
    };
  }, [fetchedTransactions]);

  const handleSelectTransaction = (
    transaction: TransactionPropsForTransactions,
  ) => {
    setError(null);
    setSelectedTransaction(transaction);
  };

  const handleCloseDetails = () => {
    setSelectedTransaction(null);
    setError(null);
  };

  const handleServiceCheckToggle = useCallback(
    (
      availedService: AvailedServicesPropsForTransactions,
      wantsToBecomeChecked: boolean,
    ) => {
      if (
        !socket ||
        !socket.connected ||
        typeof accountId !== "string" ||
        !accountId ||
        processingCheckActions.has(availedService.id)
      ) {
        if (!socket || !socket.connected) {
          toast.error("Not connected", {
            description: "Please wait for connection to server.",
          });
        }
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
      if (processingCheckActions.has(service.id)) return true;

      if (service.units && service.units.length > 0) {
        return service.units.some(
          (unit) =>
            (unit.checkedById && unit.checkedById !== accountId) ||
            !!unit.servedById,
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
      <Card className="mb-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {title} ({transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-[30%] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Date/Time
                    </th>
                    <th className="w-[45%] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Customer
                    </th>
                    <th className="w-[25%] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {transactions.map((transaction) => (
                    <tr
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      key={transaction.id}
                      onClick={() => handleSelectTransaction(transaction)}
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        handleSelectTransaction(transaction)
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        <div>
                          {transaction.bookedFor?.toLocaleDateString() ?? "N/A"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {transaction.bookedFor?.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          }) ?? ""}
                        </div>
                      </td>
                      <td className="truncate px-3 py-2.5 text-sm font-medium">
                        {transaction.customer?.name ?? "Unknown"}
                      </td>
                      <td className="px-3 py-2.5 text-sm">
                        <Badge
                          variant={
                            transaction.status === "PENDING"
                              ? "default"
                              : transaction.status === "DONE"
                                ? "default"
                                : "destructive"
                          }
                          className={
                            transaction.status === "PENDING"
                              ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                              : transaction.status === "DONE"
                                ? "bg-green-100 text-green-800 hover:bg-green-200"
                                : ""
                          }
                        >
                          {transaction.status.toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {title.includes("Ready to Serve")
                ? "No transactions for immediate service."
                : "No upcoming bookings."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderContent = () => {
    if (loading)
      return (
        <div className="flex h-full flex-col items-center justify-center space-y-4 p-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading Work Queue...</p>
        </div>
      );

    if (
      error &&
      !selectedTransaction &&
      (!fetchedTransactions || fetchedTransactions.length === 0)
    )
      return (
        <Card className="m-4">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold">Connection Error</h3>
            <p className="mb-4 text-muted-foreground">{error}</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Try refreshing the page or check your connection.
            </p>
            <Button onClick={refreshTransactions} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      );

    if (selectedTransaction) {
      const serviceTitle =
        selectedTransaction.customer?.name ?? "N/A";
      const isAnyServiceChecked = selectedTransaction.availedServices?.some(
        (service) =>
          service.units?.some((unit) => unit.checkedById === accountId),
      );

      return (
        <div className="flex h-full flex-col">
          <Card className="m-4 mb-0">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="mb-2 truncate">
                    Customer: {serviceTitle}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> Created:{" "}
                      {selectedTransaction.createdAt?.toLocaleDateString() ??
                        "N/A"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> Booked:{" "}
                      {selectedTransaction.bookedFor?.toLocaleDateString() ??
                        "N/A"}{" "}
                      @{" "}
                      {selectedTransaction.bookedFor?.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }) ?? ""}
                    </span>
                    <Badge
                      variant={
                        selectedTransaction.status === "PENDING"
                          ? "default"
                          : selectedTransaction.status === "DONE"
                            ? "default"
                            : "destructive"
                      }
                      className={
                        selectedTransaction.status === "PENDING"
                          ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                          : selectedTransaction.status === "DONE"
                            ? "bg-green-100 text-green-800 hover:bg-green-200"
                            : ""
                      }
                    >
                      {selectedTransaction.status}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseDetails}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
          </Card>

          {error && (
            <div className="mx-4 mb-0 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            </div>
          )}

          <ScrollArea className="flex-grow">
            <div className="space-y-3 p-4">
              {selectedTransaction.availedServices?.map((service) => {
                const isChecked =
                  service.units?.some(
                    (unit) => unit.checkedById === accountId,
                  ) ?? false;
                const isDisabled = isCheckboxDisabled(service);
                const isProcessing = processingCheckActions.has(service.id);

                return (
                  <Card key={service.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base">
                            {service.service?.title ||
                              service.originatingSet?.title ||
                              "Unknown Service"}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Quantity: {service.quantity} ×{" "}
                            {formatCurrency(
                              service.price / (service.quantity || 1),
                            )}
                          </CardDescription>
                          <p className="mt-1 text-sm font-medium text-primary">
                            Total: {formatCurrency(service.price)}
                          </p>
                        </div>
                        <Button
                          onClick={() =>
                            handleServiceCheckToggle(service, !isChecked)
                          }
                          disabled={isDisabled}
                          variant={isChecked ? "default" : "outline"}
                          size="sm"
                          className={
                            isChecked
                              ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                              : ""
                          }
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Processing...
                            </>
                          ) : isChecked ? (
                            <>
                              <UserCheck className="mr-1 h-3 w-3" />
                              Checked In
                            </>
                          ) : (
                            <>
                              <CircleDashed className="mr-1 h-3 w-3" />
                              Check In
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {service.units && service.units.length > 0 && (
                        <>
                          <Separator className="mb-3" />
                          <div className="space-y-2">
                            {service.units.map((unit, idx) => (
                              <div
                                key={unit.id || idx}
                                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs"
                              >
                                <span className="text-muted-foreground">
                                  Unit {unit.unitIndex + 1}
                                </span>
                                <Badge
                                  variant={
                                    unit.status === Status.DONE
                                      ? "default"
                                      : unit.checkedById === accountId
                                        ? "secondary"
                                        : "outline"
                                  }
                                  className={
                                    unit.status === Status.DONE
                                      ? "bg-green-100 text-green-800 hover:bg-green-200"
                                      : unit.checkedById === accountId
                                        ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                                        : ""
                                  }
                                >
                                  {unit.status === Status.DONE
                                    ? "Served"
                                    : unit.checkedById === accountId
                                      ? "Checked In"
                                      : "Pending"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>

          <div className="border-t bg-background p-4">
            <Button
              onClick={handleCloseDetails}
              variant="outline"
              className="w-full"
            >
              Close Details
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <Card className="m-4 mb-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Work Queue</CardTitle>
              <div className="flex items-center gap-2">
                {socketConnected ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700">
                    <Wifi className="mr-1 h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-orange-50 text-orange-700">
                    <WifiOff className="mr-1 h-3 w-3" />
                    Connecting...
                  </Badge>
                )}
                <Button
                  onClick={refreshTransactions}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Refresh
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {error && !selectedTransaction && (
          <div className="mx-4 mb-0 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          </div>
        )}

        <ScrollArea className="flex-grow">
          <div className="space-y-2 p-4">
            {renderTransactionTable(serveNowTransactions, "Ready to Serve Now")}
            {renderTransactionTable(futureTransactions, "Upcoming Bookings")}
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="border-b bg-background p-3">
        <Button
          variant="ghost"
          onClick={() => router.push(`/${accountId}`)}
          className="flex items-center gap-2"
        >
          <ChevronLeft size={20} />
          <span>Back to Dashboard</span>
        </Button>
      </div>
      <div className="flex-grow overflow-hidden">{renderContent()}</div>
    </div>
  );
}
