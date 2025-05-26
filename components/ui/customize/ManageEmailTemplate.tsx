// src/components/ui/customize/ManageEmailTemplates.tsx

"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useTransition,
  useRef,
} from "react";
import {
  getEmailTemplatesAction,
  createEmailTemplateAction,
  updateEmailTemplateAction,
  deleteEmailTemplateAction,
} from "@/lib/ServerAction"; // Adjust path as necessary
import { CacheKey, invalidateCache } from "@/lib/cache"; // Adjust path
import Button from "@/components/Buttons/Button"; // Adjust path
import {
  PlusCircle,
  Edit3,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { EmailTemplate as EmailTemplateType } from "@prisma/client"; // Import Prisma type

// Import Modal components
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";

// Adjusted styles to match ManageAccounts.tsx
const inputStyle = (hasError?: boolean) =>
  `mt-1 block w-full rounded border ${hasError ? "border-red-500" : "border-customGray"} p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed`;
const labelStyle = "block text-sm font-medium text-customBlack/80"; // Adjusted color
const errorMsgStyle =
  "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
const successMsgStyle =
  "mb-4 rounded border border-green-400 bg-green-100 p-3 text-sm text-green-700";
const fieldErrorStyle = "mt-1 text-xs text-red-600";
const modalErrorStyle =
  "text-sm text-red-600 mb-3 p-3 bg-red-100 border border-red-300 rounded";
// const sectionTitleStyle = "text-md font-semibold text-customBlack mb-3 border-b border-customGray/30 pb-2"; // Not used in modal

const TEMPLATES_CACHE_KEY: CacheKey = "emailTemplates_ManageEmailTemplates";

// Removed initialFormState as isActive is handled by its own state

// Define the default placeholder string separately
const defaultPlaceholdersString = "{{customerName}}, {{customerEmail}}";

export default function ManageEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplateType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null); // Changed name from 'error' to 'formError' for consistency
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // For list-level success messages
  const [listError, setListError] = useState<string | null>(null); // For list-level errors

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingTemplate, setEditingTemplate] =
    useState<EmailTemplateType | null>(null); // State for the template being edited
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({}); // Changed name from 'formErrors' to 'fieldErrors' for consistency
  const [isPending, startTransition] = useTransition();

  // State for the active checkbox, managed separately from FormData
  const [isTemplateActive, setIsTemplateActive] = useState(true);

  // Ref for the form
  const formRef = useRef<HTMLFormElement>(null);

  const resetFormState = useCallback(() => {
    setFieldErrors({}); // Using fieldErrors now
    setFormError(null); // Clear modal error
  }, []);

  const loadTemplates = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setListError(null); // Clear list error on load
    if (forceRefresh) {
      invalidateCache(TEMPLATES_CACHE_KEY);
    }
    try {
      const fetchedTemplates = await getEmailTemplatesAction();
      setTemplates(fetchedTemplates);
    } catch (err: any) {
      setListError(err.message || "Failed to load email templates."); // Set list error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleRefresh = () => {
    loadTemplates(true);
  };

  const openModal = (mode: "add" | "edit", template?: EmailTemplateType) => {
    setModalMode(mode);
    resetFormState(); // Clear previous form errors and modal error

    if (mode === "edit" && template) {
      setEditingTemplate(template);
      setIsTemplateActive(template.isActive); // Set checkbox state
    } else {
      setEditingTemplate(null);
      setIsTemplateActive(true); // Reset checkbox state to default (true for new)
    }
    setIsModalOpen(true);
    // Form values will be set by defaultValue when modal opens due to the key prop on the form
  };

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // State reset happens in the useEffect hook after modal closes
  }, []);

  useEffect(() => {
    // This useEffect runs when isModalOpen changes
    if (!isModalOpen) {
      // Reset states when modal is closed
      setEditingTemplate(null);
      resetFormState();
      setIsTemplateActive(true); // Reset checkbox state when modal closes
    } else {
      // Optional: Focus the first input when modal opens
      setTimeout(() => {
        const nameInput = formRef.current?.elements.namedItem("name");
        // Check if the element exists and is an HTMLElement that can be focused
        if (nameInput instanceof HTMLElement) {
          nameInput.focus();
        }
      }, 0);
    }
    // Depend on isModalOpen and resetFormState. formRef is stable, so not a dependency unless its identity could change.
  }, [isModalOpen, resetFormState]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsTemplateActive(e.target.checked);
  };

  // Validation using FormData
  const validateForm = (formData: FormData): Record<string, string[]> => {
    const errors: Record<string, string[]> = {};
    const name = formData.get("name") as string | null; // Use null check as get can return null
    const subject = formData.get("subject") as string | null;
    const body = formData.get("body") as string | null;
    // placeholders are optional and not strictly validated for content here
    // const placeholders = formData.get("placeholders") as string;

    if (!name?.trim()) errors.name = ["Name is required."];
    if (!subject?.trim()) errors.subject = ["Subject is required."];
    if (!body?.trim()) errors.body = ["Body is required."];

    // Add more validation as needed (e.g., placeholder format if strict)

    // setFieldErrors(errors); // Moved setting state outside validateForm
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
      setFieldErrors(validationErrors); // Set field errors here after validation
      setFormError("Please fix the errors in the form."); // Set modal error
      return;
    }

    setFormError(null); // Clear modal error on successful validation
    setListError(null); // Clear any list error
    setSuccessMessage(null); // Clear any list success message

    // Extract data from FormData and current state
    const name = (formData.get("name") as string | null)?.trim();
    const subject = (formData.get("subject") as string | null)?.trim();
    const body = (formData.get("body") as string | null)?.trim();
    const placeholdersString = (
      formData.get("placeholders") as string | null
    )?.trim();

    const placeholdersArray = (placeholdersString ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const dataToSubmit = {
      name: name!, // Added non-null assertion based on validation
      subject: subject!, // Added non-null assertion based on validation
      body: body!, // Added non-null assertion based on validation
      placeholders: placeholdersArray,
      isActive: isTemplateActive, // Get from state
    };

    startTransition(async () => {
      try {
        let response;
        if (modalMode === "add") {
          // Assuming createEmailTemplateAction accepts the data object
          response = await createEmailTemplateAction(dataToSubmit);
        } else {
          if (!editingTemplate?.id)
            throw new Error("Template ID is missing for update.");
          // Assuming updateEmailTemplateAction accepts id and the data object
          response = await updateEmailTemplateAction(
            editingTemplate.id,
            dataToSubmit,
          );
        }

        if (response.success) {
          // Set success message for the list, clear modal error
          setSuccessMessage(
            response.message ||
              `Template ${modalMode === "add" ? "created" : "updated"} successfully!`,
          );
          setFormError(null); // Clear modal error on success
          invalidateCache(TEMPLATES_CACHE_KEY);
          loadTemplates(); // Refresh list
          closeModal(); // Close modal on success
        } else {
          // Set error for the modal, clear list success
          setFormError(response.message || "An error occurred.");
          setSuccessMessage(null);
          if (response.errors) setFieldErrors(response.errors);
        }
      } catch (err: any) {
        // Set error for the modal
        setFormError(err.message || "An unexpected error occurred.");
        setSuccessMessage(null);
      }
    });
  };

  const handleDelete = (templateId: string, templateName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the template "${templateName}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setListError(null); // Clear list error before delete
    setSuccessMessage(null); // Clear list success before delete
    setFormError(null); // Clear modal error if modal was open

    startTransition(async () => {
      try {
        const response = await deleteEmailTemplateAction(templateId);
        if (response.success) {
          // Set success message for the list
          setSuccessMessage(
            response.message || "Template deleted successfully!",
          );
          setListError(null);
          invalidateCache(TEMPLATES_CACHE_KEY);
          loadTemplates(); // Refresh list
        } else {
          // Set error message for the list
          setListError(response.message || "Failed to delete template.");
          setSuccessMessage(null);
        }
      } catch (err: any) {
        // Set error message for the list
        setListError(
          err.message || "An unexpected error occurred while deleting.",
        );
        setSuccessMessage(null);
      }
    });
  };

  // commonInputProps is no longer necessary with FormData approach

  // Adjusted Table styles to match ManageAccounts.tsx
  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider"; // Adjusted padding and color
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top"; // Adjusted padding, color, added align-top

  // Modal specific styles (adjusted bg color and padding, kept max-w-2xl for larger content)
  const modalContainerStyle =
    "relative m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl"; // Adjusted bg and padding

  const isSaving = isPending; // Use isSaving alias for clarity

  return (
    // Kept mx-auto max-w-6xl based on constraint
    <div className="mx-auto max-w-6xl rounded-lg bg-customOffWhite p-4 shadow-md">
      {/* Adjusted Header Layout */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {" "}
        {/* Adjusted margin and gap */}
        <h2 className="text-xl font-bold text-customBlack">
          Manage Email Templates
        </h2>
        {/* Adjusted Button Container */}
        <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row">
          {" "}
          {/* Ensured flex layout and gap */}
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isSaving} // Use isSaving
            variant="outline"
            size="sm"
            className="w-full sm:w-auto" // Responsive width
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
            disabled={isSaving} // Use isSaving
            className="w-full sm:w-auto" // Responsive width
            icon={<PlusCircle size={16} />}
          >
            Add New Template
          </Button>
        </div>
      </div>

      {/* List-level messages */}
      {listError && <p className={errorMsgStyle}>{listError}</p>}
      {successMessage && <p className={successMsgStyle}>{successMessage}</p>}

      {/* Adjusted empty state rendering */}
      {isLoading && templates.length === 0 ? ( // Added check for initial load
        <p className="py-4 text-center text-customBlack/70">
          Loading templates...
        </p>
      ) : !listError && templates.length === 0 ? ( // Added check for no list error on empty
        <div className="my-8 rounded-md border border-yellow-400 bg-yellow-50 p-4 text-center">
          <AlertTriangle className="mx-auto mb-2 h-12 w-12 text-yellow-500" />
          <h3 className="text-lg font-medium text-yellow-800">
            No Email Templates Found
          </h3>
          <p className="mt-1 text-sm text-yellow-700">
            Get started by creating your first email template.
          </p>
          <Button
            onClick={() => openModal("add")}
            size="sm"
            className="mt-4"
            disabled={isSaving} // Use isSaving
          >
            <PlusCircle size={16} className="mr-1" /> Create Template
          </Button>
        </div>
      ) : (
        <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
          <table className="min-w-full divide-y divide-customGray/20">
            <thead className="bg-customGray/5">
              <tr>
                <th className={thStyleBase}>Name</th>
                <th className={thStyleBase}>Subject</th>
                {/* Check responsiveness classes - md breakpoint matches Accounts */}
                <th className={`${thStyleBase} hidden md:table-cell`}>
                  Active
                </th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/10 bg-white">
              {templates.map((template) => (
                <tr
                  key={template.id}
                  className={`${!template.isActive ? "bg-gray-50 opacity-70" : ""} hover:bg-customLightBlue/10`}
                >
                  <td className={tdStyleBase}>{template.name}</td>
                  <td className={tdStyleBase}>{template.subject}</td>
                  {/* Check responsiveness classes */}
                  <td className={`${tdStyleBase} hidden md:table-cell`}>
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        template.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {template.isActive ? "Yes" : "No"}
                    </span>
                  </td>
                  {/* Adjusted Action Buttons to match Accounts */}
                  <td className={`${tdStyleBase} text-right`}>
                    <button
                      onClick={() => openModal("edit", template)}
                      className="mr-2 inline-block p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50" // Used indigo like Accounts
                      title="Edit Template"
                      disabled={isSaving} // Use isSaving
                    >
                      <Edit3 size={16} /> {/* Changed size to 16 */}
                    </button>
                    <button
                      onClick={() => handleDelete(template.id, template.name)}
                      className="inline-block p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Delete Template"
                      disabled={isSaving} // Use isSaving
                    >
                      <Trash2 size={16} /> {/* Changed size to 16 */}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for Add/Edit Template using the Modal component */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          <DialogTitle>
            {modalMode === "add" ? "Add New" : "Edit"} Email Template
          </DialogTitle>
        }
        containerClassName={modalContainerStyle}
      >
        {/* Form key ensures the form resets with default values when modalMode or editingTemplate changes */}
        <form
          key={editingTemplate?.id ?? "new-template-form"}
          ref={formRef}
          onSubmit={(e) => e.preventDefault()} // Prevent default browser submit
          className="space-y-4" // Keep outer spacing
        >
          {/* Display modal-specific errors */}
          {formError && <p className={modalErrorStyle}>{formError}</p>}

          {/* Adjusted Form Layout with Grid for Name/Subject */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelStyle}>
                Template Name*
              </label>
              <input
                type="text"
                id="name"
                name="name" // Name is required for FormData
                defaultValue={editingTemplate?.name ?? ""} // Use defaultValue
                required // HTML5 validation
                className={inputStyle(!!fieldErrors.name)}
                disabled={isSaving} // Use isSaving
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
              />
              {fieldErrors.name && (
                <p id="name-error" className={fieldErrorStyle}>
                  {fieldErrors.name.join(", ")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="subject" className={labelStyle}>
                Subject*
              </label>
              <input
                type="text"
                id="subject"
                name="subject" // Name is required for FormData
                defaultValue={editingTemplate?.subject ?? ""} // Use defaultValue
                required // HTML5 validation
                className={inputStyle(!!fieldErrors.subject)}
                disabled={isSaving} // Use isSaving
                aria-invalid={!!fieldErrors.subject}
                aria-describedby={
                  fieldErrors.subject ? "subject-error" : undefined
                }
              />
              {fieldErrors.subject && (
                <p id="subject-error" className={fieldErrorStyle}>
                  {fieldErrors.subject.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Body and Placeholders remain full width */}
          <div>
            <label htmlFor="body" className={labelStyle}>
              Body* (HTML allowed)
            </label>
            <textarea
              rows={10}
              id="body"
              name="body" // Name is required for FormData
              defaultValue={editingTemplate?.body ?? ""} // Use defaultValue
              required // HTML5 validation
              className={`${inputStyle(!!fieldErrors.body)} resize-y`}
              disabled={isSaving} // Use isSaving
              aria-invalid={!!fieldErrors.body}
              aria-describedby={fieldErrors.body ? "body-error" : undefined}
            />
            {fieldErrors.body && (
              <p id="body-error" className={fieldErrorStyle}>
                {fieldErrors.body.join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              You can use placeholders like <code>{"{{customerName}}"}</code>,{" "}
              <code>{"{{customerEmail}}"}</code>, etc. These will be replaced
              with actual data when sending.
            </p>
          </div>
          <div>
            <label htmlFor="placeholders" className={labelStyle}>
              Suggested Placeholders (comma-separated, for your reference)
            </label>
            <input
              type="text"
              id="placeholders"
              name="placeholders" // Name is required for FormData
              // Join array to string for defaultValue, use the hardcoded default for new ones
              defaultValue={
                editingTemplate?.placeholders.join(", ") ??
                defaultPlaceholdersString
              }
              className={inputStyle(!!fieldErrors.placeholders)} // Assuming you might add validation later
              disabled={isSaving} // Use isSaving
              aria-invalid={!!fieldErrors.placeholders}
              aria-describedby={
                fieldErrors.placeholders ? "placeholders-error" : undefined
              }
            />
            {fieldErrors.placeholders && ( // Display potential placeholder errors
              <p id="placeholders-error" className={fieldErrorStyle}>
                {fieldErrors.placeholders.join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Example:{" "}
              <code>
                {"{{customerName}}, {{customerEmail}}, {{bookingDate}}"}
              </code>
              . This helps you remember what placeholders this template uses.
            </p>
          </div>
          {/* Adjusted Checkbox Style */}
          <div className="flex items-center">
            <input
              id="isActive"
              name="isActive" // Name is required for FormData (though we use state for checked prop)
              type="checkbox"
              checked={isTemplateActive} // Controlled by state
              onChange={handleCheckboxChange} // Use specific handler
              disabled={isSaving} // Use isSaving
              className="h-4 w-4 rounded border-customGray text-customDarkPink focus:ring-customDarkPink" // Match border and ring color
            />
            <label
              htmlFor="isActive"
              className="ml-2 block text-sm text-customBlack/90" // Adjusted color
            >
              Active
            </label>
          </div>

          {/* Adjusted Button Container Layout */}
          <div className="mt-8 flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            {" "}
            {/* Adjusted border color */}
            <Button
              type="button" // Use type="button" to prevent default form submission
              onClick={closeModal}
              disabled={isSaving} // Use isSaving
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              type="button" // Use type="button"
              onClick={handleSave} // Call handleSave
              disabled={isSaving} // Use isSaving
            >
              {isSaving
                ? `${modalMode === "add" ? "Creating" : "Updating"}...`
                : `${modalMode === "add" ? "Create" : "Update"} Template`}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
