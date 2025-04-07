// src/app/(app)/customize/_components/ManageAccounts.tsx
"use client";
import React, { useState, useEffect, useTransition, useRef } from "react"; // Import useRef

import {
  createAccountAction,
  updateAccountAction,
  deleteAccountAction,
} from "@/lib/ServerAction";

// Import Role enum from Prisma client
import { Role } from "@prisma/client"; // Make sure Prisma client is generated
const ALL_ROLES = Object.values(Role);

// TODO: Replace 'any' with actual Prisma types
import type {
  Account as PrismaAccount,
  Branch as PrismaBranch,
} from "@prisma/client";
type Account = PrismaAccount & { branch?: PrismaBranch | null }; // Include optional branch relation
type Branch = PrismaBranch;

// --- API Fetch Functions --- (Keep as is)
const fetchAccounts = async (): Promise<Account[]> => {
  console.log("Fetching /api/accounts...");
  const response = await fetch("/api/accounts"); // GET request
  if (!response.ok) {
    const errorData = await response.text(); // Read error text
    console.error("Fetch Accounts Error Response:", errorData);
    throw new Error(`Failed to fetch accounts: ${response.statusText}`);
  }
  // Add explicit type casting if needed, or ensure API returns correct shape
  const data = await response.json();
  return data as Account[];
};

const fetchBranchesForAccounts = async (): Promise<Branch[]> => {
  console.log("Fetching /api/branches...");
  const response = await fetch("/api/branches"); // Reuse branch API
  if (!response.ok) {
    const errorData = await response.text();
    console.error("Fetch Branches Error Response:", errorData);
    throw new Error(`Failed to fetch branches: ${response.statusText}`);
  }
  // Add explicit type casting if needed
  const data = await response.json();
  return data as Branch[];
};
// --- End API Fetch ---

