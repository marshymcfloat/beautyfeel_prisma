// src/app/(app)/customize/_components/ManageVouchers.tsx
"use client";
import React, { useState, useEffect, useTransition, useRef } from "react"; // Import useRef

import {
  createVoucherAction,
  updateVoucherAction,
  deleteVoucherAction,
} from "@/lib/ServerAction";

// TODO: Replace 'any' with actual Prisma types
import type { Voucher as PrismaVoucher } from "@prisma/client";
type Voucher = PrismaVoucher;

// --- API Fetch Functions --- (Keep as is)
const fetchVouchers = async (): Promise<Voucher[]> => {
  console.log("Fetching /api/vouchers...");
  const response = await fetch("/api/vouchers"); // GET request
  if (!response.ok) {
    const errorData = await response.text();
    console.error("Fetch Vouchers Error Response:", errorData);
    throw new Error(`Failed to fetch vouchers: ${response.statusText}`);
  }
  // Add explicit type casting if needed
  const data = await response.json();
  return data as Voucher[];
};
// --- End API Fetch ---

export default function ManageVouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null); // Ref for the form

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setListError(null);
      try {
        const fetched = await fetchVouchers();
        setVouchers(fetched);
      } catch (err: any) {
        setListError(err.message || "Failed to load vouchers.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAdd = () => {
    setEditingVoucher(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleEdit = (voucher: Voucher) => {
    if (voucher.usedAt) {
      alert("Cannot edit a voucher that has already been used.");
      return;
    }
    setEditingVoucher(voucher);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (voucherId: string) => {
    if (!window.confirm("Are you sure you want to delete this voucher?"))
      return;

    setListError(null);
    startTransition(async () => {
      const result = await deleteVoucherAction(voucherId);
      if (!result.success) {
        setListError(result.message);
        console.error("Delete failed:", result.message);
      } else {
        console.log("Delete successful");
        // UI update via revalidatePath
      }
    });
  };

  // Modified handleSave for onClick
  const handleSave = async () => {
    if (!formRef.current) {
      setFormError("Form reference is not available.");
      console.error("Form ref not found");
      return;
    }

    setFormError(null);
    const formData = new FormData(formRef.current); // Get form data using ref

    // Optional: Client-side checks
    const code = formData.get("code");
    const value = formData.get("value");
    // Code check only needed when *creating*, not editing (as it's disabled)
    if (!editingVoucher && (!code || (code as string).trim() === "")) {
      setFormError("Voucher Code is required for new vouchers.");
      return;
    }
    if (!value) {
      setFormError("Value is required.");
      return;
    }

    startTransition(async () => {
      try {
        let result;
        if (editingVoucher) {
          // Ensure only 'value' is passed if 'code' shouldn't be updated
          // The server action should handle ignoring the 'code' field if present during update
          result = await updateVoucherAction(editingVoucher.id, formData);
        } else {
          result = await createVoucherAction(formData);
        }

        if (result.success) {
          setIsModalOpen(false);
          setEditingVoucher(null);
          console.log("Save successful:", result.message);
          // UI update via revalidatePath
        } else {
          let errorMsg = result.message;
          if (result.errors) {
            const fieldErrors = Object.entries(result.errors)
              .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
              .join("; ");
            errorMsg += ` (${fieldErrors})`;
          }
          setFormError(errorMsg);
          console.error("Save failed:", result.message, result.errors);
        }
      } catch (err) {
        console.error("Unexpected error during save action:", err);
        setFormError("An unexpected error occurred. Please try again.");
      }
    });
  };

  const isSaving = isPending;

  // Helper function to format date (optional)
  const formatDate = (dateString: Date | string | null): string => {
    if (!dateString) return "Active";
    try {
      // Handle both Date objects and string representations
      const date =
        typeof dateString === "string" ? new Date(dateString) : dateString;
      if (isNaN(date.getTime())) {
        // Check if the date is valid
        return "Used (Invalid Date)";
      }
      return date.toLocaleDateString(); // Or use a more specific format
    } catch (e) {
      console.error("Error formatting date:", e);
      return "Used (Error)";
    }
  };

  return (
    <div>
      {/* Title and Add Button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Manage Vouchers</h2>
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="rounded bg-pink-500 px-4 py-2 text-white hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-600 focus:ring-opacity-50 disabled:opacity-50"
        >
          Add New Voucher
        </button>
      </div>

      {/* List Error Display */}
      {listError && (
        <p className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
          {listError}
        </p>
      )}

      {/* Table Display */}
      {isLoading && !vouchers.length ? (
        <p className="py-4 text-center text-gray-500">Loading vouchers...</p>
      ) : !isLoading && vouchers.length === 0 && !listError ? (
        <p className="py-4 text-center text-gray-500">No vouchers found.</p>
      ) : (
        <div className="overflow-x-auto rounded bg-white bg-opacity-60 shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 bg-opacity-80">
              <tr>
                {/* ... table headers ... */}
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {vouchers.map((voucher) => (
                <tr
                  key={voucher.id}
                  className={`transition-colors hover:bg-gray-50 hover:bg-opacity-50 ${voucher.usedAt ? "opacity-60" : ""}`}
                >
                  {/* ... table cells ... */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {voucher.code}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {voucher.value}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {voucher.usedAt ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                        Used on {formatDate(voucher.usedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(voucher)}
                      disabled={!!voucher.usedAt || isPending} // Disable if used OR pending
                      className={`mr-3 text-indigo-600 transition-colors hover:text-indigo-900 disabled:opacity-50 ${voucher.usedAt ? "cursor-not-allowed" : ""}`}
                    >
                      {" "}
                      Edit{" "}
                    </button>
                    <button
                      onClick={() => handleDelete(voucher.id)}
                      disabled={isPending}
                      className="text-red-600 transition-colors hover:text-red-900 disabled:opacity-50"
                    >
                      {" "}
                      Delete{" "}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out">
          <div className="w-full max-w-md scale-100 transform rounded-lg bg-white p-6 shadow-xl transition-all duration-300 ease-in-out">
            <h3 className="mb-4 text-lg font-semibold leading-6 text-gray-900">
              {editingVoucher ? "Edit Voucher" : "Add New Voucher"}
            </h3>
            {/* Form Error Display */}
            {formError && (
              <p className="mb-4 rounded border border-red-400 bg-red-100 p-2 text-xs text-red-700">
                {formError}
              </p>
            )}
            {/* Add ref and onSubmit prevent default */}
            <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
              <div className="mb-4">
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-gray-700"
                >
                  Voucher Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="code"
                  id="code"
                  required={!editingVoucher} // Only required on create
                  defaultValue={editingVoucher?.code ?? ""}
                  disabled={!!editingVoucher} // Disable code editing after creation
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100 sm:text-sm"
                  style={{ textTransform: "uppercase" }} // Visually suggest uppercase
                />
                {editingVoucher && (
                  <p className="mt-1 text-xs text-gray-500">
                    Code cannot be changed.
                  </p>
                )}
                {!editingVoucher && (
                  <p className="mt-1 text-xs text-gray-500">
                    Will be stored in uppercase.
                  </p>
                )}
              </div>
              <div className="mb-4">
                <label
                  htmlFor="value"
                  className="block text-sm font-medium text-gray-700"
                >
                  Value (Amount) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="value"
                  id="value"
                  required
                  min="1"
                  step="1" // Assuming integer value based on schema
                  defaultValue={editingVoucher?.value ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                />
              </div>

              {/* Modal Buttons */}
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                {/* Change type to "button" and add onClick */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? "Saving..."
                    : editingVoucher
                      ? "Save Changes"
                      : "Create Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
