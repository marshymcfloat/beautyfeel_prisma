"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useTransition,
  useRef,
} from "react";
import {
  getCustomersAction,
  createCustomerAction,
  updateCustomerAction,
  deleteCustomerAction,
} from "@/lib/ServerAction"; // Assuming ServerAction path
import { CacheKey, invalidateCache } from "@/lib/cache"; // Make sure CacheKey is imported
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import {
  PlusCircle,
  Edit3,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Eye,
  ShoppingCart,
  CalendarCheck,
  Loader2,
} from "lucide-react";
import {
  Transaction,
  RecommendedAppointment,
  Status as PrismaStatus,
} from "@prisma/client"; // Import Prisma types

// --- Reused/Aligned Styles ---

// Use slightly tighter padding for table cells, similar to ManageAccounts and ManageEmailTemplates
const thStyleBase =
  "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top";

const inputStyle = (hasError?: boolean) =>
  `mt-1 block w-full rounded border ${hasError ? "border-red-500" : "border-customGray"} p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed`;
const labelStyle = "block text-sm font-medium text-customBlack/80";
const errorMsgStyle =
  "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
const successMsgStyle =
  "mb-4 rounded border border-green-400 bg-green-100 p-3 text-sm text-green-700";
const fieldErrorStyle = "mt-1 text-xs text-red-600";
const modalErrorStyle =
  "text-sm text-red-600 mb-3 p-3 bg-red-100 border border-red-300 rounded";

// FIX 1: Use the correct CacheKey string literal
const CUSTOMERS_CACHE_KEY: CacheKey = "customers_ManageCustomers";

interface CustomerForDisplay {
  id: string;
  name: string;
  email: string | null;
  totalPaid: number;
  nextAppointment: Date | null;
  createdAt: Date;
  transactions: Array<
    Pick<
      Transaction,
      "id" | "createdAt" | "grandTotal" | "status" | "bookedFor"
    > & {
      availedServices: Array<{
        service?: { title: string } | null;
        originatingSetTitle?: string | null;
      }>;
    }
  >;
  recommendedAppointments: Array<
    Pick<RecommendedAppointment, "id" | "recommendedDate" | "status"> & {
      originatingService?: { title: string } | null;
    }
  >;
  purchasedGiftCertificatesCount: number;
}

const isValidEmail = (email: string | null | undefined): boolean =>
  email ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) : true; // Allow empty/null email as valid if optional

