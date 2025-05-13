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
// Import necessary types and enums from Prisma client and your types file
import type {
  Service as PrismaService,
  Branch as PrismaBranch,
} from "@prisma/client";
import { FollowUpPolicy } from "@prisma/client";
// Assuming PayslipStatus, PayslipStatusOption, etc. are in types file if needed globally
// Assuming ServerActionResponse is in types file
import type { ServerActionResponse } from "@/lib/Types"; // Adjust path if needed

import Button from "@/components/Buttons/Button"; // Adjust path
import Modal from "@/components/Dialog/Modal"; // Adjust path
import DialogTitle from "@/components/Dialog/DialogTitle"; // Adjust path
import SelectInputGroup from "@/components/Inputs/SelectInputGroup"; // Adjust path
import { Plus, Edit3, Trash2 } from "lucide-react"; // Icons

// Extend the PrismaService type to include the relations and nullable fields fetched
type Service = PrismaService & {
  branch?: Pick<PrismaBranch, "id" | "title"> | null;
  // Assuming these fields are fetched by getAllServices and are part of the Prisma model
  recommendedFollowUpDays: number | null;
  followUpPolicy: FollowUpPolicy; // Ensure this matches the enum definition
};

// Type for branch data fetched for the select input
type Branch = Pick<PrismaBranch, "id" | "title">;

// Options structure for the Follow Up Policy select input
const followUpPolicyOptions = [
  { id: FollowUpPolicy.NONE, title: "None" },
  { id: FollowUpPolicy.ONCE, title: "Once" },
  { id: FollowUpPolicy.EVERY_TIME, title: "Every Time" },
];