export default function ManageAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null); // Ref for the form

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setListError(null);
      try {
        const [fetchedAccounts, fetchedBranches] = await Promise.all([
          fetchAccounts(),
          fetchBranchesForAccounts(),
        ]);
        setAccounts(fetchedAccounts);
        setBranches(fetchedBranches);
      } catch (err: any) {
        console.error("Failed to load account data:", err);
        setListError(err.message || "Failed to load account data.");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAdd = () => {
    setEditingAccount(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (accountId: string) => {
    if (window.confirm("Are you sure you want to delete this account?")) {
      setListError(null);
      startTransition(async () => {
        const result = await deleteAccountAction(accountId);
        if (!result.success) {
          setListError(result.message);
          console.error("Delete failed:", result.message);
        } else {
          console.log("Delete successful");
          // UI should update via revalidatePath in action
        }
      });
    }
  };

  // Modified handleSave for onClick
  const handleSave = async () => {
    if (!formRef.current) {
      setFormError("Form reference is not available.");
      console.error("Form ref not found");
      return;
    }

    setFormError(null); // Clear previous form errors
    const formData = new FormData(formRef.current); // Get form data using ref

    // Basic client-side check (optional)
    const selectedRoles = ALL_ROLES.filter(
      (role) => formData.get(`role-${role}`) === "on",
    );
    if (selectedRoles.length === 0) {
      setFormError("Please select at least one role.");
      return;
    }
    if (
      !editingAccount &&
      (!formData.get("password") ||
        (formData.get("password") as string).length < 6)
    ) {
      setFormError("Password is required for new accounts (min 6 characters).");
      return;
    }

    startTransition(async () => {
      try {
        let result;
        if (editingAccount) {
          result = await updateAccountAction(editingAccount.id, formData);
        } else {
          result = await createAccountAction(formData);
        }

        if (result.success) {
          setIsModalOpen(false);
          setEditingAccount(null);
          console.log("Save successful:", result.message);
          // UI updates via revalidatePath
        } else {
          // Combine general message with specific field errors if available
          let errorMsg = result.message;
          if (result.errors) {
            const fieldErrors = Object.entries(result.errors)
              .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
              .join("; ");
            errorMsg += ` (${fieldErrors})`;
          }
          setFormError(errorMsg); // Show error within the modal form
          console.error("Save failed:", result.message, result.errors);
        }
      } catch (err) {
        console.error("Unexpected error during save action:", err);
        setFormError("An unexpected error occurred. Please try again.");
      }
    });
  };

  const isSaving = isPending;

  return (
    <div>
      {/* Title and Add Button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Manage Accounts</h2>
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="rounded bg-pink-500 px-4 py-2 text-white hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-600 focus:ring-opacity-50 disabled:opacity-50"
        >
          Add New Account
        </button>
      </div>

      {/* List Error Display */}
      {listError && (
        <p className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
          {listError}
        </p>
      )}

      {/* Table Display */}
      {isLoading && !accounts.length ? (
        <p className="py-4 text-center text-gray-500">Loading accounts...</p>
      ) : !isLoading && accounts.length === 0 && !listError ? (
        <p className="py-4 text-center text-gray-500">No accounts found.</p>
      ) : (
        <div className="overflow-x-auto rounded bg-white bg-opacity-60 shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 bg-opacity-80">
              <tr>
                {/* ... table headers ... */}
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Roles
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Salary
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Branch
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {accounts.map((account) => (
                <tr
                  key={account.id}
                  className="transition-colors hover:bg-gray-50 hover:bg-opacity-50"
                >
                  {/* ... table cells ... */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {account.username}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {account.name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {account.email ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {(account.role || []) // Use `role` which should be Role[]
                      .map(
                        (r: Role) => r.charAt(0) + r.slice(1).toLowerCase(), // Use Role enum value
                      )
                      .join(", ") || "-"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {/* Format salary if needed */}
                    {account.salary}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {account.branch?.title ?? "N/A"}{" "}
                    {/* Access nested property safely */}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(account)}
                      disabled={isPending}
                      className="mr-3 text-indigo-600 transition-colors hover:text-indigo-900 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
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

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out">
          <div className="max-h-[90vh] w-full max-w-lg scale-100 transform overflow-y-auto rounded-lg bg-white p-6 shadow-xl transition-all duration-300 ease-in-out">
            <h3 className="mb-4 text-lg font-semibold leading-6 text-gray-900">
              {editingAccount ? "Edit Account" : "Add New Account"}
            </h3>
            {/* Display form-specific errors */}
            {formError && (
              <p className="mb-4 rounded border border-red-400 bg-red-100 p-2 text-xs text-red-700">
                {formError}
              </p>
            )}
            {/* Add ref and onSubmit prevent default */}
            <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* ... form fields ... */}
                <div>
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="username"
                    id="username"
                    required
                    maxLength={20}
                    defaultValue={editingAccount?.username ?? ""}
                    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Max 20 characters.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    id="name"
                    required
                    defaultValue={editingAccount?.name ?? ""}
                    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                  />
                </div>
                {!editingAccount && (
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      id="password"
                      required
                      minLength={6}
                      className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Required for new accounts. Min 6 characters.
                    </p>
                  </div>
                )}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    defaultValue={editingAccount?.email ?? ""}
                    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="salary"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Salary <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="salary"
                    id="salary"
                    required
                    min="0"
                    step="1"
                    defaultValue={editingAccount?.salary ?? 0}
                    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="branchId"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Branch
                  </label>
                  <select
                    name="branchId"
                    id="branchId"
                    defaultValue={editingAccount?.branchId ?? ""}
                    className="mt-1 block w-full rounded border border-gray-300 bg-white p-2 shadow-sm sm:text-sm"
                  >
                    <option value="">-- No Branch Assigned --</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Roles <span className="text-red-500">*</span>
                </label>
                <div className="mt-2 space-y-2 sm:flex sm:space-x-4 sm:space-y-0">
                  {ALL_ROLES.map((role) => (
                    <div key={role} className="flex items-center">
                      <input
                        id={`role-${role}`}
                        name={`role-${role}`}
                        type="checkbox"
                        defaultChecked={editingAccount?.role?.includes(role)}
                        className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                      />
                      <label
                        htmlFor={`role-${role}`}
                        className="ml-2 block text-sm text-gray-900"
                      >
                        {role.charAt(0) + role.slice(1).toLowerCase()}{" "}
                        {/* Capitalize */}
                      </label>
                    </div>
                  ))}
                </div>
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
                    : editingAccount
                      ? "Save Changes"
                      : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