export default function ManageCustomers() {
  const [customers, setCustomers] = useState<CustomerForDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  // FIX 2: Use a more precise type for fieldErrors
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"name" | "email", string[]>>
  >({});
  const [listError, setListError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit" | "view">("add");
  const [selectedCustomerForModal, setSelectedCustomerForModal] =
    useState<CustomerForDisplay | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteCustomerId, setPendingDeleteCustomerId] = useState<string | null>(null);
  const [pendingDeleteCustomerName, setPendingDeleteCustomerName] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  const resetFormState = useCallback(() => {
    setFormError(null);
    setFieldErrors({}); // This is valid with the new type
  }, []);

  const loadCustomers = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setListError(null);
    if (forceRefresh) {
      invalidateCache(CUSTOMERS_CACHE_KEY);
    }
    try {
      // Assuming getCustomersAction correctly uses getCachedData internally
      const fetchedCustomers = await getCustomersAction();
      setCustomers(fetchedCustomers as CustomerForDisplay[]);
    } catch (err: any) {
      setListError(err.message || "Failed to load customers.");
      setCustomers([]); // Clear customers on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleRefresh = () => {
    setSuccessMessage(null); // Clear success message on manual refresh
    loadCustomers(true);
  };

  const openModal = (
    mode: "add" | "edit" | "view",
    customer?: CustomerForDisplay,
  ) => {
    setModalMode(mode);
    resetFormState();
    setSelectedCustomerForModal(customer || null);
    setIsModalOpen(true);
  };

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // selectedCustomerForModal will be cleared by useEffect dependency on isModalOpen
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      setSelectedCustomerForModal(null); // Ensure reset when modal fully closes
      resetFormState();
    } else if (modalMode === "add" || modalMode === "edit") {
      // Small delay to ensure modal is rendered before focusing
      // Use nextTick or a shorter timeout if needed, but 100ms is usually fine
      setTimeout(() => {
        const nameInput = formRef.current?.elements.namedItem("name");
        if (nameInput instanceof HTMLInputElement) nameInput.focus();
      }, 100);
    }
  }, [isModalOpen, modalMode, resetFormState]);

  const validateForm = (formData: FormData): Record<string, string[]> => {
    // Return type matches what is *actually* set
    const errors: Record<string, string[]> = {};
    const name = formData.get("name") as string | null;
    const email = formData.get("email") as string | null;

    if (!name || name.trim().length === 0) {
      errors.name = ["Name is required."];
    } else if (name.trim().length > 50) {
      errors.name = ["Name cannot exceed 50 characters."];
    }

    // Email is optional, but if provided, it must be valid.
    if (email && email.trim().length > 0 && !isValidEmail(email.trim())) {
      errors.email = ["Please enter a valid email address."];
    }

    // No 'form' error key is set by this validation
    return errors;
  };

  const handleSave = () => {
    if (!formRef.current) {
      setFormError("Form reference error. Please try again.");
      return;
    }

    const formData = new FormData(formRef.current);
    const validationErrors = validateForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(
        validationErrors as Partial<Record<"name" | "email", string[]>>,
      ); // Cast for safety, though validateForm should conform
      setFormError("Please fix the errors in the form.");
      return;
    }

    setFormError(null); // Clear previous general form errors
    setFieldErrors({}); // Clear previous field errors
    setSuccessMessage(null); // Clear previous success messages

    startTransition(async () => {
      try {
        let response;
        if (modalMode === "add") {
          response = await createCustomerAction(formData);
        } else {
          // 'edit' mode
          if (!selectedCustomerForModal?.id) {
            setFormError(
              "Customer ID is missing for update. Please close and retry.",
            );
            return;
          }
          response = await updateCustomerAction(
            selectedCustomerForModal.id,
            formData,
          );
        }

        if (response.success) {
          const successMsg = response.message ||
            `Customer ${modalMode === "add" ? "created" : "updated"} successfully!`;
          toast.success("Customer saved", {
            description: successMsg,
          });
          invalidateCache(CUSTOMERS_CACHE_KEY);
          loadCustomers();
          closeModal();
        } else {
          const errorMsg = response.message || "An error occurred. Please check the details.";
          setFormError(errorMsg);
          toast.error("Failed to save customer", {
            description: errorMsg,
          });
          if (response.errors) {
            setFieldErrors(
              response.errors as Partial<Record<"name" | "email", string[]>>,
            );
          }
        }
      } catch (err: any) {
        setFormError(
          err.message || "An unexpected error occurred during submission.",
        );
      }
    });
  };

  const handleDeleteClick = (customer: CustomerForDisplay) => {
    setPendingDeleteCustomerId(customer.id);
    setPendingDeleteCustomerName(customer.name);
    setDeleteDialogOpen(true);
  };

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteCustomerId) {
      setDeleteDialogOpen(false);
      return;
    }

    setListError(null);
    setSuccessMessage(null);
    setDeleteDialogOpen(false);

    startTransition(async () => {
      try {
        const response = await deleteCustomerAction(pendingDeleteCustomerId);
        if (response.success) {
          const successMsg = response.message || "Customer deleted successfully!";
          toast.success("Customer deleted", {
            description: successMsg,
          });
          invalidateCache(CUSTOMERS_CACHE_KEY);
          loadCustomers();
        } else {
          const errorMsg = response.message || "Failed to delete customer. They may have related records.";
          setListError(errorMsg);
          toast.error("Failed to delete customer", {
            description: errorMsg,
          });
        }
      } catch (err: any) {
        const errorMsg = err.message || "An unexpected error occurred while deleting.";
        setListError(errorMsg);
        toast.error("Error", {
          description: errorMsg,
        });
      } finally {
        setPendingDeleteCustomerId(null);
        setPendingDeleteCustomerName(null);
      }
    });
  }, [pendingDeleteCustomerId, loadCustomers]);

  const formatCurrency = (value: number | null | undefined): string => {
    const amount = value ?? 0;
    return amount.toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (
    date: Date | string | null | undefined,
    includeTime = false,
  ): string => {
    if (!date) return "N/A";
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "Invalid Date";
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    if (includeTime) {
      options.hour = "2-digit";
      options.minute = "2-digit";
      options.hour12 = true;
    }
    return d.toLocaleDateString("en-US", options);
  };

  const getStatusClass = (status: PrismaStatus | string | undefined) => {
    if (!status) return "text-gray-500 bg-gray-100";
    switch (status) {
      case PrismaStatus.PENDING:
        return "text-yellow-700 bg-yellow-100";
      case PrismaStatus.DONE:
        return "text-green-700 bg-green-100";
      case PrismaStatus.CANCELLED:
        return "text-red-700 bg-red-100";
      // For RecommendedAppointmentStatus which might be strings
      case "RECOMMENDED":
        return "text-blue-700 bg-blue-100";
      case "SCHEDULED":
        return "text-purple-700 bg-purple-100";
      case "ATTENDED":
        return "text-teal-700 bg-teal-100";
      case "MISSED":
        return "text-orange-700 bg-orange-100";
      default:
        return "text-gray-600 bg-gray-200";
    }
  };

  // Aligned modal container styles with ManageEmailTemplates
  const modalContainerStyle =
    "relative m-auto max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg bg-customOffWhite shadow-xl flex flex-col";
  // Aligned modal content padding with ManageEmailTemplates modal p-6
  const modalContentStyle = "flex-grow overflow-y-auto p-6 space-y-4";
  const modalActionsStyle =
    "flex-shrink-0 flex justify-end space-x-3 border-t border-customGray/30 p-4 bg-customGray/5";

  const isSaving = isPending; // Alias for clarity

  return (
    // Adjusted max-w for potentially better centering feel on wider screens
    <div className="mx-auto max-w-5xl rounded bg-customOffWhite/80 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Aligned heading size and color with ManageEmailTemplates */}
        <h2 className="text-xl font-bold text-customBlack">Manage Customers</h2>
        {/* Header buttons section already responsive */}
        <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row">
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isSaving}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            <RefreshCw
              size={16}
              className={`mr-1 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            onClick={() => openModal("add")}
            size="sm"
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            <PlusCircle size={16} className="mr-1" />
            Add New Customer
          </Button>
        </div>
      </div>

      {listError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {listError}
        </div>
      )}

      {isLoading && customers.length === 0 ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !isLoading && !listError && customers.length === 0 ? (
        // Aligned empty state border/bg color, padding, and shadow with ManageEmailTemplates
        <div className="my-8 rounded-md border border-yellow-400 bg-yellow-50 p-6 text-center shadow">
          {/* Empty state icon size already responsive */}
          <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-yellow-500 md:h-16 md:w-16" />
          {/* Empty state heading size already responsive */}
          <h3 className="text-lg font-semibold text-yellow-800 md:text-xl">
            No Customers Found
          </h3>
          {/* Empty state text size already responsive */}
          <p className="md:text-md mt-2 text-sm text-yellow-700">
            It looks like your customer list is empty. Add your first customer
            to get started!
          </p>
          <Button
            onClick={() => openModal("add")}
            className="mt-6"
            disabled={isSaving}
          >
            <PlusCircle size={16} className="mr-1.5" />
            Add First Customer
          </Button>
        </div>
      ) : (
        // Aligned table container rounded, shadow, and background with ManageEmailTemplates
        <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
          <table className="min-w-full divide-y divide-customGray/20">
            {/* Aligned thead background with ManageEmailTemplates */}
            <thead className="bg-customGray/5">
              <tr>
                {/* thStyleBase is already aligned */}
                <th className={thStyleBase}>Customer</th>
                <th className={thStyleBase}>Total Paid</th>
                {/* HIDE from sm downwards - already present */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Transactions
                </th>
                {/* HIDE from md downwards (show only on md and up) - already present */}
                <th className={`${thStyleBase} hidden md:table-cell`}>
                  Next Appt.
                </th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/10 bg-white">
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="group transition-colors duration-150 hover:bg-customLightBlue/20"
                >
                  <td
                    className={`${tdStyleBase} cursor-pointer`}
                    onClick={() => openModal("view", customer)}
                  >
                    <div className="font-semibold text-customDarkPink group-hover:underline">
                      {customer.name}
                    </div>
                    <div className="text-xs text-customBlack/70">
                      {customer.email || (
                        <span className="italic">No email</span>
                      )}
                    </div>
                  </td>

                  <td
                    className={`${tdStyleBase} whitespace-nowrap font-medium`}
                  >
                    {formatCurrency(customer.totalPaid)}
                  </td>
                  {/* Hidden columns already handled */}
                  <td
                    className={`${tdStyleBase} hidden text-center sm:table-cell`}
                  >
                    {customer.transactions.length}
                  </td>
                  {/* Hidden columns already handled */}
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap md:table-cell`}
                  >
                    {formatDate(customer.nextAppointment)}
                  </td>
                  <td
                    className={`${tdStyleBase} space-x-1 whitespace-nowrap text-right`}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openModal("view", customer)}
                      title="View Details"
                      className="h-8 w-8 p-0 text-sky-600 hover:text-sky-800 hover:bg-sky-50"
                      disabled={isSaving || isLoading}
                    >
                      <Eye size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openModal("edit", customer)}
                      title="Edit Customer"
                      className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                      disabled={isSaving || isLoading}
                    >
                      <Edit3 size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteClick(customer)}
                      title="Delete Customer"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                      disabled={isSaving || isLoading}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "add"
                ? "Add New Customer"
                : modalMode === "edit"
                  ? "Edit Customer Details"
                  : selectedCustomerForModal
                    ? `Customer: ${selectedCustomerForModal.name}`
                    : "Customer Details"}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "view"
                ? "View customer details, transactions, and appointments."
                : modalMode === "add"
                  ? "Fill in the form below to create a new customer."
                  : "Update the customer information below."}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-200px)]">
            {/* ADD/EDIT FORM */}
            {(modalMode === "add" ||
              (modalMode === "edit" && selectedCustomerForModal)) && (
              <>
                <form
                  ref={formRef}
                  onSubmit={(e) => e.preventDefault()}
                  className="space-y-4 p-4"
                >
                  <div className="space-y-4">
                    {formError && (
                      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                        {formError}
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">
                    Customer Name*
                  </Label>
                  <Input
                    type="text"
                    id="name"
                    name="name"
                    defaultValue={selectedCustomerForModal?.name ?? ""}
                    required
                    maxLength={50}
                    className={fieldErrors?.name ? "border-destructive" : ""}
                    disabled={isSaving}
                    aria-invalid={!!fieldErrors?.name}
                    aria-describedby={
                      fieldErrors?.name ? "name-error" : undefined
                    }
                  />
                  {fieldErrors?.name && (
                    <p id="name-error" className="mt-1 text-xs text-destructive">
                      {fieldErrors.name.join(", ")}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Max 50 characters.
                  </p>
                </div>
                <div>
                  <Label htmlFor="email">
                    Email Address
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    defaultValue={selectedCustomerForModal?.email ?? ""}
                    className={fieldErrors?.email ? "border-destructive" : ""}
                    disabled={isSaving}
                    aria-invalid={!!fieldErrors?.email}
                    aria-describedby={
                      fieldErrors?.email ? "email-error" : undefined
                    }
                  />
                  {fieldErrors?.email && (
                    <p id="email-error" className="mt-1 text-xs text-destructive">
                      {fieldErrors.email.join(", ")}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional, but must be valid if provided.
                  </p>
                </div>
                    </div>
                  </div>
                </form>
                <DialogFooter>
              <Button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                variant="outline"
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {modalMode === "add" ? "Creating" : "Updating"}...
                  </>
                ) : (
                  modalMode === "add" ? "Create Customer" : "Save Changes"
                )}
              </Button>
                </DialogFooter>
              </>
            )}
          </ScrollArea>

        {/* VIEW DETAILS SECTION */}
        {modalMode === "view" && selectedCustomerForModal && (
          <>
            <ScrollArea className="max-h-[calc(90vh-200px)]">
              <div className="space-y-4 p-4">
              <div className="mb-6 grid grid-cols-1 gap-x-6 gap-y-3 border-b border-customGray/30 pb-4 md:grid-cols-2">
                {/* These grid items stack on small and become 2 columns on md+ - already responsive */}
                <div>
                  <strong className={labelStyle}>Name:</strong>{" "}
                  <p className="text-customBlack">
                    {selectedCustomerForModal.name}
                  </p>
                </div>
                <div>
                  <strong className={labelStyle}>Email:</strong>{" "}
                  <p className="text-customBlack">
                    {selectedCustomerForModal.email || (
                      <span className="italic text-customGray">N/A</span>
                    )}
                  </p>
                </div>
                <div>
                  <strong className={labelStyle}>Joined On:</strong>{" "}
                  <p className="text-customBlack">
                    {formatDate(selectedCustomerForModal.createdAt)}
                  </p>
                </div>
                <div>
                  <strong className={labelStyle}>Total Amount Paid:</strong>{" "}
                  <p className="font-semibold text-customBlack">
                    {formatCurrency(selectedCustomerForModal.totalPaid)}
                  </p>
                </div>
                <div>
                  <strong className={labelStyle}>Next Appointment:</strong>{" "}
                  <p className="text-customBlack">
                    {formatDate(selectedCustomerForModal.nextAppointment)}
                  </p>
                </div>
                <div>
                  <strong className={labelStyle}>
                    Gift Certificates Purchased:
                  </strong>{" "}
                  <p className="text-customBlack">
                    {selectedCustomerForModal.purchasedGiftCertificatesCount}
                  </p>
                </div>
              </div>

              <h3 className="mb-2 flex items-center text-lg font-semibold text-customDarkPink">
                <ShoppingCart size={20} className="mr-2.5" />
                Transactions ({selectedCustomerForModal.transactions.length})
              </h3>
              {selectedCustomerForModal.transactions.length > 0 ? (
                // This container already uses max-h and overflow-y-auto
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border bg-white/70 p-3 shadow-inner">
                  {selectedCustomerForModal.transactions
                    // Limit transactions shown in view mode for performance/clarity
                    .slice(0, 10)
                    .map((tx) => (
                      <div
                        key={tx.id}
                        className="border-b border-customGray/20 p-2 text-sm last:border-b-0"
                      >
                        <div className="mb-0.5 flex items-center justify-between">
                          <span className="font-medium">
                            {formatDate(tx.bookedFor || tx.createdAt, true)} -{" "}
                            {formatCurrency(tx.grandTotal)}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(tx.status)}`}
                          >
                            {tx.status}
                          </span>
                        </div>
                        <p className="truncate text-xs text-customBlack/70">
                          Services:{" "}
                          {tx.availedServices
                            .map(
                              (as) =>
                                as.service?.title || as.originatingSetTitle,
                            )
                            .filter(Boolean)
                            .join(", ") || (
                            <span className="italic">
                              Details not available
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  {selectedCustomerForModal.transactions.length > 10 && (
                    <p className="pt-2 text-center text-xs italic text-customBlack/60">
                      ...and {selectedCustomerForModal.transactions.length - 10}{" "}
                      more transactions (showing latest 10).
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm italic text-customBlack/60">
                  No transactions recorded for this customer.
                </p>
              )}

              <h3 className="mb-2 mt-6 flex items-center text-lg font-semibold text-customDarkPink">
                <CalendarCheck size={20} className="mr-2.5" />
                Recommended Appointments (
                {selectedCustomerForModal.recommendedAppointments.length})
              </h3>
              {selectedCustomerForModal.recommendedAppointments.length > 0 ? (
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border bg-white/70 p-3 shadow-inner">
                  {selectedCustomerForModal.recommendedAppointments
                    // Limit recommendations shown in view mode
                    .slice(0, 5)
                    .map((rec) => (
                      <div
                        key={rec.id}
                        className="border-b border-customGray/20 p-2 text-sm last:border-b-0"
                      >
                        <div className="mb-0.5 flex items-center justify-between">
                          <span className="font-medium">
                            Recommended: {formatDate(rec.recommendedDate)}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(rec.status)}`}
                          >
                            {rec.status}
                          </span>
                        </div>
                        <p className="truncate text-xs text-customBlack/70">
                          Service:{" "}
                          {rec.originatingService?.title || (
                            <span className="italic">
                              Details not available
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  {selectedCustomerForModal.recommendedAppointments.length >
                    5 && (
                    <p className="pt-2 text-center text-xs italic text-customBlack/60">
                      ...and{" "}
                      {selectedCustomerForModal.recommendedAppointments.length -
                        5}{" "}
                      more recommendations (showing latest 5).
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm italic text-customBlack/60">
                  No recommended appointments for this customer.
                </p>
              )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  setModalMode("edit");
                }}
                disabled={isSaving}
              >
                <Edit3 size={16} className="mr-1.5" />
                Edit This Customer
              </Button>
              <Button type="button" onClick={closeModal} variant="outline">
                Close View
              </Button>
            </DialogFooter>
          </>
        )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogOpen(false);
          setPendingDeleteCustomerId(null);
          setPendingDeleteCustomerName(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the customer{" "}
              <span className="font-semibold">{pendingDeleteCustomerName}</span>?
              This action cannot be undone and may fail if the customer has associated records (transactions, recommendations, etc.).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setPendingDeleteCustomerId(null);
                setPendingDeleteCustomerName(null);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Customer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
