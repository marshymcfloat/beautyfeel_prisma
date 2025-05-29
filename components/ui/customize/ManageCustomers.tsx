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
} from "@/lib/ServerAction";
import { CacheKey, invalidateCache } from "@/lib/cache";
import Button from "@/components/Buttons/Button";
import {
  PlusCircle,
  Edit3,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";

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

const CUSTOMERS_CACHE_KEY: CacheKey = "customers_ManageCustomers";

interface CustomerForDisplay {
  id: string;
  name: string;
  email: string | null;
  totalPaid: number;
  nextAppointment: Date | null;
}

const isValidEmail = (email: string | null | undefined): boolean =>
  email ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) : true;

export default function ManageCustomers() {
  const [customers, setCustomers] = useState<CustomerForDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [listError, setListError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingCustomer, setEditingCustomer] =
    useState<CustomerForDisplay | null>(null);
  const [isPending, startTransition] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);

  const resetFormState = useCallback(() => {
    setFormError(null);
    setFieldErrors({});
  }, []);

  const loadCustomers = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setListError(null);
    if (forceRefresh) {
      invalidateCache(CUSTOMERS_CACHE_KEY);
    }
    try {
      const fetchedCustomers = await getCustomersAction();
      setCustomers(fetchedCustomers);
    } catch (err: any) {
      setListError(err.message || "Failed to load customers.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleRefresh = () => {
    loadCustomers(true);
  };

  const openModal = (mode: "add" | "edit", customer?: CustomerForDisplay) => {
    setModalMode(mode);
    resetFormState();
    if (mode === "edit" && customer) {
      setEditingCustomer(customer);
    } else {
      setEditingCustomer(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      setEditingCustomer(null);
      resetFormState();
    } else {
      setTimeout(() => {
        const nameInput = formRef.current?.elements.namedItem("name");

        if (nameInput instanceof HTMLElement) {
          nameInput.focus();
        }
      }, 0);
    }
  }, [isModalOpen, resetFormState]);

  const validateForm = (formData: FormData): Record<string, string[]> => {
    const errors: Record<string, string[]> = {};
    const name = formData.get("name") as string | null;
    const email = formData.get("email") as string | null;

    if (!name?.trim()) {
      errors.name = ["Name is required."];
    }

    if (email && !isValidEmail(email)) {
      errors.email = ["Please enter a valid email address."];
    }

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
      setFieldErrors(validationErrors);
      setFormError("Please fix the errors in the form.");
      return;
    }

    setFormError(null);
    setListError(null);
    setSuccessMessage(null);

    const name = (formData.get("name") as string | null)?.trim();
    const email = (formData.get("email") as string | null)?.trim();
    const dataToSubmit = { name: name!, email: email === "" ? null : email };

    startTransition(async () => {
      try {
        let response;
        if (modalMode === "add") {
          response = await createCustomerAction(formData);
        } else {
          if (!editingCustomer?.id)
            throw new Error("Customer ID is missing for update.");

          response = await updateCustomerAction(editingCustomer.id, formData);
        }

        if (response.success) {
          setSuccessMessage(
            response.message ||
              `Customer ${modalMode === "add" ? "created" : "updated"} successfully!`,
          );
          setFormError(null);
          invalidateCache(CUSTOMERS_CACHE_KEY);
          loadCustomers();
          closeModal();
        } else {
          setFormError(response.message || "An error occurred.");
          setSuccessMessage(null);
          if (response.errors)
            setFieldErrors(response.errors as Record<string, string[]>);
        }
      } catch (err: any) {
        setFormError(err.message || "An unexpected error occurred.");
        setSuccessMessage(null);
      }
    });
  };

  const handleDelete = (customerId: string, customerName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the customer "${customerName}"? This action cannot be undone and may fail if the customer has associated records (transactions, recommendations, etc.).`,
      )
    ) {
      return;
    }

    setListError(null);
    setSuccessMessage(null);
    setFormError(null);

    startTransition(async () => {
      try {
        const response = await deleteCustomerAction(customerId);
        if (response.success) {
          setSuccessMessage(
            response.message || "Customer deleted successfully!",
          );
          setListError(null);
          invalidateCache(CUSTOMERS_CACHE_KEY);
          loadCustomers();
        } else {
          setListError(response.message || "Failed to delete customer.");
          setSuccessMessage(null);
        }
      } catch (err: any) {
        setListError(
          err.message || "An unexpected error occurred while deleting.",
        );
        setSuccessMessage(null);
      }
    });
  };

  const formatCurrency = (value: number | null | undefined): string => {
    const amount = (value ?? 0) / 100;
    return amount.toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return "N/A";
    const d = typeof date === "string" ? new Date(date) : date;

    if (isNaN(d.getTime())) return "Invalid Date";

    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top";

  const modalContainerStyle =
    "relative m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl";

  const isSaving = isPending;

  return (
    <div className="mx-auto max-w-6xl rounded-lg bg-customOffWhite p-4 shadow-md">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-customBlack">Manage Customers</h2>
        <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row">
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isSaving}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            icon={
              <RefreshCw
                size={16}
                className={`${isLoading ? "animate-spin" : ""}`}
              />
            }
          >
            Refresh
          </Button>
          <Button
            onClick={() => openModal("add")}
            size="sm"
            disabled={isSaving}
            className="w-full sm:w-auto"
            icon={<PlusCircle size={16} />}
          >
            Add New Customer
          </Button>
        </div>
      </div>

      {listError && <p className={errorMsgStyle}>{listError}</p>}
      {successMessage && <p className={successMsgStyle}>{successMessage}</p>}

      {isLoading && customers.length === 0 ? (
        <p className="py-4 text-center text-customBlack/70">
          Loading customers...
        </p>
      ) : !listError && customers.length === 0 ? (
        <div className="my-8 rounded-md border border-yellow-400 bg-yellow-50 p-4 text-center">
          <AlertTriangle className="mx-auto mb-2 h-12 w-12 text-yellow-500" />
          <h3 className="text-lg font-medium text-yellow-800">
            No Customers Found
          </h3>
          <p className="mt-1 text-sm text-yellow-700">
            Add your first customer to get started.
          </p>
          <Button
            onClick={() => openModal("add")}
            size="sm"
            className="mt-4"
            disabled={isSaving}
          >
            <PlusCircle size={16} className="mr-1" /> Add Customer
          </Button>
        </div>
      ) : (
        <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
          <table className="min-w-full divide-y divide-customGray/20">
            <thead className="bg-customGray/5">
              <tr>
                <th className={thStyleBase}>Name</th>
                <th className={thStyleBase}>Email</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Total Paid
                </th>
                <th className={`${thStyleBase} hidden md:table-cell`}>
                  Next Appt.
                </th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/10 bg-white">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-customLightBlue/10">
                  <td className={`${tdStyleBase} font-medium`}>
                    {customer.name}
                  </td>
                  <td className={tdStyleBase}>
                    {customer.email || (
                      <span className="italic text-gray-400">N/A</span>
                    )}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
                  >
                    {formatCurrency(customer.totalPaid)}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap md:table-cell`}
                  >
                    {formatDate(customer.nextAppointment)}
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <button
                      onClick={() => openModal("edit", customer)}
                      className="mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      title="Edit Customer"
                      disabled={isSaving}
                    >
                      <Edit3 size={16} /> {}
                    </button>
                    <button
                      onClick={() => handleDelete(customer.id, customer.name)}
                      className="inline-block p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Delete Customer"
                      disabled={isSaving}
                    >
                      <Trash2 size={16} /> {}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <DialogTitle>
            {modalMode === "add" ? "Add New" : "Edit"} Customer
          </DialogTitle>
        }
        containerClassName={modalContainerStyle}
      >
        <form
          key={editingCustomer?.id ?? "new-customer-form"}
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4"
        >
          {formError && <p className={modalErrorStyle}>{formError}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelStyle}>
                Customer Name*
              </label>
              <input
                type="text"
                id="name"
                name="name"
                defaultValue={editingCustomer?.name ?? ""}
                required
                maxLength={50}
                className={inputStyle(!!fieldErrors.name)}
                disabled={isSaving}
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
              />
              {fieldErrors.name && (
                <p id="name-error" className={fieldErrorStyle}>
                  {fieldErrors.name.join(", ")}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">Max 50 characters.</p>
            </div>
            <div>
              <label htmlFor="email" className={labelStyle}>
                Email (Optional)
              </label>
              <input
                type="email"
                id="email"
                name="email"
                defaultValue={editingCustomer?.email ?? ""}
                className={inputStyle(!!fieldErrors.email)}
                disabled={isSaving}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && (
                <p id="email-error" className={fieldErrorStyle}>
                  {fieldErrors.email.join(", ")}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Must be a valid email format.
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            <Button
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              variant="outline"
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? `${modalMode === "add" ? "Creating" : "Updating"}...`
                : `${modalMode === "add" ? "Create Customer" : "Save Changes"}`}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