export default function ManageServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // State to hold form validation errors
  // Keys are field names, values are the error message string, undefined, or null
  const [formErrors, setFormErrors] = useState<
    Record<string, string | undefined | null>
  >({});

  // State for general errors during data loading or deletion
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isSaving, startTransition] = useTransition(); // Transition for save/delete actions

  const formRef = useRef<HTMLFormElement>(null); // Ref for accessing form elements

  // State for controlled components in the form (SelectInputGroup)
  const [selectedFollowUpPolicy, setSelectedFollowUpPolicy] =
    useState<FollowUpPolicy>(FollowUpPolicy.NONE);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  // Function to load initial data (services and branches)
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null); // Clear load error before fetching
    try {
      const [fetchedServicesData, fetchedBranchesData] = await Promise.all([
        getAllServices(), // Assuming this returns Promise<Service[]>
        getBranchesForSelectAction(), // Assuming this returns Promise<Branch[]>
      ]);

      // Update state with fetched data
      setServices(fetchedServicesData);
      setBranches(fetchedBranchesData);
    } catch (err: any) {
      console.error("ManageServices: Failed to load service/branch data:", err);
      // Set load error state
      setLoadError(err.message || "Failed to load data. Please refresh.");
      setServices([]); // Clear services on error
      setBranches([]); // Clear branches on error
    } finally {
      setIsLoading(false); // Set loading state to false regardless of success/failure
    }
  }, []); // No dependencies means this function is created once

  // Effect to load data on component mount
  useEffect(() => {
    loadData();
  }, [loadData]); // Depend on loadData function

  // Effect to handle modal state changes (open/close, pre-fill form)
  useEffect(() => {
    // Clear form errors whenever the modal open state changes
    setFormErrors({});

    if (isModalOpen) {
      // Modal is opening (either add or edit)
      if (formRef.current) {
        formRef.current.reset(); // Reset form fields

        if (editingService) {
          // Editing existing service: pre-fill form fields
          console.log(
            "ManageServices: Pre-filling form for editing service:",
            editingService.id,
          );

          // Pre-fill standard input values
          (
            formRef.current.elements.namedItem("title") as HTMLInputElement
          ).value = editingService.title;
          (
            formRef.current.elements.namedItem(
              "description",
            ) as HTMLTextAreaElement
          ).value = editingService.description ?? "";
          (
            formRef.current.elements.namedItem("price") as HTMLInputElement
          ).value = editingService.price.toString();

          // Set states for controlled components (Branch and Policy)
          setSelectedBranchId(editingService.branchId || ""); // Set selected branch state
          setSelectedFollowUpPolicy(editingService.followUpPolicy); // Set the policy state

          // Set the recommended days input value (conditional field)
          const recommendedDaysInput = formRef.current.elements.namedItem(
            "recommendedFollowUpDays",
          ) as HTMLInputElement;
          if (recommendedDaysInput) {
            if (editingService.recommendedFollowUpDays != null) {
              recommendedDaysInput.value =
                editingService.recommendedFollowUpDays.toString();
            } else {
              recommendedDaysInput.value = ""; // Clear input if days is null
            }
          }
        } else {
          // Adding new service: reset states to defaults
          console.log("ManageServices: Resetting form for adding new service.");
          setSelectedBranchId(""); // Reset selected branch state
          setSelectedFollowUpPolicy(FollowUpPolicy.NONE); // Default policy
          // recommendedFollowUpDays input will be empty from reset()
        }
      }
    } else {
      // Modal is closing
      console.log("ManageServices: Modal is closing.");
      setEditingService(null); // Clear editing service state
      // Reset controlled component states to default on close if desired, although useEffect on open handles the defaults for new.
      // setSelectedBranchId("");
      // setSelectedFollowUpPolicy(FollowUpPolicy.NONE);
    }
  }, [isModalOpen, editingService]); // Depend on modal open state and service being edited

  // Handler for clicking "Add New Service" button
  const handleAdd = () => {
    console.log("ManageServices: Add button clicked.");
    setEditingService(null); // Ensure no service is being edited
    setIsModalOpen(true); // Open the modal
  };

  // Handler for clicking "Edit" button on a service row
  const handleEdit = (service: Service) => {
    console.log("ManageServices: Edit button clicked for service:", service.id);
    setEditingService(service); // Set the service to be edited
    setIsModalOpen(true); // Open the modal
  };

  // Handler for clicking "Delete" button on a service row
  const handleDelete = (serviceId: string) => {
    console.log(
      "ManageServices: Delete button clicked for service:",
      serviceId,
    );
    // Show confirmation dialog
    if (
      !window.confirm(
        "Are you sure you want to delete this service permanently? This cannot be undone.",
      )
    ) {
      console.log("ManageServices: Delete cancelled by user.");
      return;
    }

    setLoadError(null); // Clear general load error before deletion attempt

    // Start a transition for the delete action
    startTransition(async () => {
      console.log(
        "ManageServices: Starting delete transition for service:",
        serviceId,
      );
      try {
        // Call the server action to delete the service
        // Assuming deleteServiceAction returns ServerActionResponse<{ id: string }>
        const result: ServerActionResponse<{ id: string }> =
          await deleteServiceAction(serviceId);

        if (!result.success) {
          console.error(
            "ManageServices: Delete service failed:",
            result.message,
          );
          // Set loadError for display outside the modal
          setLoadError(result.message || "Failed to delete service.");
        } else {
          console.log("ManageServices: Service deleted successfully.");
          // Reload data after successful deletion
          await loadData();
        }
      } catch (err: any) {
        // Catch unexpected errors during the action execution
        console.error("ManageServices: Error during delete action:", err);
        // Set loadError for display outside the modal
        setLoadError(
          err.message || "An unexpected error occurred during deletion.",
        );
      }
    });
  };

  // Handler for clicking the "Save Changes" or "Create Service" button in the modal
  const handleSave = () => {
    console.log("ManageServices: Save button clicked.");
    if (!formRef.current) {
      console.error("ManageServices: Form reference is null.");
      setFormErrors({ general: "Form reference error." });
      return;
    }

    // Clear all form errors at the start of validation/save attempt
    setFormErrors({});

    // --- Get and Validate Form Data ---
    const form = formRef.current;

    const title = (
      form.elements.namedItem("title") as HTMLInputElement
    )?.value?.trim();
    const description =
      (
        form.elements.namedItem("description") as HTMLTextAreaElement
      )?.value?.trim() || null; // Use null for empty description
    const priceInput = form.elements.namedItem("price") as HTMLInputElement;
    const price = priceInput ? priceInput.value : null;

    // Get branchId from the state (controlled component)
    const branchId = selectedBranchId;

    const recommendedDaysInput = form.elements.namedItem(
      "recommendedFollowUpDays",
    ) as HTMLInputElement;
    const recommendedDays = recommendedDaysInput
      ? recommendedDaysInput.value
      : null;

    // Get policy from state (controlled component)
    const followUpPolicy = selectedFollowUpPolicy;

    // Accumulate client-side validation errors in a local object
    let errors: Record<string, string | undefined | null> = {};

    if (!title) {
      errors.title = "Service Title is required.";
    }

    // Validate branchId from state
    if (!branchId) {
      errors.branchId = "Branch is required.";
    }

    const priceValue = Number(price);
    // Basic price validation: must be a non-negative integer
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
    // Check if the selected policy requires recommended days
    if (followUpPolicy !== FollowUpPolicy.NONE) {
      const parsedDays = Number(recommendedDays);
      // Validate that days is a positive integer if required by policy
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
        recommendedDaysValue = parsedDays; // Set the validated number value
      }
    }

    // If there are any client-side validation errors, set state and stop the process
    if (Object.keys(errors).length > 0) {
      console.warn("ManageServices: Client-side validation failed.", errors);
      setFormErrors(errors); // Set the errors state
      return;
    }

    // --- Prepare FormData for Server Action ---
    const dataToSubmit = new FormData();

    // Set validated title, description, price, branchId
    dataToSubmit.set("title", title!);
    dataToSubmit.set("description", description || ""); // Ensure description is "" if null
    dataToSubmit.set("price", priceValue.toString());
    dataToSubmit.set("branchId", branchId);

    // Set follow up related fields
    const recommendFollowUpBoolean = followUpPolicy !== FollowUpPolicy.NONE;
    dataToSubmit.set("recommendFollowUp", recommendFollowUpBoolean.toString());
    dataToSubmit.set("followUpPolicy", followUpPolicy.toString());

    // Explicitly set recommendedFollowUpDays if a valid positive integer was entered
    if (recommendedDaysValue != null) {
      dataToSubmit.set(
        "recommendedFollowUpDays",
        recommendedDaysValue.toString(),
      );
    }
    // If recommendedDaysValue is null (because policy is NONE or validation failed),
    // do not add it to FormData. The server action should handle its absence or expect it based on recommendFollowUp.

    // --- Call Server Action ---
    console.log("ManageServices: Starting save transition.");
    startTransition(async () => {
      try {
        // Determine whether to call create or update action
        const action = editingService
          ? updateServiceAction(editingService.id, dataToSubmit) // Assuming updateServiceAction takes id and FormData
          : createServiceAction(dataToSubmit); // Assuming createServiceAction takes FormData

        // Define the expected return type shape for server actions
        type ServiceSaveResponse = ServerActionResponse<Service>; // Assuming data property holds the Service on success

        const result: ServiceSaveResponse = await action;

        if (result.success) {
          console.log("ManageServices: Service saved successfully.");
          setIsModalOpen(false); // Close modal
          await loadData(); // Reload the list of services
        } else {
          console.error(
            "ManageServices: Service save failed:",
            result.message,
            result.errors,
          );

          if (result.errors) {
            // --- FIX START: Transform server errors (Record<string, string[]>)
            // --- to client errors (Record<string, string | undefined | null>) ---

            const serverErrors = result.errors; // This is Record<string, string[]> from the server

            const clientErrors: Record<string, string | undefined | null> = {};

            // Iterate through the server errors object by field name
            for (const fieldName in serverErrors) {
              // Check if the property is directly on the object (not inherited)
              if (
                Object.prototype.hasOwnProperty.call(serverErrors, fieldName)
              ) {
                const errorMessages = serverErrors[fieldName]; // This is an array of strings (string[])

                // Join the array of error messages into a single string
                // Assign the joined string to the corresponding field in the client errors object
                if (Array.isArray(errorMessages) && errorMessages.length > 0) {
                  clientErrors[fieldName] = errorMessages.join(". "); // Join with period and space
                } else if (typeof errorMessages === "string") {
                  // Handle the less common case where the server might return a single string error directly
                  clientErrors[fieldName] = errorMessages;
                } else {
                  // If the value is null, undefined, or an empty array, map it to null or undefined in the state
                  clientErrors[fieldName] = null; // Or undefined, depending on desired state representation
                }
              }
            }

            // Set the transformed errors to the formErrors state
            setFormErrors(clientErrors);

            console.warn(
              "ManageServices: Server-side validation errors received:",
              serverErrors,
              "Transformed errors for state:",
              clientErrors,
            );
            // --- FIX END ---
          } else {
            // If the server action returned success: false but *without* an errors object,
            // display the general message it provided.
            setFormErrors({
              general: result.message || "Failed to save service.",
            });
            console.warn(
              "ManageServices: Server returned a general error message without specific fields.",
            );
          }
        }
      } catch (err: any) {
        // Catch unexpected errors during the fetch/action execution
        console.error(
          "ManageServices: An unexpected error occurred during save action:",
          err,
        );
        // Set a general error for unexpected issues
        setFormErrors({
          general: err.message || "An unexpected error occurred during save.",
        });
      }
    });
  };

  // Handler for closing the modal
  const closeModal = () => {
    console.log("ManageServices: Closing modal.");
    setIsModalOpen(false); // Set modal state to closed
    setFormErrors({}); // Clear all form errors when closing
    setEditingService(null); // Also reset editingService state when modal closes
  };

  // Memoized options for the Branch SelectInputGroup
  const branchOptions = useMemo(() => {
    // Ensure "Select branch" option is always first
    const options = [
      {
        id: "", // Value for the "Select branch" option
        title:
          branches.length === 0 && isLoading
            ? "Loading branches..."
            : "Select branch",
      },
    ];
    // Add fetched branches to the options list
    if (branches && branches.length > 0) {
      options.push(
        ...branches.map((branch) => ({
          id: branch.id,
          title: branch.title,
        })),
      );
    }
    return options;
  }, [branches, isLoading]); // Re-calculate options when branches or initial loading state changes

  // Define style constants here, inside the component function
  const thStyleBase =
    "px-2 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-2 py-2 text-sm text-customBlack/90 align-top";
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed";
  const selectStyle = `${inputStyle} bg-white`;
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const listErrorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mt-1"; // Style for individual field errors or general modal error

  return (
    <div className="p-1">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Services
        </h2>
        <Button
          onClick={handleAdd}
          disabled={isSaving || isLoading} // Disable button if loading initial data or saving
          size="sm"
          className="w-full sm:w-auto"
        >
          <Plus size={16} className="mr-1" /> Add New Service
        </Button>
      </div>

      {/* List Error Display */}
      {loadError && <p className={listErrorMsgStyle}>{loadError}</p>}

      {/* Services Table Display */}
      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading ? (
          // Loading state message
          <p className="py-10 text-center text-customBlack/70">
            Loading services...
          </p>
        ) : !loadError && services.length === 0 ? (
          // No services found message (only if not loading and no load error)
          <p className="py-10 text-center text-customBlack/60">
            No services found.
          </p>
        ) : (
          // Services Table
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
                    {service.followUpPolicy} {/* Display the enum value */}
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
                    {/* Edit Button */}
                    <button
                      onClick={() => handleEdit(service)}
                      disabled={isSaving}
                      className="mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      title="Edit Service"
                    >
                      <Edit3 size={16} />
                    </button>
                    {/* Delete Button */}
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

      {/* Add/Edit Service Modal */}
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
        {/* Display general form error at the top */}
        {formErrors.general && (
          <p className={modalErrorStyle}>{formErrors.general}</p>
        )}

        {/* Form for adding/editing service */}
        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()} // Prevent default browser submission
          className="space-y-4"
        >
          {/* Service Title Input */}
          <div>
            <label htmlFor="title" className={labelStyle}>
              Service Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              id="title"
              required
              // defaultValue is handled by useEffect on isModalOpen change
              className={`${inputStyle} ${formErrors.title ? "border-red-500" : ""}`}
              disabled={isSaving}
            />
            {/* Display specific field error */}
            {formErrors.title && (
              <p className={modalErrorStyle}>{formErrors.title}</p>
            )}
          </div>

          {/* Description Textarea */}
          <div>
            <label htmlFor="description" className={labelStyle}>
              Description
            </label>
            <textarea
              name="description"
              id="description"
              rows={3}
              // defaultValue is handled by useEffect on isModalOpen change
              className={`${inputStyle} ${formErrors.description ? "border-red-500" : ""}`}
              disabled={isSaving}
            ></textarea>
            {/* Display specific field error */}
            {formErrors.description && (
              <p className={modalErrorStyle}>{formErrors.description}</p>
            )}
          </div>

          {/* Price and Branch Inputs (Grid Layout) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Price Input */}
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
                // defaultValue is handled by useEffect on isModalOpen change
                className={`${inputStyle} ${formErrors.price ? "border-red-500" : ""}`}
                disabled={isSaving}
              />
              {/* Display specific field error */}
              {formErrors.price && (
                <p className={modalErrorStyle}>{formErrors.price}</p>
              )}
            </div>

            {/* Branch SelectInputGroup (Controlled Component) */}
            <div>
              <label htmlFor="branchId" className={labelStyle}>
                Branch <span className="text-red-500">*</span>
              </label>
              <SelectInputGroup
                name="branchId"
                id="branchId"
                label="" // Label handled by explicit <label> above
                value={selectedBranchId} // Controlled by state
                onChange={(key, value) => setSelectedBranchId(value)} // Update state on change
                options={branchOptions} // Memoized options
                valueKey="id"
                labelKey="title"
                required={true}
                isLoading={isLoading} // Use the loading state from initial data fetch
                error={formErrors.branchId} // Pass specific field error for display
                disabled={isSaving || isLoading}
                className={`${selectStyle} ${formErrors.branchId ? "border-red-500" : ""}`}
              />
              {/* Error display for branch handled by SelectInputGroup's internal error prop */}
            </div>
          </div>

          {/* Follow Up Policy SelectInputGroup (Controlled Component) */}
          <div className="w-full">
            <label htmlFor="followUpPolicy" className={labelStyle}>
              Follow-up Recommendation Policy{" "}
              <span className="text-red-500">*</span>
            </label>
            <SelectInputGroup
              name="followUpPolicy"
              id="followUpPolicy"
              label="" // Label handled by explicit <label> above
              value={selectedFollowUpPolicy} // Controlled by state
              onChange={(key, value) => {
                // Validate the selected value against the enum before setting state
                if (
                  Object.values(FollowUpPolicy).includes(
                    value as FollowUpPolicy,
                  )
                ) {
                  setSelectedFollowUpPolicy(value as FollowUpPolicy);
                } else {
                  console.warn(
                    "ManageServices: Invalid policy value selected:",
                    value,
                  );
                  // Optional: Set a form error here if an invalid value somehow gets selected
                }
              }}
              options={followUpPolicyOptions} // Defined options
              valueKey="id" // Match the 'id' property in followUpPolicyOptions
              labelKey="title" // Match the 'title' property in followUpPolicyOptions
              required={true}
              isLoading={false} // This select's options are static
              error={formErrors.followUpPolicy} // Pass specific field error
              disabled={isSaving}
              className={`${selectStyle} ${formErrors.followUpPolicy ? "border-red-500" : ""}`}
            />
            {/* Error display for policy handled by SelectInputGroup's internal error prop */}
          </div>

          {/* Recommended Follow Up Days Input (Conditional) */}
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
                // defaultValue is handled by useEffect on isModalOpen change
              />
              {/* Display specific field error */}
              {formErrors.recommendedFollowUpDays && (
                <p className={modalErrorStyle}>
                  {formErrors.recommendedFollowUpDays}
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            {/* Cancel Button */}
            <Button
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              invert
            >
              Cancel
            </Button>
            {/* Save Button */}
            <Button
              type="button" // Use type="button" to prevent default browser submission
              onClick={handleSave} // Manually trigger save handler
              disabled={isSaving} // Disable button while saving
            >
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
