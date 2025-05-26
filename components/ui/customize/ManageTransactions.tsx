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
} from "@/lib/ServerAction"; // Adjust path
import Button from "@/components/Buttons/Button"; // Adjust path
import { TransactionListData, ServerActionResponse } from "@/lib/Types"; // Adjust path
import { Status } from "@prisma/client";
import {
  Eye,
  XCircle,
  SlidersHorizontal,
  RotateCcw as RefreshIcon,
} from "lucide-react";
import Modal from "@/components/Dialog/Modal"; // Adjust path
import DialogTitle from "@/components/Dialog/DialogTitle"; // Adjust path
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
          // console.log("[Cache] Transactions loaded from cache for filters:", currentFilters);
          return;
        }
      }
      // console.log("[Cache] Fetching transactions for filters:", currentFilters);
      try {
        const transactionsRes = await getTransactionsAction({
          startDate: currentFilters.startDate || undefined,
          endDate: currentFilters.endDate || undefined,
          status: currentFilters.status
            ? (currentFilters.status as Status)
            : undefined,
        });

        if (transactionsRes.success && transactionsRes.data) {
          setTransactions(transactionsRes.data);
          setCachedData(
            TRANSACTIONS_CACHE_KEY,
            transactionsRes.data,
            currentFilters,
          );
        } else {
          throw new Error(
            transactionsRes.message || "Failed to load transactions.",
          );
        }
      } catch (err: any) {
        setListError(err.message || "Failed to load data.");
        setTransactions([]); // Clear data on error
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
    // console.log("[Cache] Refreshing transactions data");
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
    // Data loading is handled by useEffect on filters change
    // console.log("Applying filters:", filters);
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

  const handleCancelTransaction = (transactionId: string) => {
    if (!window.confirm("Are you sure you want to cancel this transaction?"))
      return;

    setActionError(null);
    startTransition(async () => {
      const res = await cancelTransactionAction(transactionId);
      if (res.success) {
        closeModal();
        invalidateCache(TRANSACTIONS_CACHE_KEY);
        await loadData(filters, true); // Force refresh after invalidation
      } else {
        setActionError(res.message);
      }
    });
  };

  // --- Formatting Helpers ---
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

  // --- Styles ---
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
      {/* Header & Filter Toggle */}
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
            invert
            className="flex w-full items-center justify-center gap-1.5 sm:hidden" // Keep sm:hidden for mobile toggle
            aria-controls="transaction-filters"
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={16} />
            {showFilters ? "Hide Filters" : "Show Filters"}
          </Button>
        </div>
      </div>

      {/* Filters Form */}
      <form
        id="transaction-filters"
        ref={filterFormRef}
        onSubmit={handleFilterSubmit}
        className={`mb-4 rounded border border-customGray/30 bg-white/90 p-3 shadow-sm ${showFilters ? "block" : "hidden"} sm:block`}
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="startDate" className={labelStyle}>
              From Date
            </label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className={inputStyle}
              max={filters.endDate}
            />
          </div>
          <div>
            <label htmlFor="endDate" className={labelStyle}>
              To Date
            </label>
            <input
              type="date"
              id="endDate"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className={inputStyle}
              min={filters.startDate}
              max={format(today, "yyyy-MM-dd")}
            />
          </div>
          <div>
            <label htmlFor="status" className={labelStyle}>
              Status
            </label>
            <select
              id="status"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className={`${inputStyle} bg-white`}
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
              invert
              className="w-full justify-center !py-1.5"
              title="Reset Filters"
            >
              <RefreshIcon size={16} />{" "}
              {/* Changed icon here for variety from main refresh */}
            </Button>
          </div>
        </div>
      </form>

      {/* Error Display */}
      {listError && <p className={errorMsgStyle}>{listError}</p>}

      {/* Loading / No Data Placeholders */}
      {isLoading && (
        <p className="py-10 text-center text-customBlack/70">
          Loading transactions...
        </p>
      )}
      {!isLoading && !listError && transactions.length === 0 && (
        <p className="py-10 text-center text-customBlack/60">
          No transactions found matching your filters.
        </p>
      )}

      {/* Data Display Area */}
      {!isLoading && !listError && transactions.length > 0 && (
        <div className="rounded border border-customGray/30 bg-white/80 shadow-sm">
          {/* Desktop Table (hidden on small screens) */}
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
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(t.status)}`}
                      >
                        {formatStatus(t.status)}
                      </span>
                    </td>
                    <td
                      className={`${tdStyleBase} whitespace-nowrap text-right`}
                    >
                      <button
                        onClick={() => handleViewDetails(t)}
                        className="mr-2 inline-block p-1 text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      {t.status !== Status.CANCELLED &&
                        t.status !== Status.DONE && (
                          <button
                            onClick={() => handleCancelTransaction(t.id)}
                            disabled={isPending}
                            className="inline-block p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                            title="Cancel Transaction"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile List (visible only on small screens) */}
          <div className="block divide-y divide-customGray/30 sm:hidden">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3">
                {/* Left side: Info */}
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
                {/* Right side: Status and Actions */}
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
                    <button
                      onClick={() => handleViewDetails(t)}
                      className="inline-block p-0.5 text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                    {t.status !== Status.CANCELLED &&
                      t.status !== Status.DONE && (
                        <button
                          onClick={() => handleCancelTransaction(t.id)}
                          disabled={isPending}
                          className="inline-block p-0.5 text-red-600 hover:text-red-800 disabled:opacity-50"
                          title="Cancel Transaction"
                        >
                          <XCircle size={18} />
                        </button>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen && selectedTransaction !== null}
        onClose={closeModal}
        title={<DialogTitle>Transaction Details</DialogTitle>}
        containerClassName="relative m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl"
      >
        {selectedTransaction && (
          <div className="space-y-4 text-sm">
            {actionError && <p className={modalErrorStyle}>{actionError}</p>}
            {/* Basic Info Grid */}
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
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(selectedTransaction.status)}`}
                >
                  {formatStatus(selectedTransaction.status)}
                </span>
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
            {/* Customer Info */}
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
            {/* Availed Services Table */}
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
                          {item.servedBy?.name ?? "-"}
                        </td>
                        <td className="px-2 py-1">
                          {item.completedAt
                            ? formatShortDate(item.completedAt)
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
            {/* Totals */}
            <div className="mt-4 border-t border-customGray/30 pt-3 text-right">
              <p className="text-lg font-semibold text-customBlack">
                Grand Total: {formatCurrency(selectedTransaction.grandTotal)}
              </p>
            </div>
            {/* Modal Actions */}
            <div className="mt-5 flex flex-col gap-3 border-t border-customGray/30 pt-4 sm:flex-row sm:justify-end sm:space-x-3">
              <Button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                invert
                className="w-full sm:w-auto"
              >
                Close
              </Button>
              {selectedTransaction.status !== Status.CANCELLED &&
                selectedTransaction.status !== Status.DONE && (
                  <Button
                    type="button"
                    onClick={() =>
                      handleCancelTransaction(selectedTransaction.id)
                    }
                    disabled={isPending}
                    className="w-full sm:w-auto"
                  >
                    {isPending ? "Cancelling..." : "Cancel Transaction"}
                    <XCircle size={16} className="ml-1" />
                  </Button>
                )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
