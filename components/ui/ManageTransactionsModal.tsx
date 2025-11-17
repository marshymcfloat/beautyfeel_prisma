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
import {
  TransactionListData,
  ServiceSimple,
  EditableAvailedServiceState,
  UpdateTransactionInput, // Assuming this is now defined in Types.ts
} from "@/lib/Types";
import { PaymentMethod, Status } from "@prisma/client";
import {
  Loader2,
  AlertCircle,
  X,
  FileText,
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
  RefreshCw,
  PlusCircle,
  Trash2,
} from "lucide-react";
import {
  getRecentTransactions,
  updateTransactionDetails,
  getAllServicesSimple,
} from "@/lib/ServerAction";
import { format } from "date-fns";
import Select from "react-select";
import Input from "../Inputs/Input"; // Ensure this path is correct
import {
  CacheKey,
  getCachedData,
  setCachedData,
  invalidateCache,
} from "@/lib/cache";
import { v4 as uuidv4 } from "uuid";

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

type EditableTransactionMasterState = {
  status: Status;
  paymentMethod: PaymentMethod | null;
  discount: number;
  availedServices: EditableAvailedServiceState[];
  bookedForDate: string | null; // YYYY-MM-DD
  bookedForTime: string | null; // HH:mm
};

const createEditableAvailedService = (
  as: TransactionListData["availedServices"][0] | ServiceSimple,
  quantity: number = 1,
  isNew: boolean = false,
  priceOverride?: number,
): EditableAvailedServiceState => {
  if ("service" in as || "originatingSetTitle" in as) {
    // Type guard for existing AvailedService
    const existingAs = as as TransactionListData["availedServices"][0];
    return {
      id: existingAs.id,
      serviceTitle:
        existingAs.service?.title ||
        existingAs.originatingSetTitle || // Use originatingSetTitle from AvailedService model
        "Unknown Service",
      price: priceOverride ?? existingAs.price,
      quantity: quantity,
      originalPrice: existingAs.price,
      originalQuantity: existingAs.quantity,
      isNew: false,
      serviceId: existingAs.serviceId || undefined,
      branchId:
        (existingAs.service as any)?.branchId ||
        (existingAs as any)?.branchId ||
        undefined, // Try to get branchId
    };
  } else {
    // Type guard for new ServiceSimple
    const newService = as as ServiceSimple;
    return {
      id: `temp_${uuidv4()}`,
      serviceId: newService.id,
      serviceTitle: newService.title,
      price: priceOverride ?? newService.price,
      quantity: quantity,
      originalPrice: priceOverride ?? newService.price,
      originalQuantity: quantity,
      isNew: true,
      branchId: newService.branchId,
    };
  }
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

  const [editingState, setEditingState] =
    useState<EditableTransactionMasterState | null>(null);

  const [isUpdating, startUpdateTransition] = useTransition();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState<
    string | null
  >(null);

  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [availableServices, setAvailableServices] = useState<ServiceSimple[]>(
    [],
  );
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [newServiceSelection, setNewServiceSelection] = useState<{
    service: ServiceSimple | null;
    quantity: number;
    price: number | string;
  }>({ service: null, quantity: 1, price: "" });

  const selectedTransaction = useMemo(() => {
    return transactions.find((tx) => tx.id === selectedTransactionId);
  }, [transactions, selectedTransactionId]);

  const fetchTransactions = useCallback(
    async (forceRefresh: boolean = false) => {
      setIsLoading(true);
      setError(null);
      const cacheKey: CacheKey = "transactions_ManageTransactions";

      if (!forceRefresh) {
        const cachedData = getCachedData<TransactionListData[]>(cacheKey);
        if (cachedData) {
          setTransactions(
            cachedData.map((tx) => ({
              ...tx,
              createdAt: new Date(tx.createdAt),
              bookedFor: tx.bookedFor ? new Date(tx.bookedFor) : null,
              availedServices: tx.availedServices.map((as) => ({
                ...as,
                createdAt: new Date(as.createdAt),
                updatedAt: new Date(as.updatedAt),
                completedAt: as.completedAt ? new Date(as.completedAt) : null,
              })),
            })),
          );
          setIsLoading(false);
          return;
        }
      }

      try {
        const data = await getRecentTransactions(50); // Fetch raw data
        if (Array.isArray(data)) {
          const processedData = data.map((tx) => ({
            // Process for UI state
            ...tx,
            createdAt: new Date(tx.createdAt),
            bookedFor: tx.bookedFor ? new Date(tx.bookedFor) : null,
            availedServices: tx.availedServices.map((as) => ({
              ...as,
              createdAt: new Date(as.createdAt),
              updatedAt: new Date(as.updatedAt),
              completedAt: as.completedAt ? new Date(as.completedAt) : null,
            })),
          }));
          setTransactions(processedData);
          setCachedData(cacheKey, data); // Cache the raw data from server
        } else {
          setError("Failed to fetch transactions: Invalid data structure.");
          setTransactions([]);
        }
      } catch (err: any) {
        setError(err.message || "Error fetching transactions.");
        setTransactions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const handleRefreshTransactions = useCallback(() => {
    setUpdateSuccessMessage(null);
    setUpdateError(null);
    fetchTransactions(true);
  }, [fetchTransactions]);

  useEffect(() => {
    if (isOpen) {
      fetchTransactions();
      setSelectedTransactionId(null);
      setEditingState(null);
      const fetchSvcs = async () => {
        setIsLoadingServices(true);
        try {
          const svcs = await getAllServicesSimple();
          setAvailableServices(svcs);
        } catch (e) {
          console.error("Failed to fetch services for modal", e);
        } finally {
          setIsLoadingServices(false);
        }
      };
      fetchSvcs();
    } else {
      setIsAddServiceModalOpen(false);
    }
  }, [isOpen, fetchTransactions]);

  const handleSelectTransaction = useCallback(
    (transaction: TransactionListData) => {
      setSelectedTransactionId(transaction.id);
      setEditingState({
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        discount: transaction.discount || 0,
        availedServices: transaction.availedServices.map((as) =>
          createEditableAvailedService(as, as.quantity),
        ),
        bookedForDate: transaction.bookedFor
          ? format(new Date(transaction.bookedFor), "yyyy-MM-dd")
          : null,
        bookedForTime: transaction.bookedFor
          ? format(new Date(transaction.bookedFor), "HH:mm")
          : null,
      });
      setUpdateError(null);
      setUpdateSuccessMessage(null);
    },
    [],
  );

  const handleBackToList = useCallback(() => {
    setSelectedTransactionId(null);
    setEditingState(null);
    setUpdateError(null);
    setUpdateSuccessMessage(null);
  }, []);

  const handleTransactionFieldChange = useCallback(
    (
      field: keyof Pick<
        EditableTransactionMasterState,
        | "status"
        | "paymentMethod"
        | "discount"
        | "bookedForDate"
        | "bookedForTime"
      >,
      value: any,
    ) => {
      setEditingState((prev) => {
        if (!prev) return null;
        let processedValue = value;
        if (field === "discount") {
          const numValue = value === "" ? 0 : Number(value);
          processedValue = Math.max(0, numValue || 0);
        } else if (field === "bookedForDate" || field === "bookedForTime") {
          processedValue = value === "" ? null : value;
        }
        return { ...prev, [field]: processedValue };
      });
      setUpdateError(null);
      setUpdateSuccessMessage(null);
    },
    [],
  );

  const handleAvailedServiceItemChange = useCallback(
    (
      availedServiceIdOrTempId: string,
      field: "price" | "quantity",
      rawValue: string,
    ) => {
      setEditingState((prev) => {
        if (!prev) return null;
        let numericValue: number;
        if (rawValue === "") {
          numericValue = field === "quantity" ? 1 : 0;
        } else {
          numericValue = Number(rawValue);
        }

        return {
          ...prev,
          availedServices: prev.availedServices.map((as) =>
            as.id === availedServiceIdOrTempId
              ? {
                  ...as,
                  [field]:
                    field === "quantity"
                      ? Math.max(1, numericValue || 1)
                      : Math.max(0, numericValue || 0),
                }
              : as,
          ),
        };
      });
      setUpdateError(null);
      setUpdateSuccessMessage(null);
    },
    [],
  );

  const handleRemoveAvailedServiceItem = useCallback((idToRemove: string) => {
    setEditingState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        availedServices: prev.availedServices.filter(
          (as) => as.id !== idToRemove,
        ),
      };
    });
  }, []);

  const handleOpenAddServiceModal = () => {
    setNewServiceSelection({ service: null, quantity: 1, price: "" });
    setIsAddServiceModalOpen(true);
  };

  const handleAddServiceToEditingState = () => {
    if (!newServiceSelection.service || !editingState) return;
    const newAs = createEditableAvailedService(
      newServiceSelection.service,
      newServiceSelection.quantity,
      true,
      newServiceSelection.price === ""
        ? newServiceSelection.service.price
        : Number(newServiceSelection.price),
    );

    setEditingState((prev) => ({
      ...prev!,
      availedServices: [...prev!.availedServices, newAs],
    }));
    setIsAddServiceModalOpen(false);
  };

  const handleUpdateTransaction = useCallback(async () => {
    if (!selectedTransactionId || !editingState) return;
    setUpdateError(null);
    setUpdateSuccessMessage(null);

    const newAvailedServicesPayload = editingState.availedServices
      .filter((as) => as.isNew)
      .map((as) => ({
        serviceId: as.serviceId!,
        quantity: as.quantity,
        price: as.price,
        serviceTitle: as.serviceTitle, // For context/logging
        branchId: as.branchId!,
      }));

    const availedServicesUpdatesPayload = editingState.availedServices
      .filter(
        (as) =>
          !as.isNew &&
          (as.price !== as.originalPrice ||
            as.quantity !== as.originalQuantity),
      )
      .map((as) => ({
        availedServiceId: as.id,
        price: as.price,
        quantity: as.quantity,
      }));

    startUpdateTransition(async () => {
      const updateInput: UpdateTransactionInput = {
        // Explicitly type for clarity
        transactionId: selectedTransactionId,
        status: editingState.status,
        paymentMethod: editingState.paymentMethod,
        discount: editingState.discount,
        bookedForDate: editingState.bookedForDate,
        bookedForTime: editingState.bookedForTime,
        availedServicesUpdates:
          availedServicesUpdatesPayload.length > 0
            ? availedServicesUpdatesPayload
            : undefined,
        newAvailedServices:
          newAvailedServicesPayload.length > 0
            ? newAvailedServicesPayload
            : undefined,
      };

      const result = await updateTransactionDetails(updateInput);

      if (result.success && result.updatedTransaction) {
        setUpdateSuccessMessage(result.message || "Update successful!");
        const updatedTxWithDates = {
          ...result.updatedTransaction,
          createdAt: new Date(result.updatedTransaction.createdAt),
          bookedFor: result.updatedTransaction.bookedFor
            ? new Date(result.updatedTransaction.bookedFor)
            : null,
          availedServices: result.updatedTransaction.availedServices.map(
            (as) => ({
              ...as,
              createdAt: new Date(as.createdAt),
              updatedAt: new Date(as.updatedAt),
              completedAt: as.completedAt ? new Date(as.completedAt) : null,
            }),
          ),
        };

        setTransactions((prevTxs) =>
          prevTxs.map((tx) =>
            tx.id === selectedTransactionId ? updatedTxWithDates : tx,
          ),
        );

        const cacheKey: CacheKey = "transactions_ManageTransactions";
        const currentCachedRaw = getCachedData<any[]>(cacheKey); // Get raw cached data
        if (currentCachedRaw) {
          setCachedData(
            cacheKey,
            currentCachedRaw.map(
              (
                tx, // Update the raw cache item
              ) =>
                tx.id === selectedTransactionId
                  ? result.updatedTransaction
                  : tx,
            ),
          );
        }
        handleSelectTransaction(updatedTxWithDates);
      } else {
        setUpdateError(result.message || "Update failed.");
      }
    });
  }, [
    selectedTransactionId,
    editingState,
    handleSelectTransaction,
    startUpdateTransition,
  ]);

  const calculatedSubtotal = useMemo(() => {
    if (!editingState) return 0;
    return editingState.availedServices.reduce(
      (sum, as) => sum + as.price * as.quantity,
      0,
    );
  }, [editingState]);

  const calculatedGrandTotal = useMemo(() => {
    if (!editingState) return 0;
    return calculatedSubtotal - editingState.discount;
  }, [calculatedSubtotal, editingState?.discount]);

  const formatDateTime = (
    dateInput: Date | string | undefined | null,
  ): string => {
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

  const serviceOptionsForSelect = useMemo(
    () =>
      availableServices.map((s) => ({
        value: s,
        label: `${s.title} (${formatCurrency(s.price)})`,
      })),
    [availableServices],
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={<DialogTitle>Manage Transactions</DialogTitle>}
        size="2xl" // Consider "3xl" or "4xl" if content becomes too cramped
      >
        <div className="flex h-full max-h-[85vh] flex-col">
          <div className="flex-grow overflow-y-auto p-4">
            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
              </div>
            )}
            {error && !isLoading && (
              <div className="my-2 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={18} /> <span>{error}</span>
              </div>
            )}
            {!isLoading && !error && transactions.length > 0 ? (
              <div className="flex flex-col gap-4 md:grid md:grid-cols-3">
                <div
                  className={`max-h-[70vh] overflow-y-auto md:col-span-1 ${selectedTransactionId ? "hidden md:block" : "block"} md:border-r md:border-gray-200 md:pr-4`}
                >
                  <div className="mb-3 flex items-center justify-between border-b pb-2">
                    <h3 className="text-lg font-semibold">
                      Recent Transactions
                    </h3>
                    <Button
                      variant="ghost"
                      onClick={handleRefreshTransactions}
                      title="Refresh list"
                    >
                      <RefreshCw
                        size={16}
                        className={isLoading ? "animate-spin" : ""}
                      />
                    </Button>
                  </div>
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
                            {getStatusIcon(tx.status)} {tx.status}{" "}
                            <span className="ml-auto flex items-center gap-1">
                              {getPaymentMethodIcon(tx.paymentMethod)}{" "}
                              {tx.paymentMethod || "N/A"}
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Total: {formatCurrency(tx.grandTotal)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  className={`max-h-[70vh] overflow-y-auto md:col-span-2 ${selectedTransactionId ? "block" : "hidden md:block"} md:pl-4`}
                >
                  {selectedTransaction && editingState ? (
                    <div>
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
                        Details ({formatDateTime(selectedTransaction.createdAt)}
                        )
                      </h3>
                      {updateSuccessMessage && (
                        <div className="mb-3 flex items-center gap-2 rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">
                          <CheckCircle size={16} />{" "}
                          <span>{updateSuccessMessage}</span>
                        </div>
                      )}
                      {updateError && (
                        <div className="mb-3 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                          <AlertCircle size={16} /> <span>{updateError}</span>
                        </div>
                      )}
                      <div className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                        <div>
                          <p className="font-medium text-gray-600">Customer</p>
                          <p>{selectedTransaction.customer?.name || "N/A"}</p>
                          <p className="text-xs text-gray-500">
                            {selectedTransaction.customer?.email || "N/A Email"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-gray-600">
                            Original Grand Total
                          </p>
                          <p className="font-semibold">
                            {formatCurrency(selectedTransaction.grandTotal)}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-gray-600">
                            Current Booking Date
                          </p>
                          <p>{formatDateTime(selectedTransaction.bookedFor)}</p>
                        </div>
                        <div>
                          <p className="font-medium text-gray-600">Voucher</p>
                          <p>
                            {selectedTransaction.voucherUsed?.code || "None"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-6 border-t pt-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-semibold">
                            Edit Transaction
                          </h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleOpenAddServiceModal}
                            icon={<PlusCircle size={14} />}
                          >
                            Add Service
                          </Button>
                        </div>
                        <div className="my-4">
                          <h5 className="mb-2 text-sm font-medium text-gray-700">
                            Availed Services/Items:
                          </h5>
                          <div className="space-y-3">
                            {editingState.availedServices.map((as) => (
                              <div
                                key={as.id}
                                className={`rounded-md border p-3 ${as.isNew ? "border-blue-200 bg-blue-50" : "bg-gray-50"}`}
                              >
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="font-medium text-gray-800">
                                    {as.serviceTitle}{" "}
                                    {as.isNew && (
                                      <span className="text-xs font-normal text-blue-600">
                                        (New)
                                      </span>
                                    )}
                                  </p>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700"
                                    onClick={() =>
                                      handleRemoveAvailedServiceItem(as.id)
                                    }
                                    title="Remove Item"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-4">
                                  <div className="sm:col-span-2">
                                    <Input
                                      type="number"
                                      label="Price (PHP)"
                                      id={`price-${as.id}`}
                                      name={`price-${as.id}`}
                                      value={as.price}
                                      onChange={(e) =>
                                        handleAvailedServiceItemChange(
                                          as.id,
                                          "price",
                                          e.target.value,
                                        )
                                      }
                                      min="0"
                                      step="0.01"
                                    />
                                  </div>
                                  <div className="sm:col-span-1">
                                    <Input
                                      type="number"
                                      label="Qty"
                                      id={`quantity-${as.id}`}
                                      name={`quantity-${as.id}`}
                                      value={as.quantity}
                                      onChange={(e) =>
                                        handleAvailedServiceItemChange(
                                          as.id,
                                          "quantity",
                                          e.target.value,
                                        )
                                      }
                                      min="1"
                                      step="1"
                                    />
                                  </div>
                                  <div className="flex items-end justify-end text-sm sm:col-span-1">
                                    <p className="text-gray-700">
                                      Sub:{" "}
                                      {formatCurrency(as.price * as.quantity)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {editingState.availedServices.length === 0 && (
                              <p className="py-2 text-center text-sm text-gray-500">
                                No services. Click "Add Service".
                              </p>
                            )}
                          </div>
                        </div>
                        {/* START: Fully integrated editable fields including bookedFor */}
                        <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                          <div>
                            <label
                              className="mb-1 block text-sm font-medium text-gray-700"
                              htmlFor={`status-select-${selectedTransactionId}`}
                            >
                              Status
                            </label>
                            <Select
                              id={`status-select-${selectedTransactionId}`}
                              options={statusOptions}
                              value={statusOptions.find(
                                (o) => o.value === editingState.status,
                              )}
                              onChange={(o) =>
                                handleTransactionFieldChange(
                                  "status",
                                  o ? (o.value as Status) : Status.PENDING,
                                )
                              }
                              classNamePrefix="react-select"
                              instanceId={`status-select-${selectedTransactionId}-instance`}
                            />
                          </div>
                          <div>
                            <label
                              className="mb-1 block text-sm font-medium text-gray-700"
                              htmlFor={`payment-method-select-${selectedTransactionId}`}
                            >
                              Payment Method
                            </label>
                            <Select
                              id={`payment-method-select-${selectedTransactionId}`}
                              options={paymentMethodOptions}
                              value={paymentMethodOptions.find(
                                (o) => o.value === editingState.paymentMethod,
                              )}
                              onChange={(o) =>
                                handleTransactionFieldChange(
                                  "paymentMethod",
                                  o ? (o.value as PaymentMethod | null) : null,
                                )
                              }
                              isClearable
                              classNamePrefix="react-select"
                              instanceId={`payment-method-select-${selectedTransactionId}-instance`}
                            />
                          </div>
                          <div>
                            <Input
                              type="date"
                              label="New Booking Date"
                              id={`bookedForDate-${selectedTransactionId}`}
                              name="bookedForDate"
                              value={editingState.bookedForDate || ""}
                              onChange={(e) =>
                                handleTransactionFieldChange(
                                  "bookedForDate",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div>
                            <Input
                              type="time"
                              label="New Booking Time"
                              id={`bookedForTime-${selectedTransactionId}`}
                              name="bookedForTime"
                              value={editingState.bookedForTime || ""}
                              onChange={(e) =>
                                handleTransactionFieldChange(
                                  "bookedForTime",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Input
                              type="number"
                              label="Overall Discount (PHP)"
                              id="discount"
                              name="discount"
                              value={editingState.discount}
                              onChange={(e) =>
                                handleTransactionFieldChange(
                                  "discount",
                                  e.target.value,
                                )
                              }
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </div>
                        {/* END: Fully integrated editable fields */}
                        <div className="mt-6 rounded-md border bg-gray-50 p-4">
                          <div className="flex justify-between text-sm">
                            <p className="text-gray-600">
                              Subtotal (Services):
                            </p>
                            <p className="font-medium">
                              {formatCurrency(calculatedSubtotal)}
                            </p>
                          </div>
                          <div className="flex justify-between text-sm">
                            <p className="text-gray-600">Discount:</p>
                            <p className="font-medium text-red-600">
                              - {formatCurrency(editingState.discount)}
                            </p>
                          </div>
                          <div className="mt-2 flex justify-between border-t pt-2 text-base">
                            <p className="font-semibold text-gray-800">
                              New Grand Total:
                            </p>
                            <p className="font-bold text-green-700">
                              {formatCurrency(calculatedGrandTotal)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                          <Button
                            onClick={handleUpdateTransaction}
                            disabled={isUpdating}
                            variant="primary"
                            size="sm"
                          >
                            {isUpdating && (
                              <Loader2
                                size={16}
                                className="mr-1 animate-spin"
                              />
                            )}
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="hidden py-10 text-center text-gray-500 md:block">
                      <FileText size={40} className="mx-auto mb-3" />
                      Select a transaction to edit.
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
          <div className="flex shrink-0 justify-end border-t border-gray-200 bg-gray-100 p-4">
            <Button onClick={onClose} variant="outline" size="sm">
              Close
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={isAddServiceModalOpen}
        onClose={() => setIsAddServiceModalOpen(false)}
        title={<DialogTitle>Add Service to Transaction</DialogTitle>}
        size="md"
      >
        <div className="space-y-4 p-4">
          <div>
            <label
              className="mb-1 block text-sm font-medium text-gray-700"
              htmlFor="add-service-select"
            >
              Service
            </label>
            <Select
              id="add-service-select"
              options={serviceOptionsForSelect}
              value={serviceOptionsForSelect.find(
                (opt) => opt.value.id === newServiceSelection.service?.id,
              )}
              onChange={(option) =>
                setNewServiceSelection((prev) => ({
                  ...prev,
                  service: option?.value || null,
                  price: option?.value.price ?? "",
                }))
              }
              isLoading={isLoadingServices}
              placeholder="Select a service..."
              classNamePrefix="react-select"
              instanceId="add-service-select-instance"
            />
          </div>
          <Input
            label="Quantity"
            type="number"
            id="add-service-quantity"
            name="newServiceQuantity"
            value={newServiceSelection.quantity}
            onChange={(e) =>
              setNewServiceSelection((prev) => ({
                ...prev,
                quantity: Math.max(1, Number(e.target.value) || 1),
              }))
            }
            min="1"
          />
          <Input
            label="Price (PHP) - leave blank for default"
            type="number"
            id="add-service-price"
            name="newServicePrice"
            value={newServiceSelection.price}
            onChange={(e) =>
              setNewServiceSelection((prev) => ({
                ...prev,
                price: e.target.value,
              }))
            }
            placeholder={
              newServiceSelection.service
                ? formatCurrency(newServiceSelection.service.price)
                : "0.00"
            }
            min="0"
            step="0.01"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsAddServiceModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddServiceToEditingState}
              disabled={!newServiceSelection.service || isLoadingServices}
            >
              {isLoadingServices && (
                <Loader2 size={16} className="mr-1 animate-spin" />
              )}
              Add to Transaction
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
