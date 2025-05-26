// src/components/ui/customize/ManageServices.tsx
"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  createServiceAction,
  updateServiceAction,
  deleteServiceAction,
  getAllServices,
  getBranchesForSelectAction,
} from "@/lib/ServerAction"; // Adjust paths as needed
import type {
  Service as PrismaService,
  Branch as PrismaBranch,
} from "@prisma/client";
import { FollowUpPolicy } from "@prisma/client";
import type { ServerActionResponse } from "@/lib/Types"; // Adjust path if needed
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache"; // Adjust path

import Button from "@/components/Buttons/Button"; // Adjust path
import Modal from "@/components/Dialog/Modal"; // Adjust path
import DialogTitle from "@/components/Dialog/DialogTitle"; // Adjust path
import SelectInputGroup from "@/components/Inputs/SelectInputGroup"; // Adjust path
import { Plus, Edit3, Trash2, RefreshCw } from "lucide-react"; // Icons

// Extend the PrismaService type to include the relations and nullable fields fetched
type Service = PrismaService & {
  branch?: Pick<PrismaBranch, "id" | "title"> | null;
  recommendedFollowUpDays: number | null;
  followUpPolicy: FollowUpPolicy;
};

type Branch = Pick<PrismaBranch, "id" | "title">;

const followUpPolicyOptions = [
  { id: FollowUpPolicy.NONE, title: "None" },
  { id: FollowUpPolicy.ONCE, title: "Once" },
  { id: FollowUpPolicy.EVERY_TIME, title: "Every Time" },
];

const SERVICES_CACHE_KEY: CacheKey = "services_ManageServices";
const BRANCHES_CACHE_KEY: CacheKey = "branches_ManageServices";

