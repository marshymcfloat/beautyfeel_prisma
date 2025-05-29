"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useTransition,
  useMemo,
} from "react";
import type { JSX } from "react";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";
import { TransactionListData, ServerActionResponse } from "@/lib/Types";
import { PaymentMethod, Status } from "@prisma/client";
import {
  Loader2,
  AlertCircle,
  X,
  FileText,
  User,
  Tag,
  DollarSign,
  CalendarDays,
  Info,
  CheckCircle,
  Clock,
  CreditCard,
  Banknote,
  Wallet,
  Gift,
  ArrowLeft,
} from "lucide-react";
import {
  getRecentTransactions,
  updateTransactionDetails,
} from "@/lib/ServerAction";
import { format } from "date-fns";
import Select from "react-select";

interface ManageTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const paymentMethodOptions = [
  { value: PaymentMethod.cash, label: "Cash" },
  { value: PaymentMethod.ewallet, label: "E-wallet" },
  { value: PaymentMethod.bank, label: "Bank Transfer" },
  { value: PaymentMethod.GIFT_CERTIFICATE, label: "Gift Certificate" },
  { value: null, label: "Unknown" },
];

const statusOptions = [
  { value: Status.PENDING, label: "Pending" },
  { value: Status.DONE, label: "Done" },
  { value: Status.CANCELLED, label: "Cancelled" },
];

type EditableTransactionFields = {
  status: Status;
  paymentMethod: PaymentMethod | null;
};

