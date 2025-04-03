// src/app/(app)/customize/_components/ManageServiceSets.tsx
"use client";
import React, { useState, useEffect, useTransition, useRef } from "react"; // Import useRef

import {
  createServiceSetAction,
  updateServiceSetAction,
  deleteServiceSetAction,
} from "@/lib/ServerAction";

// TODO: Replace 'any' with actual Prisma types
import type {
  ServiceSet as PrismaServiceSet,
  Service as PrismaService,
} from "@prisma/client";
// Define more specific types, including the relation
type Service = PrismaService;
type ServiceSet = PrismaServiceSet & { services?: Service[] }; // Include optional services relation

// --- API Fetch Functions --- (Keep as is)
const fetchServiceSets = async (): Promise<ServiceSet[]> => {
  console.log("Fetching /api/service-sets...");
  const response = await fetch("/api/service-sets");
  if (!response.ok)
    throw new Error(`Failed to fetch service sets: ${response.statusText}`);
  // Add explicit type casting if needed
  const data = await response.json();
  return data as ServiceSet[];
};

// Reuse the function from ManageServices or create a shared one
const fetchAvailableServices = async (): Promise<Service[]> => {
  console.log("Fetching /api/services (for sets)...");
  const response = await fetch("/api/services");
  if (!response.ok)
    throw new Error(`Failed to fetch services: ${response.statusText}`);
  // Add explicit type casting if needed
  const data = await response.json();
  return data as Service[];
};
// --- End API Fetch ---

export default function ManageServiceSets() {
  const [serviceSets, setServiceSets] = useState<ServiceSet[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<ServiceSet | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null); // Ref for the form

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setListError(null);
      try {
        const [fetchedSets, fetchedServices] = await Promise.all([
          fetchServiceSets(),
          fetchAvailableServices(),
        ]);
        setServiceSets(fetchedSets);
        setAvailableServices(fetchedServices);
      } catch (err: any) {
        console.error("Failed to load service set data:", err);
        setListError(err.message || "Failed to load data.");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAdd = () => {
    setEditingSet(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleEdit = (serviceSet: ServiceSet) => {
    setEditingSet(serviceSet);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (setId: string) => {
    if (window.confirm("Are you sure you want to delete this Service Set?")) {
      setListError(null);
      startTransition(async () => {
        const result = await deleteServiceSetAction(setId);
        if (!result.success) {
          setListError(result.message);
        } else {
          console.log("Delete successful");
          // UI updates via revalidatePath
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

    // Client-side check for selected services
    const selectedServiceIds = formData.getAll("serviceIds"); // FormData correctly handles multiple checkboxes with same name
    if (selectedServiceIds.length === 0) {
      setFormError("Please select at least one service for the set.");
      return;
    }

    startTransition(async () => {
      try {
        let result;
        if (editingSet) {
          result = await updateServiceSetAction(editingSet.id, formData);
        } else {
          result = await createServiceSetAction(formData);
        }

        if (result.success) {
          setIsModalOpen(false);
          setEditingSet(null);
          console.log("Save successful:", result.message);
          // UI updates via revalidatePath
        } else {
          let errorMsg = result.message;
          if (result.errors) {
            const fieldErrors = Object.entries(result.errors)
              .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
              .join("; ");
            errorMsg += ` (${fieldErrors})`;
          }
          setFormError(errorMsg);
        }
      } catch (err) {
        console.error("Unexpected error during save action:", err);
        setFormError("An unexpected error occurred.");
      }
    });
  };

  const isSaving = isPending;

  return (
    <div>
      {/* Title and Add Button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">
          Manage Service Sets
        </h2>
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="rounded bg-teal-500 px-4 py-2 text-white transition-colors hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-opacity-50 disabled:opacity-50"
        >
          Add New Set
        </button>
      </div>

      {/* List Error Display */}
      {listError && (
        <p className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
          {listError}
        </p>
      )}

      {/* Table Display */}
      {isLoading && !serviceSets.length ? (
        <p className="py-4 text-center text-gray-500">
          Loading service sets...
        </p>
      ) : !isLoading && serviceSets.length === 0 && !listError ? (
        <p className="py-4 text-center text-gray-500">No service sets found.</p>
      ) : (
        <div className="overflow-x-auto rounded bg-white bg-opacity-60 shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 bg-opacity-80">
              <tr>
                {/* ... table headers ... */}
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Set Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Set Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Included Services
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {serviceSets.map((set) => (
                <tr
                  key={set.id}
                  className="transition-colors hover:bg-gray-50 hover:bg-opacity-50"
                >
                  {/* ... table cells ... */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {set.title}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {set.price}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {/* Safely access nested services */}
                    {set.services && set.services.length > 0
                      ? set.services.map((s: Service) => s.title).join(", ")
                      : "None"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(set)}
                      disabled={isPending}
                      className="mr-3 text-indigo-600 transition-colors hover:text-indigo-900 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(set.id)}
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
          <div className="max-h-[90vh] w-full max-w-xl scale-100 transform overflow-y-auto rounded-lg bg-white p-6 shadow-xl transition-all duration-300 ease-in-out">
            <h3 className="mb-4 text-lg font-semibold leading-6 text-gray-900">
              {editingSet ? "Edit Service Set" : "Add New Service Set"}
            </h3>
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
                  Set Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  id="title"
                  required
                  defaultValue={editingSet?.title ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                />
              </div>
              <div className="mb-4">
                <label
                  htmlFor="price"
                  className="block text-sm font-medium text-gray-700"
                >
                  Set Price <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="price"
                  id="price"
                  required
                  min="0"
                  step="1"
                  defaultValue={editingSet?.price ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Include Services <span className="text-red-500">*</span>
                </label>
                <div className="mt-2 max-h-60 space-y-2 overflow-y-auto rounded border border-gray-300 p-2">
                  {availableServices.length === 0 && (
                    <p className="text-xs text-gray-500">
                      No services available to select.
                    </p>
                  )}
                  {availableServices.map((service: Service) => (
                    <div key={service.id} className="flex items-center">
                      <input
                        id={`service-${service.id}`}
                        name="serviceIds" // Correct name for collecting multiple values
                        type="checkbox"
                        value={service.id}
                        defaultChecked={editingSet?.services?.some(
                          // Check if service is in the editing set
                          (s: Service) => s.id === service.id,
                        )}
                        className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <label
                        htmlFor={`service-${service.id}`}
                        className="ml-2 block text-sm text-gray-900"
                      >
                        {service.title}{" "}
                        <span className="text-xs text-gray-500">
                          ({service.price})
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Select one or more services to include in this set.
                </p>
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
                  className="rounded bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? "Saving..."
                    : editingSet
                      ? "Save Changes"
                      : "Create Set"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
