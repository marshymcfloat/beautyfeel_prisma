"use client";
import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback, // Added useCallback
} from "react";
import {
  createServiceSetAction,
  updateServiceSetAction,
  deleteServiceSetAction,
} from "@/lib/ServerAction"; // Adjust path if necessary
import type {
  ServiceSet as PrismaServiceSet,
  Service as PrismaService,
} from "@prisma/client";

import Button from "@/components/Buttons/Button";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { Plus, Edit3, Trash2 } from "lucide-react"; // Import icons

type Service = Pick<PrismaService, "id" | "title" | "price">; // Only need these fields
type ServiceSet = PrismaServiceSet & { services?: Service[] };

const fetchServiceSets = async (): Promise<ServiceSet[]> => {
  const response = await fetch("/api/service-sets");
  if (!response.ok)
    throw new Error(`Failed to fetch service sets: ${response.statusText}`);
  const data = await response.json();
  return data as ServiceSet[];
};

const fetchAvailableServices = async (): Promise<Service[]> => {
  const response = await fetch("/api/services");
  if (!response.ok)
    throw new Error(`Failed to fetch services: ${response.statusText}`);
  const data = await response.json();
  return data as Service[];
};
// --- End API Fetch / Server Action ---

export default function ManageServiceSets() {
  const [serviceSets, setServiceSets] = useState<ServiceSet[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null); // Modal Error
  const [listError, setListError] = useState<string | null>(null); // List Error
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<ServiceSet | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Use useCallback for loadData
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      // Consider using server actions if available
      const [fetchedSets, fetchedServices] = await Promise.all([
        fetchServiceSets(),
        fetchAvailableServices(),
      ]);
      setServiceSets(fetchedSets);
      setAvailableServices(fetchedServices);
    } catch (err: any) {
      console.error("Failed to load service set data:", err);
      setListError(err.message || "Failed to load data. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array means it runs once on mount

  useEffect(() => {
    loadData();
  }, [loadData]); // Dependency array includes loadData

  const handleAdd = () => {
    setEditingSet(null);
    setFormError(null);
    setIsModalOpen(true);
    formRef.current?.reset(); // Reset form on add
  };

  const handleEdit = (serviceSet: ServiceSet) => {
    setEditingSet(serviceSet);
    setFormError(null);
    setIsModalOpen(true);
    // Form will populate via defaultValue
  };

  const handleDelete = (setId: string) => {
    // Keep async for potential await inside confirm
    if (!window.confirm("Delete this Service Set permanently?")) return;
    setListError(null); // Clear list error before action
    startTransition(async () => {
      const result = await deleteServiceSetAction(setId);
      if (!result.success) {
        setListError(result.message); // Show error in the list area
      } else {
        // Success: Reload data to reflect deletion
        await loadData();
        // Optionally show a temporary success message
      }
    });
  };

  const handleSave = () => {
    // Keep async for potential await inside
    if (!formRef.current) {
      setFormError("Form reference error.");
      return;
    }
    setFormError(null); // Clear previous modal error
    const formData = new FormData(formRef.current);

    // Client-side check
    if (!formData.get("title") || !formData.get("price")) {
      setFormError("Set Title and Set Price are required.");
      return;
    }
    if (Number(formData.get("price")) < 0) {
      setFormError("Price cannot be negative.");
      return;
    }
    const selectedServiceIds = formData.getAll("serviceIds");
    if (selectedServiceIds.length === 0) {
      setFormError("Please select at least one service.");
      return;
    }

    startTransition(async () => {
      try {
        const action = editingSet
          ? updateServiceSetAction(editingSet.id, formData)
          : createServiceSetAction(formData);
        const result = await action;

        if (result.success) {
          setIsModalOpen(false);
          setEditingSet(null);
          await loadData(); // Reload data on successful save
        } else {
          let errorMsg = result.message;
          if (result.errors) {
            const fieldErrors = Object.entries(result.errors)
              .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
              .join("; ");
            errorMsg += ` (${fieldErrors})`;
          }
          setFormError(errorMsg); // Show error inside the modal
        }
      } catch (err) {
        console.error("Unexpected error during save action:", err);
        setFormError("An unexpected error occurred during save.");
      }
    });
  };

  const closeModal = () => setIsModalOpen(false);
  const isSaving = isPending;

  const thStyleBase =
    "px-4 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-4 py-2 text-sm text-customBlack/90 align-top"; // Added align-top
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink";
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const listErrorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mb-3";
  const checkboxStyle =
    "h-4 w-4 rounded border-customGray text-customDarkPink focus:ring-customDarkPink";
  const checkboxLabelStyle = "ml-2 block text-sm text-customBlack";

  return (
    <div className="p-1">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Service Sets
        </h2>
        <Button
          onClick={handleAdd}
          disabled={isPending || isLoading}
          size="sm"
          className="w-full sm:w-auto"
        >
          <Plus size={16} className="mr-1" /> Add New Set
        </Button>
      </div>
      {listError && <p className={listErrorMsgStyle}>{listError}</p>}
      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading ? (
          <p className="py-10 text-center text-customBlack/70">
            Loading service sets...
          </p>
        ) : !listError && serviceSets.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">
            No service sets found.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                <th className={thStyleBase}>Set Title</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Set Price
                </th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Included Services
                </th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {serviceSets.map((set) => (
                <tr key={set.id} className="hover:bg-customLightBlue/10">
                  <td className={`${tdStyleBase} font-medium`}>{set.title}</td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
                  >
                    {set.price}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden max-w-xs whitespace-normal break-words sm:table-cell`}
                  >
                    {set.services && set.services.length > 0 ? (
                      set.services.map((s: Service) => s.title).join(", ")
                    ) : (
                      <span className="italic text-gray-400">None</span>
                    )}
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <button
                      onClick={() => handleEdit(set)}
                      disabled={isPending}
                      className="mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      title="Edit Set"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(set.id)}
                      disabled={isPending}
                      className="inline-block p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Delete Set"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <DialogTitle>
            {editingSet ? "Edit Service Set" : "Add New Service Set"}
          </DialogTitle>
        }
        containerClassName="relative m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl"
      >
        {formError && <p className={modalErrorStyle}>{formError}</p>}

        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4"
        >
          <div>
            <label htmlFor="title" className={labelStyle}>
              Set Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              id="title"
              required
              defaultValue={editingSet?.title ?? ""}
              className={inputStyle}
              disabled={isSaving}
            />
          </div>
          <div>
            <label htmlFor="price" className={labelStyle}>
              Set Price (in cents) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="price"
              id="price"
              required
              min="0"
              step="1"
              defaultValue={editingSet?.price ?? ""}
              className={inputStyle}
              disabled={isSaving}
            />
          </div>
          <div>
            <label className={labelStyle}>
              Include Services <span className="text-red-500">*</span>
            </label>
            <div className="mt-2 max-h-60 space-y-2 overflow-y-auto rounded border border-customGray bg-white p-3">
              {isLoading ? (
                <p className="text-xs text-gray-500">Loading services...</p>
              ) : availableServices.length === 0 ? (
                <p className="text-xs text-gray-500">No services available.</p>
              ) : (
                availableServices.map((service: Service) => (
                  <div key={service.id} className="flex items-center">
                    <input
                      id={`service-${service.id}`}
                      name="serviceIds"
                      type="checkbox"
                      value={service.id}
                      // Check if service is in the editing set's services array
                      defaultChecked={editingSet?.services?.some(
                        (s: Service) => s.id === service.id,
                      )}
                      className={checkboxStyle}
                      disabled={isSaving}
                    />
                    <label
                      htmlFor={`service-${service.id}`}
                      className={checkboxLabelStyle}
                    >
                      {service.title}
                      <span className="text-xs text-gray-500">
                        ({service.price})
                      </span>
                    </label>
                  </div>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Select one or more services.
            </p>
          </div>

          <div className="flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            <Button
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              invert
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
            >
              {isSaving
                ? "Saving..."
                : editingSet
                  ? "Save Changes"
                  : "Create Set"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
