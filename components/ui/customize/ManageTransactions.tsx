"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useCallback,
  useRef,
} from "react";
import {
  getTransactionsAction,
  cancelTransactionAction,
} from "@/lib/ServerAction";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TransactionListData, ServerActionResponse } from "@/lib/Types";
import { Status } from "@prisma/client";
import {
  Eye,
  XCircle,
  SlidersHorizontal,
  RotateCcw as RefreshIcon,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

const ALL_STATUSES = Object.values(Status);
const TRANSACTIONS_CACHE_KEY: CacheKey = "transactions_ManageTransactions";

export default function ManageTransactions() {
  const [transactions, setTransactions] = useState<TransactionListData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionListData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pendingCancelTransactionId, setPendingCancelTransactionId] = useState<string | null>(null);

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [filters, setFilters] = useState({
    startDate: format(firstDayOfMonth, "yyyy-MM-dd"),
    endDate: format(today, "yyyy-MM-dd"),
    status: "",
  });

  const filterFormRef = useRef<HTMLFormElement>(null);

  const loadData = useCallback(
    async (currentFilters: typeof filters, forceRefresh = false) => {
      setIsLoading(true);
      setListError(null);
      setActionError(null);

      if (!forceRefresh) {
        const cachedData = getCachedData<TransactionListData[]>(
          TRANSACTIONS_CACHE_KEY,
          currentFilters,
        );
        if (cachedData) {
          setTransactions(cachedData);
          setIsLoading(false);

          return;
        }
      }

      try {
        const transactionsRes = await getTransactionsAction({
          startDate: currentFilters.startDate || undefined,
          endDate: currentFilters.endDate || undefined,
          status: currentFilters.status
            ? (currentFilters.status as Status)
            : undefined,
        });

        if (transactionsRes.success && transactionsRes.data) {
          // Normalize undefined to null for fields that can be undefined in TransactionForManagement
          // but are required to be string | null (not undefined) in TransactionListData
          // Also convert AvailedServiceUnitPropsForManagement to AvailedServiceUnitProps
          const normalizedTransactions: TransactionListData[] =
            transactionsRes.data.map((tx) => ({
              ...tx,
              // Normalize nullable fields that might be undefined
              voucherId: tx.voucherId ?? null,
              branchId: tx.branchId ?? null,
              giftCertificateId: tx.giftCertificateId ?? null,
              availedServices: tx.availedServices.map((as) => ({
                ...as,
                originatingSetId: as.originatingSetId ?? null,
                originatingSetTitle: as.originatingSetTitle ?? null,
                serviceSetId: as.serviceSetId ?? null,
                // Convert units from AvailedServiceUnitPropsForManagement to AvailedServiceUnitProps
                // The server action now includes checkedById, servedById, createdAt, and updatedAt
                // Also need to construct full ClientAccountIncluded objects for checkedBy and servedBy
                units: as.units.map((unit) => ({
                  ...unit,
                  // Use the fields that are now included in the server action response
                  checkedById:
                    (unit as any).checkedById ?? unit.checkedBy?.id ?? null,
                  servedById:
                    (unit as any).servedById ?? unit.servedBy?.id ?? null,
                  createdAt: (unit as any).createdAt ?? new Date(),
                  updatedAt: (unit as any).updatedAt ?? new Date(),
                  // Construct full ClientAccountIncluded objects from the minimal ones returned by server
                  checkedBy: unit.checkedBy
                    ? {
                        id: unit.checkedBy.id,
                        username: "", // Not selected in query, set to empty string
                        name: unit.checkedBy.name,
                        email: null, // Not selected in query
                        role: [], // Not selected in query
                        salary: 0, // Not selected in query
                        dailyRate: 0, // Not selected in query
                        branchId: null, // Not selected in query
                        canRequestPayslip: false, // Not selected in query
                        mustChangePassword: false, // Not selected in query
                      }
                    : null,
                  servedBy: unit.servedBy
                    ? {
                        id: unit.servedBy.id,
                        username: "", // Not selected in query, set to empty string
                        name: unit.servedBy.name,
                        email: null, // Not selected in query
                        role: [], // Not selected in query
                        salary: 0, // Not selected in query
                        dailyRate: 0, // Not selected in query
                        branchId: null, // Not selected in query
                        canRequestPayslip: false, // Not selected in query
                        mustChangePassword: false, // Not selected in query
                      }
                    : null,
                })),
              })),
            }));
          setTransactions(normalizedTransactions);
          setCachedData(
            TRANSACTIONS_CACHE_KEY,
            normalizedTransactions,
            currentFilters,
          );
        } else {
          throw new Error(
            transactionsRes.message || "Failed to load transactions.",
          );
        }
      } catch (err: any) {
        setListError(err.message || "Failed to load data.");
        setTransactions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadData(filters);
  }, [filters, loadData]);

  const handleRefresh = () => {
    invalidateCache(TRANSACTIONS_CACHE_KEY);
    loadData(filters, true);
  };

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const resetFilters = () => {
    const defaultFilters = {
      startDate: format(firstDayOfMonth, "yyyy-MM-dd"),
      endDate: format(today, "yyyy-MM-dd"),
      status: "",
    };
    setFilters(defaultFilters);
    if (filterFormRef.current) {
      filterFormRef.current.reset();
      (
        filterFormRef.current.elements.namedItem(
          "startDate",
        ) as HTMLInputElement
      ).value = defaultFilters.startDate;
      (
        filterFormRef.current.elements.namedItem("endDate") as HTMLInputElement
      ).value = defaultFilters.endDate;
    }
  };

  const handleViewDetails = (transaction: TransactionListData) => {
    setSelectedTransaction(transaction);
    setActionError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
    setActionError(null);
  };

  const handleCancelClick = (transactionId: string) => {
    setPendingCancelTransactionId(transactionId);
    setCancelDialogOpen(true);
  };

  const handleCancelTransaction = useCallback(async () => {
    if (!pendingCancelTransactionId) {
      setCancelDialogOpen(false);
      return;
    }

    setActionError(null);
    setCancelDialogOpen(false);
    startTransition(async () => {
      try {
        const res = await cancelTransactionAction(pendingCancelTransactionId);
        if (res.success) {
          toast.success("Transaction cancelled", {
            description: "The transaction has been successfully cancelled.",
          });
          closeModal();
          invalidateCache(TRANSACTIONS_CACHE_KEY);
          await loadData(filters, true);
        } else {
          const errorMsg = res.message || "Failed to cancel transaction.";
          setActionError(errorMsg);
          toast.error("Failed to cancel transaction", {
            description: errorMsg,
          });
        }
      } catch (err: any) {
        const errorMsg = err.message || "An unexpected error occurred.";
        setActionError(errorMsg);
        toast.error("Error", {
          description: errorMsg,
        });
      } finally {
        setPendingCancelTransactionId(null);
      }
    });
  }, [pendingCancelTransactionId, filters, loadData, closeModal]);

  const formatCurrency = (value: number | null | undefined): string => {
    return (value ?? 0).toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (dateString: Date | string | null | undefined): string => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
    } catch {
      return "Invalid Date";
    }
  };

  const formatShortDate = (
    dateString: Date | string | null | undefined,
  ): string => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch {
      return "Invalid Date";
    }
  };

  const getStatusColor = (status: Status): string => {
    switch (status) {
      case Status.PENDING:
        return "bg-yellow-100 text-yellow-800";
      case Status.DONE:
        return "bg-green-100 text-green-800";
      case Status.CANCELLED:
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  const getStatusDotColor = (status: Status): string => {
    switch (status) {
      case Status.PENDING:
        return "bg-yellow-500";
      case Status.DONE:
        return "bg-green-500";
      case Status.CANCELLED:
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatStatus = (status: Status): string => {
    return status.charAt(0) + status.slice(1).toLowerCase();
  };

  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top";
  const inputStyle =
    "block w-full rounded border border-customGray/70 bg-white p-1.5 text-sm shadow-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed";
  const labelStyle = "block text-xs font-medium text-customBlack/70 mb-1";
  const errorMsgStyle =
    "my-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mb-3 text-center";

  return (
    <div className="p-1">
      {}
      <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Transactions
        </h2>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            onClick={handleRefresh}
            size="sm"
            variant="outline"
            className="flex w-full items-center justify-center gap-1.5 sm:w-auto"
            disabled={isLoading || isPending}
            title="Refresh Data"
          >
            <RefreshIcon size={16} />
            <span className="sm:hidden">Refresh</span>
            <span className="hidden sm:inline">Refresh Data</span>
          </Button>
          <Button
            onClick={() => setShowFilters(!showFilters)}
            size="sm"
            variant="outline"
            className="flex w-full items-center justify-center gap-1.5 sm:hidden"
            aria-controls="transaction-filters"
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={16} />
            {showFilters ? "Hide Filters" : "Show Filters"}
          </Button>
        </div>
      </div>

      {}
      <form
        id="transaction-filters"
        ref={filterFormRef}
        onSubmit={handleFilterSubmit}
        className={`mb-4 rounded border border-customGray/30 bg-white/90 p-3 shadow-sm ${showFilters ? "block" : "hidden"} sm:block`}
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="startDate">
              From Date
            </Label>
            <Input
              type="date"
              id="startDate"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              max={filters.endDate}
            />
          </div>
          <div>
            <Label htmlFor="endDate">
              To Date
            </Label>
            <Input
              type="date"
              id="endDate"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              min={filters.startDate}
              max={format(today, "yyyy-MM-dd")}
            />
          </div>
          <div>
            <Label htmlFor="status">
              Status
            </Label>
            <select
              id="status"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">All Statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatStatus(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pt-1 sm:pt-0 lg:pt-4">
            <Button
              type="button"
              onClick={resetFilters}
              disabled={isPending || isLoading}
              size="sm"
              variant="outline"
              className="w-full justify-center !py-1.5"
              title="Reset Filters"
            >
              <RefreshIcon size={16} /> {}
            </Button>
          </div>
        </div>
      </form>

      {}
      {listError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {listError}
        </div>
      )}

      {isLoading && (
        <div className="p-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {!isLoading && !listError && transactions.length === 0 && (
        <p className="py-10 text-center text-customBlack/60">
          No transactions found matching your filters.
        </p>
      )}

      {}
      {!isLoading && !listError && transactions.length > 0 && (
        <div className="rounded border border-customGray/30 bg-white/80 shadow-sm">
          {}
          <div className="hidden sm:block">
            <table className="min-w-full divide-y divide-customGray/30">
              <thead className="bg-customGray/10">
                <tr>
                  <th className={thStyleBase}>Date</th>
                  <th className={thStyleBase}>Customer</th>
                  <th className={`${thStyleBase} text-right`}>Total</th>
                  <th className={thStyleBase}>Status</th>
                  <th className={`${thStyleBase} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-customGray/30">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-customLightBlue/10">
                    <td className={`${tdStyleBase} whitespace-nowrap`}>
                      {formatShortDate(t.createdAt)}
                    </td>
                    <td className={`${tdStyleBase} font-medium`}>
                      {t.customer?.name ?? "N/A"}
                    </td>
                    <td
                      className={`${tdStyleBase} whitespace-nowrap text-right`}
                    >
                      {formatCurrency(t.grandTotal)}
                    </td>
                    <td className={tdStyleBase}>
                      <Badge
                        variant={
                          t.status === Status.DONE
                            ? "default"
                            : t.status === Status.PENDING
                              ? "secondary"
                              : "destructive"
                        }
                        className={getStatusColor(t.status)}
                      >
                        {formatStatus(t.status)}
                      </Badge>
                    </td>
                    <td
                      className={`${tdStyleBase} whitespace-nowrap text-right`}
                    >
                    <Button
                      onClick={() => handleViewDetails(t)}
                      variant="ghost"
                      size="sm"
                      className="mr-2 h-8 w-8 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                      title="View Details"
                    >
                      <Eye size={16} />
                    </Button>
                    {t.status !== Status.CANCELLED &&
                      t.status !== Status.DONE && (
                        <Button
                          onClick={() => handleCancelClick(t.id)}
                          disabled={isPending}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                          title="Cancel Transaction"
                        >
                          <XCircle size={16} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {}
          <div className="block divide-y divide-customGray/30 sm:hidden">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3">
                {}
                <div className="flex flex-col text-sm">
                  <span className="font-medium text-customBlack">
                    {t.customer?.name ?? "N/A"}
                  </span>
                  <span className="text-xs text-customBlack/70">
                    {formatShortDate(t.createdAt)}
                  </span>
                  <span className="mt-1 text-xs font-semibold text-customBlack/90">
                    {formatCurrency(t.grandTotal)}
                  </span>
                </div>
                {}
                <div className="flex flex-col items-end space-y-1.5">
                  <span
                    className={`flex items-center rounded-full py-0.5 pl-1.5 pr-2 text-xs font-semibold ${getStatusColor(t.status)}`}
                  >
                    <span
                      className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${getStatusDotColor(t.status)}`}
                    ></span>
                    {formatStatus(t.status)}
                  </span>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => handleViewDetails(t)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </Button>
                    {t.status !== Status.CANCELLED &&
                      t.status !== Status.DONE && (
                        <Button
                          onClick={() => handleCancelClick(t.id)}
                          disabled={isPending}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                          title="Cancel Transaction"
                        >
                          <XCircle size={18} />
                        </Button>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={isModalOpen && selectedTransaction !== null} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              View detailed information about this transaction.
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <>
              <ScrollArea className="max-h-[calc(90vh-200px)]">
                <div className="space-y-4 p-4 text-sm">
                  {actionError && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                      {actionError}
                    </div>
                  )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded border border-customGray/20 p-3 md:grid-cols-3">
              <div>
                <span className="font-medium text-customBlack/70">ID:</span>
                <span className="font-mono text-xs text-customBlack">
                  {selectedTransaction.id.substring(0, 8)}...
                </span>
              </div>
              <div>
                <span className="font-medium text-customBlack/70">Date:</span>
                {formatDate(selectedTransaction.createdAt)}
              </div>
              <div>
                <span className="font-medium text-customBlack/70">Booked:</span>
                {formatDate(selectedTransaction.bookedFor)}
              </div>
              <div>
                <span className="font-medium text-customBlack/70">Status:</span>
                <Badge
                  variant={
                    selectedTransaction.status === Status.DONE
                      ? "default"
                      : selectedTransaction.status === Status.PENDING
                        ? "secondary"
                        : "destructive"
                  }
                  className={`ml-2 ${getStatusColor(selectedTransaction.status)}`}
                >
                  {formatStatus(selectedTransaction.status)}
                </Badge>
              </div>
              <div>
                <span className="font-medium text-customBlack/70">
                  Payment:
                </span>
                {selectedTransaction.paymentMethod?.toString() ?? "N/A"}
              </div>
              {selectedTransaction.voucherUsed && (
                <div>
                  <span className="font-medium text-customBlack/70">
                    Voucher:
                  </span>
                  <span className="font-mono">
                    {selectedTransaction.voucherUsed.code}
                  </span>
                </div>
              )}
              {selectedTransaction.discount > 0 && (
                <div>
                  <span className="font-medium text-customBlack/70">
                    Discount:
                  </span>
                  <span className="text-red-600">
                    ({formatCurrency(selectedTransaction.discount)})
                  </span>
                </div>
              )}
            </div>
            <div className="rounded border border-customGray/20 p-3">
              <h4 className="mb-1.5 text-xs font-semibold uppercase text-customBlack/70">
                Customer
              </h4>
              <p>
                <span className="font-medium">Name:</span>
                {selectedTransaction.customer?.name ?? "N/A"}
              </p>
              <p>
                <span className="font-medium">Email:</span>
                {selectedTransaction.customer?.email ?? "N/A"}
              </p>
            </div>
            <div className="overflow-x-auto rounded border border-customGray/20">
              <h4 className="bg-customGray/5 p-2 text-xs font-semibold uppercase text-customBlack/70">
                Availed Items
              </h4>
              {selectedTransaction.availedServices.length > 0 ? (
                <table className="min-w-full divide-y divide-customGray/20 text-xs">
                  <thead className="bg-customGray/5">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium text-customBlack/70">
                        Item
                      </th>
                      <th className="px-2 py-1 text-left font-medium text-customBlack/70">
                        Set
                      </th>
                      <th className="px-2 py-1 text-right font-medium text-customBlack/70">
                        Price
                      </th>
                      <th className="px-2 py-1 text-left font-medium text-customBlack/70">
                        Served By
                      </th>
                      <th className="px-2 py-1 text-left font-medium text-customBlack/70">
                        Completed
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-customGray/20">
                    {selectedTransaction.availedServices.map((item) => (
                      <tr key={item.id}>
                        <td className="px-2 py-1 font-medium">
                          {item.service?.title ?? "N/A"}
                        </td>
                        <td className="px-2 py-1">
                          {item.originatingSetTitle ?? "-"}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {formatCurrency(item.price)}
                        </td>
                        <td className="px-2 py-1">
                          {item.units && item.units.length > 0
                            ? (item.units[0].servedBy?.name ?? "-")
                            : "-"}
                        </td>
                        <td className="px-2 py-1">
                          {item.units && item.units.length > 0
                            ? item.units[0].completedAt
                              ? formatShortDate(item.units[0].completedAt)
                              : "-"
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-3 text-center text-gray-500">
                  No items availed.
                </p>
              )}
                </div>
                <div className="mt-4 border-t border-customGray/30 pt-3 text-right">
                  <p className="text-lg font-semibold text-customBlack">
                    Grand Total: {formatCurrency(selectedTransaction.grandTotal)}
                  </p>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                variant="outline"
                className="w-full sm:w-auto"
              >
                Close
              </Button>
              {selectedTransaction.status !== Status.CANCELLED &&
                selectedTransaction.status !== Status.DONE && (
                  <Button
                    type="button"
                    onClick={() => handleCancelClick(selectedTransaction.id)}
                    disabled={isPending}
                    variant="destructive"
                    className="w-full sm:w-auto"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <XCircle size={16} className="mr-2" />
                        Cancel Transaction
                      </>
                    )}
                  </Button>
                )}
            </DialogFooter>
          </>
        )}
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCancelDialogOpen(false);
          setPendingCancelTransactionId(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this transaction? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setPendingCancelTransactionId(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelTransaction}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Transaction
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
