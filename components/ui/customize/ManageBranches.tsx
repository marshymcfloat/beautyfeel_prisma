// src/app/(app)/customize/_components/ManageBranches.tsx
"use client";
import React, { useState, useEffect, useTransition, useRef } from "react"; // Import useRef
import {
  createBranchAction,
  updateBranchAction,
  deleteBranchAction,
} from "@/lib/ServerAction";

// TODO: Replace 'any' with actual Prisma types
import type { Branch as PrismaBranch } from "@prisma/client";
type Branch = PrismaBranch; // Use Prisma type directly

// --- Fetch function using the simplified GET API route ---
const fetchBranches = async (): Promise<Branch[]> => {
  const response = await fetch("/api/branches"); // Use the GET route
  if (!response.ok) {
    throw new Error(`Failed to fetch branches: ${response.statusText}`);
  }
  // Add explicit type casting if needed
  const data = await response.json();
  return data as Branch[];
};
// --- End Fetch Function ---

export default function ManageBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // Use a single error state for simplicity here
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null); // Ref for the form

  // --- Fetch initial data ---
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedBranches = await fetchBranches();
        setBranches(fetchedBranches);
      } catch (err: any) {
        console.error("Failed to load data:", err);
        setError(err.message || "Failed to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // --- Action Handlers ---
  const handleAdd = () => {
    setEditingBranch(null);
    setError(null);
    setIsModalOpen(true);
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (branchId: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this branch? This might be irreversible.",
      )
    ) {
      setError(null);
      startTransition(async () => {
        const result = await deleteBranchAction(branchId);
        if (!result.success) {
          setError(result.message);
          console.error("Delete failed:", result.message);
        } else {
          console.log("Delete successful");
          // Revalidation should handle UI update
        }
      });
    }
  };

  // Modified handleSave for onClick
  const handleSave = async () => {
    if (!formRef.current) {
      setError("Form reference is not available.");
      console.error("Form ref not found");
      return;
    }

    setError(null);
    const formData = new FormData(formRef.current); // Get form data using ref

    startTransition(async () => {
      try {
        let result;
        if (editingBranch) {
          result = await updateBranchAction(editingBranch.id, formData);
        } else {
          result = await createBranchAction(formData);
        }

        if (result.success) {
          setIsModalOpen(false);
          setEditingBranch(null);
          console.log("Save successful:", result.message);
          // Revalidation should update the list
        } else {
          setError(
            result.message +
              (result.errors
                ? ` (${Object.values(result.errors).join(", ")})`
                : ""),
          );
          console.error("Save failed:", result.message, result.errors);
        }
      } catch (err) {
        console.error("Unexpected error during save action:", err);
        setError("An unexpected error occurred. Please try again.");
      }
    });
  };

  const isSaving = isPending;

  return (
    <div>
      {/* Title and Add Button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Manage Branches</h2>
        <button
          onClick={handleAdd}
          disabled={isPending} // Disable if any action is pending
          className="rounded bg-pink-500 px-4 py-2 text-white transition-colors hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-600 focus:ring-opacity-50 disabled:opacity-50"
        >
          Add New Branch
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <p className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Table Display */}
      {isLoading && !branches.length ? (
        <p className="py-4 text-center text-gray-500">Loading branches...</p>
      ) : !isLoading && branches.length === 0 && !error ? (
        <p className="py-4 text-center text-gray-500">No branches found.</p>
      ) : (
        <div className="overflow-x-auto rounded bg-white bg-opacity-60 shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 bg-opacity-80">
              <tr>
                {/* ... table headers ... */}
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total Sales (Example)
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {branches.map((branch) => (
                <tr
                  key={branch.id}
                  className="transition-colors hover:bg-gray-50 hover:bg-opacity-50"
                >
                  {/* ... table cells ... */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {branch.title}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {branch.code}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {/* Placeholder or calculate actual sales */}
                    {"N/A"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(branch)}
                      disabled={isPending}
                      className="mr-3 text-indigo-600 transition-colors hover:text-indigo-900 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(branch.id)}
                      disabled={isPending}
                      className="text-red-600 transition-colors hover:text-red-900 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out">
          <div className="w-full max-w-md scale-100 transform rounded-lg bg-white p-6 shadow-xl transition-all duration-300 ease-in-out">
            <h3 className="mb-4 text-lg font-semibold leading-6 text-gray-900">
              {editingBranch ? "Edit Branch" : "Add New Branch"}
            </h3>
            {error && (
              <p className="mb-4 rounded border border-red-400 bg-red-100 p-2 text-xs text-red-700">
                {error} {/* Show form-specific error here */}
              </p>
            )}

            {/* Add ref and onSubmit prevent default */}
            <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
              <div className="mb-4">
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700"
                >
                  Branch Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  id="title"
                  required
                  defaultValue={editingBranch?.title ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                />
              </div>
              <div className="mb-4">
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-gray-700"
                >
                  Branch Code{" "}
                  {!editingBranch && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  name="code"
                  id="code"
                  required={!editingBranch}
                  maxLength={6}
                  defaultValue={editingBranch?.code ?? ""}
                  disabled={!!editingBranch}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100 sm:text-sm"
                  style={{ textTransform: "uppercase" }}
                />
                {editingBranch && (
                  <p className="mt-1 text-xs text-gray-500">
                    Code cannot be changed.
                  </p>
                )}
                {!editingBranch && (
                  <p className="mt-1 text-xs text-gray-500">
                    Max 6 chars. Uppercase.
                  </p>
                )}
              </div>

              {/* Modal buttons */}
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
                    : editingBranch
                      ? "Save Changes"
                      : "Create Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
