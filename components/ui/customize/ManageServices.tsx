// src/components/ui/customize/ManageServices.tsx
"use client";
import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
} from "react";
import {
  createServiceAction,
  updateServiceAction,
  deleteServiceAction,
  getAllServices,
  getBranchesForSelectAction,
} from "@/lib/ServerAction"; // Adjust paths
import type {
  Service as PrismaService,
  Branch as PrismaBranch,
} from "@prisma/client";
import Button from "@/components/Buttons/Button"; // Adjust path
import Modal from "@/components/Dialog/Modal"; // Import the reusable Modal
import DialogTitle from "@/components/Dialog/DialogTitle"; // Import DialogTitle
import { Plus, Edit3, Trash2 } from "lucide-react";

type Service = PrismaService & {
  branch?: Pick<PrismaBranch, "id" | "title"> | null;
};
type Branch = Pick<PrismaBranch, "id" | "title">;

export default function ManageServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const [fetchedServicesData, fetchedBranchesData] = await Promise.all([
        getAllServices(),
        getBranchesForSelectAction(),
      ]);
      setServices(fetchedServicesData as Service[]);
      setBranches(fetchedBranchesData);
    } catch (err: any) {
      console.error("Failed to load service/branch data:", err);
      setListError(err.message || "Failed to load data. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = () => {
    setEditingService(null);
    setFormError(null);
    setIsModalOpen(true);
    formRef.current?.reset();
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDelete = (serviceId: string) => {
    if (!window.confirm("Delete this service permanently?")) return;
    setListError(null);
    startTransition(async () => {
      const result = await deleteServiceAction(serviceId);
      if (!result.success) {
        setListError(result.message);
      } else {
        await loadData();
      }
    });
  };

  const handleSave = () => {
    if (!formRef.current) {
      setFormError("Form reference error.");
      return;
    }
    setFormError(null);
    const formData = new FormData(formRef.current);

    if (
      !formData.get("title") ||
      !formData.get("price") ||
      !formData.get("branchId")
    ) {
      setFormError("Title, Price, and Branch are required.");
      return;
    }
    const priceValue = formData.get("price");
    if (priceValue === null || Number(priceValue) < 0) {
      setFormError("Price must be a non-negative number.");
      return;
    }

    startTransition(async () => {
      try {
        const action = editingService
          ? updateServiceAction(editingService.id, formData)
          : createServiceAction(formData);
        const result = await action;

        if (result.success) {
          setIsModalOpen(false);
          setEditingService(null);
          await loadData();
        } else {
          let errorMsg = result.message;
          if (result.errors) {
            errorMsg += ` (${Object.values(result.errors).join(", ")})`;
          }
          setFormError(errorMsg);
        }
      } catch (err) {
        console.error("Error during save action:", err);
        setFormError("An unexpected error occurred during save.");
      }
    });
  };

  const closeModal = () => setIsModalOpen(false);
  const isSaving = isPending;

  // --- Style constants ---
  // Base styles, responsiveness handled by utility classes below
  const thStyleBase =
    "px-4 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-4 py-2 text-sm text-customBlack/90 align-top"; // Use align-top for consistency if rows wrap slightly
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed";
  const selectStyle = `${inputStyle} bg-white`;
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const listErrorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mb-3";

  return (
    <div className="p-1">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Services
        </h2>
        <Button
          onClick={handleAdd}
          disabled={isPending || isLoading}
          size="sm"
          className="w-full sm:w-auto"
        >
          <Plus size={16} className="mr-1" /> Add New Service
        </Button>
      </div>

      {/* List Error */}
      {listError && <p className={listErrorMsgStyle}>{listError}</p>}

      {/* Table Display */}
      {/* Add min-w-full even within overflow-x-auto for better consistency */}
      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading ? (
          <p className="py-10 text-center text-customBlack/70">
            Loading services...
          </p>
        ) : !listError && services.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">
            No services found.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                {/* Title: Always Visible */}
                <th className={`${thStyleBase}`}>Title</th>

                {/* Description: Hidden on xs, visible sm and up */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Description
                </th>

                {/* Price: Always Visible */}
                <th className={`${thStyleBase}`}>Price (cents)</th>

                {/* Branch: Hidden on xs, visible sm and up */}
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Branch
                </th>

                {/* Actions: Always Visible */}
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {services.map((service) => (
                <tr key={service.id} className="hover:bg-customLightBlue/10">
                  {/* Title: Allow wrap, medium weight */}
                  <td className={`${tdStyleBase} font-medium`}>
                    {service.title}
                  </td>

                  {/* Description: Hidden on xs, allow wrap on sm+ */}
                  <td
                    className={`${tdStyleBase} hidden whitespace-normal break-words sm:table-cell`}
                  >
                    {service.description || (
                      <span className="italic text-gray-400">None</span>
                    )}
                  </td>

                  {/* Price: No wrap */}
                  <td className={`${tdStyleBase} whitespace-nowrap`}>
                    {service.price}
                  </td>

                  {/* Branch: Hidden on xs, no wrap on sm+ */}
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
                  >
                    {service.branch?.title ?? (
                      <span className="italic text-gray-400">N/A</span>
                    )}
                  </td>

                  {/* Actions: No wrap, right-aligned */}
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <button
                      onClick={() => handleEdit(service)}
                      disabled={isPending}
                      className="mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      title="Edit Service"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(service.id)}
                      disabled={isPending}
                      className="inline-block p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Delete Service"
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

      {/* Add/Edit Modal (No changes needed here for table responsiveness) */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <DialogTitle>
            {editingService ? "Edit Service" : "Add New Service"}
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
          {/* Form Fields... (keep existing) */}
          <div>
            <label htmlFor="title" className={labelStyle}>
              Service Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              id="title"
              required
              defaultValue={editingService?.title ?? ""}
              className={inputStyle}
              disabled={isSaving}
            />
          </div>
          <div>
            <label htmlFor="description" className={labelStyle}>
              Description
            </label>
            <textarea
              name="description"
              id="description"
              rows={3}
              defaultValue={editingService?.description ?? ""}
              className={inputStyle}
              disabled={isSaving}
            ></textarea>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="price" className={labelStyle}>
                Price (in cents) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price"
                id="price"
                required
                min="0"
                step="1"
                defaultValue={editingService?.price ?? 0}
                className={inputStyle}
                disabled={isSaving}
              />
            </div>
            <div>
              <label htmlFor="branchId" className={labelStyle}>
                Branch <span className="text-red-500">*</span>
              </label>
              <select
                name="branchId"
                id="branchId"
                required
                defaultValue={editingService?.branchId ?? ""}
                className={selectStyle}
                disabled={isSaving || branches.length === 0}
              >
                <option value="" disabled>
                  {branches.length === 0 ? "Loading..." : "Select branch"}
                </option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            <Button
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              invert
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : editingService
                  ? "Save Changes"
                  : "Create Service"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