export default function ManageTransactionsModal({
  isOpen,
  onClose,
}: ManageTransactionsModalProps) {
  const [transactions, setTransactions] = useState<TransactionListData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);

  const [editingTransaction, setEditingTransaction] =
    useState<EditableTransactionFields | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState<
    string | null
  >(null);

  const selectedTransaction = useMemo(() => {
    return transactions.find((tx) => tx.id === selectedTransactionId);
  }, [transactions, selectedTransactionId]);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getRecentTransactions(50);
      if (Array.isArray(data)) {
        setTransactions(data);
      } else {
        setError("Failed to fetch transactions.");
        setTransactions([]);
      }
    } catch (err: any) {
      setError(err.message || "Error fetching transactions.");
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTransactions();
      setSelectedTransactionId(null);
      setEditingTransaction(null);
      setUpdateError(null);
      setUpdateSuccessMessage(null);
    }
  }, [isOpen, fetchTransactions]);

  const handleSelectTransaction = useCallback(
    (transaction: TransactionListData) => {
      setSelectedTransactionId(transaction.id);

      setEditingTransaction({
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
      });
      setUpdateError(null);
      setUpdateSuccessMessage(null);
    },
    [],
  );

  const handleBackToList = useCallback(() => {
    setSelectedTransactionId(null);
    setEditingTransaction(null);
    setUpdateError(null);
    setUpdateSuccessMessage(null);
  }, []);

  const handleFormChange = useCallback(
    (field: keyof EditableTransactionFields, value: any) => {
      setEditingTransaction((prev) =>
        prev ? { ...prev, [field]: value } : null,
      );
      setUpdateError(null);
      setUpdateSuccessMessage(null);
    },
    [],
  );

  const handleUpdateTransaction = useCallback(async () => {
    if (!selectedTransactionId || !editingTransaction) return;

    setUpdateError(null);
    setUpdateSuccessMessage(null);
    startUpdateTransition(async () => {
      const result = await updateTransactionDetails({
        transactionId: selectedTransactionId,
        status: editingTransaction.status,
        paymentMethod: editingTransaction.paymentMethod,
      });

      if (result.success) {
        setUpdateSuccessMessage(result.message || "Update successful!");

        fetchTransactions();
      } else {
        setUpdateError(result.message || "Update failed.");
      }
    });
  }, [
    selectedTransactionId,
    editingTransaction,
    fetchTransactions,
    startUpdateTransition,
  ]);

  const formatDateTime = (dateInput: Date | undefined | null): string => {
    if (!dateInput) return "N/A";
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return "Invalid Date";
      return format(date, "MMM dd, yyyy hh:mm a");
    } catch {
      return "Invalid Date";
    }
  };

  const getPaymentMethodIcon = (method: PaymentMethod | null | undefined) => {
    switch (method) {
      case PaymentMethod.cash:
        return <Banknote size={14} className="text-green-600" />;
      case PaymentMethod.ewallet:
        return <Wallet size={14} className="text-blue-600" />;
      case PaymentMethod.bank:
        return <CreditCard size={14} className="text-purple-600" />;
      case PaymentMethod.GIFT_CERTIFICATE:
        return <Gift size={14} className="text-orange-600" />;
      default:
        return <DollarSign size={14} className="text-gray-500" />;
    }
  };

  const getStatusIcon = (status: Status | undefined): JSX.Element => {
    switch (status) {
      case Status.DONE:
        return <CheckCircle size={14} className="text-green-600" />;
      case Status.PENDING:
        return <Clock size={14} className="text-blue-600" />;
      case Status.CANCELLED:
        return <X size={14} className="text-red-600" />;
      default:
        return <Info size={14} className="text-gray-500" />;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<DialogTitle>Manage Transactions</DialogTitle>}
      size="xl"
    >
      <div className="flex h-full max-h-[80vh] flex-col">
        {}
        <div className="flex-grow overflow-y-auto p-4">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading
              transactions...
            </div>
          )}
          {error && !isLoading && (
            <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={18} /> <span>{error}</span>
            </div>
          )}

          {!isLoading && !error && transactions.length > 0 ? (
            <div className="flex flex-col gap-4 md:grid md:grid-cols-3">
              {}
              <div
                className={`max-h-[60vh] overflow-y-auto md:col-span-1 ${selectedTransactionId ? "hidden md:block" : "block"} md:border-r md:border-gray-200 md:pr-4`}
              >
                <h3 className="mb-3 border-b pb-2 text-lg font-semibold">
                  Recent Transactions
                </h3>
                <ul className="space-y-2">
                  {transactions.map((tx) => (
                    <li
                      key={tx.id}
                      className={`cursor-pointer rounded-md p-3 text-sm transition-colors ${selectedTransactionId === tx.id ? "border border-blue-300 bg-blue-100" : "border border-transparent bg-white hover:bg-gray-50"}`}
                      onClick={() => handleSelectTransaction(tx)}
                    >
                      <div className="truncate font-medium text-gray-800">
                        {tx.customer?.name || "Unknown Customer"}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <CalendarDays size={12} />{" "}
                          {formatDateTime(tx.createdAt)}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1">
                          {getStatusIcon(tx.status)} {tx.status}
                          <span className="ml-auto flex items-center gap-1">
                            {getPaymentMethodIcon(tx.paymentMethod)}{" "}
                            {tx.paymentMethod || "Unknown"}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {}
              <div
                className={`max-h-[60vh] overflow-y-auto md:col-span-2 ${selectedTransactionId ? "block" : "hidden md:block"} md:pl-4`}
              >
                {selectedTransaction ? (
                  <div>
                    {}
                    {selectedTransactionId && (
                      <div className="mb-4 border-b border-gray-200 pb-2 md:hidden">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleBackToList}
                          icon={<ArrowLeft size={16} className="mr-1" />}
                        >
                          Back to List
                        </Button>
                      </div>
                    )}

                    <h3 className="mb-3 border-b pb-2 text-lg font-semibold">
                      Transaction Details (
                      {formatDateTime(selectedTransaction.createdAt)})
                    </h3>
                    {updateSuccessMessage && (
                      <div className="mb-3 flex items-center gap-2 rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">
                        <AlertCircle size={16} />{" "}
                        <span>{updateSuccessMessage}</span>
                      </div>
                    )}
                    {updateError && (
                      <div className="mb-3 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                        <AlertCircle size={16} /> <span>{updateError}</span>
                      </div>
                    )}
                    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-sm font-medium text-gray-600">
                          Customer
                        </p>
                        <p className="font-semibold">
                          {selectedTransaction.customer?.name || "N/A"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {selectedTransaction.customer?.email || "N/A Email"}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-sm font-medium text-gray-600">
                          Grand Total
                        </p>
                        <p className="font-semibold text-green-700">
                          {formatCurrency(selectedTransaction.grandTotal)}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-sm font-medium text-gray-600">
                          Booking Date
                        </p>
                        <p>{formatDateTime(selectedTransaction.bookedFor)}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-sm font-medium text-gray-600">
                          Voucher
                        </p>
                        <p>{selectedTransaction.voucherUsed?.code || "None"}</p>
                      </div>
                      {}
                    </div>

                    <div className="mt-6">
                      <h4 className="mb-2 border-b pb-1 text-base font-semibold">
                        Availed Services
                      </h4>
                      <ul className="space-y-2 text-sm">
                        {selectedTransaction.availedServices.map((as) => (
                          <li
                            key={as.id}
                            className="border-b pb-2 last:border-b-0"
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-medium">
                                <Tag size={14} className="text-blue-500" />{" "}
                                {as.service?.title ||
                                  as.originatingSetTitle ||
                                  "Unknown Service"}{" "}
                                (x{as.quantity})
                              </span>
                              <span className="text-gray-700">
                                {formatCurrency(as.price)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                {getStatusIcon(as.status)} {as.status}
                              </span>
                              <span className="flex items-center gap-1">
                                <User size={10} /> Served by:{" "}
                                {as.servedBy?.name || "N/A"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {}
                    {editingTransaction && (
                      <div className="mt-8 border-t pt-6">
                        <h4 className="mb-4 text-base font-semibold">
                          Edit Details
                        </h4>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label
                              className="mb-1 block text-sm font-medium text-gray-700"
                              htmlFor="status"
                            >
                              Status
                            </label>
                            <Select
                              id="status"
                              options={statusOptions}
                              value={statusOptions.find(
                                (option) =>
                                  option.value === editingTransaction.status,
                              )}
                              onChange={(option) =>
                                handleFormChange(
                                  "status",
                                  option ? (option.value as Status) : null,
                                )
                              }
                              classNamePrefix="react-select"
                              instanceId="status-select"
                            />
                          </div>
                          <div>
                            <label
                              className="mb-1 block text-sm font-medium text-gray-700"
                              htmlFor="paymentMethod"
                            >
                              Payment Method
                            </label>
                            <Select
                              id="paymentMethod"
                              options={paymentMethodOptions}
                              value={paymentMethodOptions.find(
                                (option) =>
                                  option.value ===
                                  editingTransaction.paymentMethod,
                              )}
                              onChange={(option) =>
                                handleFormChange(
                                  "paymentMethod",
                                  option
                                    ? (option.value as PaymentMethod | null)
                                    : null,
                                )
                              }
                              isClearable
                              classNamePrefix="react-select"
                              instanceId="payment-method-select"
                            />
                          </div>
                          {}
                        </div>
                        <div className="mt-6 flex justify-end">
                          <Button
                            onClick={handleUpdateTransaction}
                            disabled={isUpdating}
                            variant="primary"
                            size="sm"
                          >
                            {isUpdating ? (
                              <Loader2
                                size={16}
                                className="mr-1 animate-spin"
                              />
                            ) : null}
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="hidden py-10 text-center text-gray-500 md:block">
                    <FileText size={40} className="mx-auto mb-3" />
                    Select a transaction from the list to view details.
                  </div>
                )}
              </div>
            </div>
          ) : (
            !isLoading &&
            !error &&
            transactions.length === 0 && (
              <div className="py-10 text-center text-gray-500">
                <FileText size={40} className="mx-auto mb-3" />
                No recent transactions found.
              </div>
            )
          )}
        </div>

        {}
        <div className="flex shrink-0 justify-end border-t border-gray-200 bg-gray-100 p-4">
          <Button onClick={onClose} variant="outline" size="sm">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
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