export default function ManageServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formErrors, setFormErrors] = useState<
    Record<string, string | undefined | null>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isSaving, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedFollowUpPolicy, setSelectedFollowUpPolicy] =
    useState<FollowUpPolicy>(FollowUpPolicy.NONE);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const loadData = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setLoadError(null);

    let servicesData = !forceRefresh
      ? getCachedData<Service[]>(SERVICES_CACHE_KEY)
      : null;
    let branchesData = !forceRefresh
      ? getCachedData<Branch[]>(BRANCHES_CACHE_KEY)
      : null;

    if (servicesData && branchesData && !forceRefresh) {
      setServices(servicesData);
      setBranches(branchesData);
      setIsLoading(false);
      return;
    }

    try {
      const promises: [Promise<Service[]>, Promise<Branch[]>] = [
        // Fetch services if not cached or forceRefresh
        servicesData && !forceRefresh
          ? Promise.resolve(servicesData)
          : getAllServices().then((data) => {
              setCachedData<Service[]>(SERVICES_CACHE_KEY, data);
              return data;
            }),
        // Fetch branches if not cached or forceRefresh
        branchesData && !forceRefresh
          ? Promise.resolve(branchesData)
          : getBranchesForSelectAction().then((data) => {
              setCachedData<Branch[]>(BRANCHES_CACHE_KEY, data);
              return data;
            }),
      ];

      const [fetchedServices, fetchedBranches] = await Promise.all(promises);

      setServices(fetchedServices);
      setBranches(fetchedBranches);
    } catch (err: any) {
      console.error("ManageServices: Failed to load data:", err);
      setLoadError(err.message || "Failed to load data. Please try again.");
      setServices(servicesData || []); // Fallback to cached or empty
      setBranches(branchesData || []); // Fallback to cached or empty
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    loadData(true); // Force refresh, will bypass cache read but update cache
  }, [loadData]);

  useEffect(() => {
    setFormErrors({});
    if (isModalOpen) {
      formRef.current?.reset();
      if (editingService) {
        (
          formRef.current!.elements.namedItem("title") as HTMLInputElement
        ).value = editingService.title;
        (
          formRef.current!.elements.namedItem(
            "description",
          ) as HTMLTextAreaElement
        ).value = editingService.description ?? "";
        (
          formRef.current!.elements.namedItem("price") as HTMLInputElement
        ).value = editingService.price.toString();
        setSelectedBranchId(editingService.branchId || "");
        setSelectedFollowUpPolicy(editingService.followUpPolicy);
        const recommendedDaysInput = formRef.current!.elements.namedItem(
          "recommendedFollowUpDays",
        ) as HTMLInputElement;
        if (recommendedDaysInput) {
          recommendedDaysInput.value =
            editingService.recommendedFollowUpDays?.toString() ?? "";
        }
      } else {
        setSelectedBranchId("");
        setSelectedFollowUpPolicy(FollowUpPolicy.NONE);
      }
    } else {
      setEditingService(null);
    }
  }, [isModalOpen, editingService]);

  const handleAdd = () => {
    setEditingService(null);
    setIsModalOpen(true);
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setIsModalOpen(true);
  };

  const handleDelete = (serviceId: string) => {
    if (!window.confirm("Are you sure you want to delete this service?"))
      return;
    setLoadError(null);
    startTransition(async () => {
      try {
        const result = await deleteServiceAction(serviceId);
        if (!result.success) {
          setLoadError(result.message || "Failed to delete service.");
        } else {
          invalidateCache(SERVICES_CACHE_KEY); // Invalidate cache
          await loadData(); // Reload data
        }
      } catch (err: any) {
        setLoadError(err.message || "Error during deletion.");
      }
    });
  };

  const handleSave = () => {
    if (!formRef.current) {
      setFormErrors({ general: "Form reference error." });
      return;
    }
    setFormErrors({});
    const form = formRef.current;
    const title = (
      form.elements.namedItem("title") as HTMLInputElement
    )?.value?.trim();
    const description =
      (
        form.elements.namedItem("description") as HTMLTextAreaElement
      )?.value?.trim() || null;
    const price = (form.elements.namedItem("price") as HTMLInputElement)?.value;
    const branchId = selectedBranchId;
    const recommendedDays = (
      form.elements.namedItem("recommendedFollowUpDays") as HTMLInputElement
    )?.value;
    const followUpPolicy = selectedFollowUpPolicy;

    let errors: Record<string, string | undefined | null> = {};
    if (!title) errors.title = "Service Title is required.";
    if (!branchId) errors.branchId = "Branch is required.";
    const priceValue = Number(price);
    if (
      price === null ||
      price === "" ||
      isNaN(priceValue) ||
      priceValue < 0 ||
      !Number.isInteger(priceValue)
    ) {
      errors.price = "Price must be a non-negative integer.";
    }
    let recommendedDaysValue: number | null = null;
    if (followUpPolicy !== FollowUpPolicy.NONE) {
      const parsedDays = Number(recommendedDays);
      if (
        recommendedDays === null ||
        recommendedDays === "" ||
        isNaN(parsedDays) ||
        !Number.isInteger(parsedDays) ||
        parsedDays <= 0
      ) {
        errors.recommendedFollowUpDays =
          "Recommended days must be a positive integer if follow-up is recommended.";
      } else {
        recommendedDaysValue = parsedDays;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const dataToSubmit = new FormData();
    dataToSubmit.set("title", title!);
    dataToSubmit.set("description", description || "");
    dataToSubmit.set("price", priceValue.toString());
    dataToSubmit.set("branchId", branchId);
    dataToSubmit.set(
      "recommendFollowUp",
      (followUpPolicy !== FollowUpPolicy.NONE).toString(),
    );
    dataToSubmit.set("followUpPolicy", followUpPolicy.toString());
    if (recommendedDaysValue != null) {
      dataToSubmit.set(
        "recommendedFollowUpDays",
        recommendedDaysValue.toString(),
      );
    }

    startTransition(async () => {
      try {
        const action = editingService
          ? updateServiceAction(editingService.id, dataToSubmit)
          : createServiceAction(dataToSubmit);
        const result: ServerActionResponse<Service> = await action;

        if (result.success) {
          setIsModalOpen(false);
          invalidateCache(SERVICES_CACHE_KEY); // Invalidate cache
          await loadData(); // Reload data
        } else {
          if (result.errors) {
            const clientErrors: Record<string, string | undefined | null> = {};
            for (const fieldName in result.errors) {
              if (
                Object.prototype.hasOwnProperty.call(result.errors, fieldName)
              ) {
                const errorMessages = result.errors[fieldName];
                if (Array.isArray(errorMessages) && errorMessages.length > 0) {
                  clientErrors[fieldName] = errorMessages.join(". ");
                } else if (typeof errorMessages === "string") {
                  clientErrors[fieldName] = errorMessages;
                }
              }
            }
            setFormErrors(clientErrors);
          } else {
            setFormErrors({
              general: result.message || "Failed to save service.",
            });
          }
        }
      } catch (err: any) {
        setFormErrors({
          general: err.message || "Unexpected error during save.",
        });
      }
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const branchOptions = useMemo(() => {
    const options = [
      {
        id: "",
        title:
          branches.length === 0 && isLoading
            ? "Loading branches..."
            : "Select branch",
      },
    ];
    if (branches && branches.length > 0) {
      options.push(
        ...branches.map((branch) => ({ id: branch.id, title: branch.title })),
      );
    }
    return options;
  }, [branches, isLoading]);

  const thStyleBase =
    "px-2 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-2 py-2 text-sm text-customBlack/90 align-top";
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed";
  const selectStyle = `${inputStyle} bg-white`;
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const listErrorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mt-1";

  return (
    <div className="p-1">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Services
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isSaving}
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
          >
            <RefreshCw
              size={16}
              className={`mr-1 ${isLoading ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isLoading || isSaving}
            size="sm"
            className="w-full sm:w-auto"
          >
            <Plus size={16} className="mr-1" /> Add New Service
          </Button>
        </div>
      </div>

      {loadError && <p className={listErrorMsgStyle}>{loadError}</p>}

      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading && services.length === 0 ? ( // Show loading only if there's no stale data to display
          <p className="py-10 text-center text-customBlack/70">
            Loading services...
          </p>
        ) : !loadError && services.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">
            No services found.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead>
              <tr>
                <th className={thStyleBase}>Title</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Description
                </th>
                <th className={thStyleBase}>Price (cents)</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Branch
                </th>
                <th className={`${thStyleBase} hidden md:table-cell`}>
                  Follow Up Policy
                </th>
                <th className={`${thStyleBase} hidden md:table-cell`}>
                  Rec. Days
                </th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {services.map((service) => (
                <tr key={service.id} className="hover:bg-customLightBlue/10">
                  <td className={`${tdStyleBase} font-medium`}>
                    {service.title}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-normal break-words sm:table-cell`}
                  >
                    {service.description || (
                      <span className="italic text-gray-400">None</span>
                    )}
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap`}>
                    {service.price}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
                  >
                    {service.branch?.title ?? (
                      <span className="italic text-gray-400">N/A</span>
                    )}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap md:table-cell`}
                  >
                    {service.followUpPolicy}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap md:table-cell`}
                  >
                    {service.recommendedFollowUpDays != null ? (
                      service.recommendedFollowUpDays
                    ) : (
                      <span className="italic text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <button
                      onClick={() => handleEdit(service)}
                      disabled={isSaving}
                      className="mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      title="Edit Service"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(service.id)}
                      disabled={isSaving}
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

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <DialogTitle>
            {editingService ? "Edit Service" : "Add New Service"}
          </DialogTitle>
        }
        containerClassName="relative m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl flex flex-col"
      >
        {formErrors.general && (
          <p className={modalErrorStyle}>{formErrors.general}</p>
        )}
        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4"
        >
          <div>
            <label htmlFor="title" className={labelStyle}>
              Service Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              id="title"
              required
              className={`${inputStyle} ${formErrors.title ? "border-red-500" : ""}`}
              disabled={isSaving}
            />
            {formErrors.title && (
              <p className={modalErrorStyle}>{formErrors.title}</p>
            )}
          </div>
          <div>
            <label htmlFor="description" className={labelStyle}>
              Description
            </label>
            <textarea
              name="description"
              id="description"
              rows={3}
              className={`${inputStyle} ${formErrors.description ? "border-red-500" : ""}`}
              disabled={isSaving}
            ></textarea>
            {formErrors.description && (
              <p className={modalErrorStyle}>{formErrors.description}</p>
            )}
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
                className={`${inputStyle} ${formErrors.price ? "border-red-500" : ""}`}
                disabled={isSaving}
              />
              {formErrors.price && (
                <p className={modalErrorStyle}>{formErrors.price}</p>
              )}
            </div>
            <div>
              <label htmlFor="branchId" className={labelStyle}>
                Branch <span className="text-red-500">*</span>
              </label>
              <SelectInputGroup
                name="branchId"
                id="branchId"
                label=""
                value={selectedBranchId}
                onChange={(key, value) => setSelectedBranchId(value)}
                options={branchOptions}
                valueKey="id"
                labelKey="title"
                required={true}
                isLoading={isLoading && branches.length === 0} // Show loading for select if branches are specifically loading
                error={formErrors.branchId}
                disabled={isSaving || (isLoading && branches.length === 0)}
                className={`${selectStyle} ${formErrors.branchId ? "border-red-500" : ""}`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="followUpPolicy" className={labelStyle}>
              Follow-up Recommendation Policy{" "}
              <span className="text-red-500">*</span>
            </label>
            <SelectInputGroup
              name="followUpPolicy"
              id="followUpPolicy"
              label=""
              value={selectedFollowUpPolicy}
              onChange={(key, value) => {
                if (
                  Object.values(FollowUpPolicy).includes(
                    value as FollowUpPolicy,
                  )
                ) {
                  setSelectedFollowUpPolicy(value as FollowUpPolicy);
                }
              }}
              options={followUpPolicyOptions}
              valueKey="id"
              labelKey="title"
              required={true}
              isLoading={false}
              error={formErrors.followUpPolicy}
              disabled={isSaving}
              className={`${selectStyle} ${formErrors.followUpPolicy ? "border-red-500" : ""}`}
            />
          </div>
          {selectedFollowUpPolicy !== FollowUpPolicy.NONE && (
            <div>
              <label htmlFor="recommendedFollowUpDays" className={labelStyle}>
                Recommended days for follow-up{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="recommendedFollowUpDays"
                id="recommendedFollowUpDays"
                min="1"
                step="1"
                className={`${inputStyle} ${formErrors.recommendedFollowUpDays ? "border-red-500" : ""}`}
                disabled={isSaving}
              />
              {formErrors.recommendedFollowUpDays && (
                <p className={modalErrorStyle}>
                  {formErrors.recommendedFollowUpDays}
                </p>
              )}
            </div>
          )}
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
