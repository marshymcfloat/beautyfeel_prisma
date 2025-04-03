// src/app/(app)/customize/_components/ManageServices.tsx
"use client";
import React, { useState, useEffect, useTransition, useRef } from "react"; // Import useRef

import {
  createServiceAction,
  updateServiceAction,
  deleteServiceAction,
} from "@/lib/ServerAction";

// TODO: Replace 'any' with actual Prisma types
import type {
  Service as PrismaService,
  Branch as PrismaBranch,
} from "@prisma/client";
type Service = PrismaService & { branch?: PrismaBranch | null }; // Include optional branch
type Branch = PrismaBranch;

// --- API Fetch Functions --- (Keep as is)
const fetchServices = async (): Promise<Service[]> => {
  console.log("Fetching /api/services...");
  const response = await fetch("/api/services"); // GET request
  if (!response.ok) {
    const errorData = await response.text();
    console.error("Fetch Services Error Response:", errorData);
    throw new Error(`Failed to fetch services: ${response.statusText}`);
  }
  // Add explicit type casting if needed
  const data = await response.json();
  return data as Service[];
};

const fetchBranchesForServices = async (): Promise<Branch[]> => {
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

export default function ManageServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null); // Ref for the form

  // Fetch initial data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setListError(null);
      try {
        const [fetchedServices, fetchedBranches] = await Promise.all([
          fetchServices(),
          fetchBranchesForServices(),
        ]);
        setServices(fetchedServices);
        setBranches(fetchedBranches);
      } catch (err: any) {
        console.error("Failed to load data:", err);
        setListError(err.message || "Failed to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAdd = () => {
    setEditingService(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (serviceId: string) => {
    if (window.confirm("Are you sure you want to delete this service?")) {
      setListError(null);
      startTransition(async () => {
        const result = await deleteServiceAction(serviceId);
        if (!result.success) {
          setListError(result.message);
          console.error("Delete failed:", result.message);
        } else {
          console.log("Delete successful");
          // UI update via revalidatePath
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
    setFormError(null);
    const formData = new FormData(formRef.current); // Get form data using ref

    // Optional: Client-side check
    if (
      !formData.get("title") ||
      !formData.get("price") ||
      !formData.get("branchId")
    ) {
      setFormError("Please fill in Title, Price, and Branch.");
      return;
    }

    startTransition(async () => {
      try {
        let result;
        if (editingService) {
          result = await updateServiceAction(editingService.id, formData);
        } else {
          result = await createServiceAction(formData);
        }

        if (result.success) {
          setIsModalOpen(false);
          setEditingService(null);
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

  return (
    <div>
      {/* Title and Add Button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Manage Services</h2>
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="rounded bg-pink-500 px-4 py-2 text-white transition-colors hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-600 focus:ring-opacity-50 disabled:opacity-50"
        >
          {" "}
          Add New Service{" "}
        </button>
      </div>

      {/* List Error Display */}
      {listError && (
        <p className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
          {listError}
        </p>
      )}

      {/* Table Display */}
      {isLoading && !services.length ? (
        <p className="py-4 text-center text-gray-500">Loading services...</p>
      ) : !isLoading && services.length === 0 && !listError ? (
        <p className="py-4 text-center text-gray-500">
          No services found. Add one!
        </p>
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
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Price
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
              {services.map((service) => (
                <tr
                  key={service.id}
                  className="transition-colors hover:bg-gray-50 hover:bg-opacity-50"
                >
                  {/* ... table cells ... */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {service.title}
                  </td>
                  <td className="max-w-xs whitespace-normal break-words px-6 py-4 text-sm text-gray-500">
                    {service.description ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {service.price}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {service.branch?.title ?? "N/A"}{" "}
                    {/* Use optional chaining */}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(service)}
                      disabled={isPending}
                      className="mr-3 text-indigo-600 transition-colors hover:text-indigo-900 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(service.id)}
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
          <div className="w-full max-w-md scale-100 transform rounded-lg bg-white p-6 shadow-xl transition-all duration-300 ease-in-out">
            <h3 className="mb-4 text-lg font-semibold leading-6 text-gray-900">
              {editingService ? "Edit Service" : "Add New Service"}
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
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700"
                >
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  id="title"
                  required
                  defaultValue={editingService?.title ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-pink-500 focus:ring-pink-500 sm:text-sm"
                />
              </div>
              <div className="mb-4">
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description
                </label>
                <textarea
                  name="description"
                  id="description"
                  rows={3}
                  defaultValue={editingService?.description ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-pink-500 focus:ring-pink-500 sm:text-sm"
                ></textarea>
              </div>
              <div className="mb-4">
                <label
                  htmlFor="price"
                  className="block text-sm font-medium text-gray-700"
                >
                  Price <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="price"
                  id="price"
                  required
                  min="0"
                  step="1" // Use step="1" for integer price based on schema
                  defaultValue={editingService?.price ?? 0}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-pink-500 focus:ring-pink-500 sm:text-sm"
                />
              </div>
              <div className="mb-4">
                <label
                  htmlFor="branchId"
                  className="block text-sm font-medium text-gray-700"
                >
                  Branch <span className="text-red-500">*</span>
                </label>
                <select
                  name="branchId"
                  id="branchId"
                  required
                  defaultValue={editingService?.branchId ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 bg-white p-2 shadow-sm focus:border-pink-500 focus:ring-pink-500 sm:text-sm"
                >
                  <option value="" disabled>
                    Select a branch
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.title}
                    </option>
                  ))}
                </select>
              </div>
              {/* Modal Buttons */}
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50"
                >
                  Cancel
                </button>
                {/* Change type to "button" and add onClick */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? "Saving..."
                    : editingService
                      ? "Save Changes"
                      : "Create Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
