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
} from "@/lib/ServerAction";
import type {
  Service as PrismaService,
  Branch as PrismaBranch,
} from "@prisma/client";
import { FollowUpPolicy } from "@prisma/client";
import type { ServerActionResponse } from "@/lib/Types";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

import Button from "@/components/Buttons/Button";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import { Plus, Edit3, Trash2, RefreshCw } from "lucide-react";

type Service = PrismaService & {
  branch?: Pick<PrismaBranch, "id" | "title"> | null;
  recommendedFollowUpDays: number | null;
  followUpPolicy: FollowUpPolicy;

  sendPostTreatmentEmail: boolean;
  postTreatmentEmailSubject: string | null;
  postTreatmentInstructions: string | null;
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
    Record<string, string | string[] | undefined | null> // Use the broader type for errors
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isSaving, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [selectedFollowUpPolicy, setSelectedFollowUpPolicy] =
    useState<FollowUpPolicy>(FollowUpPolicy.NONE);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  // --- NEW STATE FOR CONTROLLED EMAIL INPUTS ---
  const [sendPostTreatmentEmail, setSendPostTreatmentEmail] = useState(false);
  const [postTreatmentEmailSubjectState, setPostTreatmentEmailSubjectState] =
    useState("");
  const [postTreatmentInstructionsState, setPostTreatmentInstructionsState] =
    useState("");
  // --- END NEW STATE ---

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
        servicesData && !forceRefresh
          ? Promise.resolve(servicesData)
          : getAllServices().then((data) => {
              setCachedData<Service[]>(SERVICES_CACHE_KEY, data);
              return data;
            }),

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
      setServices(servicesData || []);
      setBranches(branchesData || []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  // --- MODIFIED EFFECT FOR MODAL OPEN/EDIT ---
  useEffect(() => {
    setFormErrors({}); // Clear errors when modal opens/closes
    if (isModalOpen) {
      formRef.current?.reset(); // Reset form fields (clears uncontrolled inputs)

      if (editingService) {
        // Set uncontrolled inputs by DOM value (title, description, price)
        // These are always rendered regardless of state
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

        // Set state for SelectInputGroup (branch, policy)
        setSelectedBranchId(editingService.branchId || "");
        setSelectedFollowUpPolicy(editingService.followUpPolicy);

        // Set state for recommended days input (if it's conditionally rendered based on policy)
        // You could make this input controlled too for consistency, but populating via ref here is okay
        // IF the input is guaranteed to be in the DOM when policy state is set (which it is,
        // as the policy state controls its rendering and is set *before* attempting to populate).
        const recommendedDaysInput = formRef.current!.elements.namedItem(
          "recommendedFollowUpDays",
        ) as HTMLInputElement;
        // Check if the input exists (only if policy is not NONE)
        if (recommendedDaysInput) {
          recommendedDaysInput.value =
            editingService.recommendedFollowUpDays?.toString() ?? "";
        }

        // --- Set STATE for CONTROLLED EMAIL INPUTS ---
        const initialSendEmail = editingService.sendPostTreatmentEmail ?? false;
        setSendPostTreatmentEmail(initialSendEmail); // This state change triggers re-render
        // Set the state for the controlled inputs directly
        setPostTreatmentEmailSubjectState(
          editingService.postTreatmentEmailSubject ?? "",
        );
        setPostTreatmentInstructionsState(
          editingService.postTreatmentInstructions ?? "",
        );
        // --- END SETTING STATE ---
      } else {
        // Reset state for adding a new service
        setSelectedBranchId("");
        setSelectedFollowUpPolicy(FollowUpPolicy.NONE);
        // Reset state for controlled email inputs
        setSendPostTreatmentEmail(false);
        setPostTreatmentEmailSubjectState("");
        setPostTreatmentInstructionsState("");
      }
    } else {
      // Reset editing service state when modal closes
      setEditingService(null);
      // Reset state for controlled inputs when modal closes (important!)
      setSendPostTreatmentEmail(false);
      setPostTreatmentEmailSubjectState("");
      setPostTreatmentInstructionsState("");
    }
  }, [isModalOpen, editingService]); // Effect depends on modal state and editingService
  // --- END MODIFIED EFFECT ---

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
          invalidateCache(SERVICES_CACHE_KEY);
          await loadData();
        }
      } catch (err: any) {
        setLoadError(err.message || "Error during deletion.");
      }
    });
  };

  // --- MODIFIED handleSave ---
  const handleSave = () => {
    if (!formRef.current) {
      // This error is unlikely with useRef but good practice
      setFormErrors({ general: ["Form reference error."] }); // Use array for consistency
      return;
    }
    setFormErrors({}); // Clear previous errors

    const form = formRef.current;
    // Create FormData object directly from the form
    // This automatically includes values from native HTML inputs (type="text", "number", "textarea", "checkbox")
    const formData = new FormData(form);

    // Manually add/override values from controlled components or states
    // that might not be reliably captured by FormData(form) if they are
    // not native inputs or their state isn't synced back to the DOM element's value property.
    formData.set("branchId", selectedBranchId); // From SelectInputGroup state
    formData.set("followUpPolicy", selectedFollowUpPolicy); // From SelectInputGroup state
    formData.set("sendPostTreatmentEmail", sendPostTreatmentEmail.toString()); // From checkbox state (redundant if input has name, but explicit)

    // --- Set CONTROLLED EMAIL INPUT VALUES from STATE ---
    // formData(form) might capture these if they are native inputs with 'name'
    // and rendered, but explicitly setting them from state is safer
    // since their values are managed by state.
    if (sendPostTreatmentEmail) {
      formData.set("postTreatmentEmailSubject", postTreatmentEmailSubjectState);
      formData.set("postTreatmentInstructions", postTreatmentInstructionsState);
    } else {
      // If the checkbox is off, ensure these fields are sent as empty strings.
      // Your Zod schemas will then convert these empty strings to `null`.
      formData.set("postTreatmentEmailSubject", "");
      formData.set("postTreatmentInstructions", "");
    }
    // --- END Setting CONTROLLED EMAIL INPUT VALUES ---

    // The 'recommendedFollowUpDays' input can also be set from the form element's value,
    // OR you could make it controlled and set it from state.
    // Sticking with form.elements.namedItem for recommendedDays for now
    const recommendedDaysInput = form.elements.namedItem(
      "recommendedFollowUpDays",
    ) as HTMLInputElement;
    if (recommendedDaysInput) {
      // Check if the input exists
      formData.set("recommendedFollowUpDays", recommendedDaysInput.value);
    } else {
      // If the input is not rendered (policy is NONE), ensure the field is sent as "" or null
      // Zod's coerceNumberOrNull will handle "" -> null
      formData.set("recommendedFollowUpDays", "");
    }

    // --- REMOVE MANUAL CLIENT-SIDE VALIDATION ---
    // Rely entirely on the server-side Zod validation and display its errors.
    // This prevents duplicating validation logic and ensures consistency.
    /*
    let errors: Record<string, string | undefined | null> = {};
    // ... all your manual checks here ...
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    */
    // --- END REMOVAL ---

    startTransition(async () => {
      try {
        const action = editingService
          ? updateServiceAction(editingService.id, formData)
          : createServiceAction(formData);
        const result: ServerActionResponse<Service> = await action;

        if (result.success) {
          setIsModalOpen(false);
          invalidateCache(SERVICES_CACHE_KEY);
          await loadData();
        } else {
          // Display validation errors or general error message from the server
          if (result.errors) {
            // Map server errors to client form errors
            const clientErrors: Record<
              string,
              string | string[] | undefined | null
            > = {};
            for (const fieldName in result.errors) {
              if (
                Object.prototype.hasOwnProperty.call(result.errors, fieldName)
              ) {
                const errorMessages = result.errors[fieldName];
                // Keep the error as string, string[], null, or undefined as returned by server
                clientErrors[fieldName] = errorMessages;
              }
            }
            setFormErrors(clientErrors);
          } else {
            // Set a general error if no field-specific errors returned
            setFormErrors({
              general: result.message || "Failed to save service.",
            });
          }
        }
      } catch (err: any) {
        // Catch unexpected errors during the action call
        console.error("ManageServices: Error saving service:", err);
        setFormErrors({
          general: err.message || "Unexpected error during save.",
        });
      }
    });
  };
  // --- END MODIFIED handleSave ---

  const closeModal = () => {
    setIsModalOpen(false);
    // State cleanup for controlled inputs happens in useEffect when isModalOpen becomes false
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
  const textareaStyle = `${inputStyle} resize-y`;
  const checkboxStyle =
    "mr-2 h-4 w-4 text-customDarkPink border-gray-300 rounded focus:ring-customDarkPink";

  const selectStyle = `${inputStyle} bg-white`;
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const listErrorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mt-1";

  // Helper function to display Zod errors which can be string or string[]
  const displayError = (error: string | string[] | undefined | null) => {
    if (!error) return null; // Don't display anything if error is null/undefined/empty
    if (Array.isArray(error)) {
      return error.join(". "); // Join array messages
    }
    return error; // Display string message
  };

  return (
    <div className="p-1">
      {/* Header and Buttons */}
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

      {/* List View Load Error */}
      {loadError && <p className={listErrorMsgStyle}>{loadError}</p>}

      {/* Services Table */}
      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading && services.length === 0 ? (
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
                  Policy
                </th>
                <th className={`${thStyleBase} hidden md:table-cell`}>
                  Rec. Days
                </th>
                {/* Post-Treatment Email Header */}
                <th
                  className={`${thStyleBase} hidden text-center lg:table-cell`}
                >
                  Post-Tx Email
                </th>
                {/* Actions Header */}
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
                    {service.followUpPolicy.replace(/_/g, " ")}
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
                  {/* Post-Treatment Email Cell */}
                  <td
                    className={`${tdStyleBase} hidden text-center lg:table-cell`}
                  >
                    {service.sendPostTreatmentEmail ? (
                      <span className="font-semibold text-green-600">Yes</span>
                    ) : (
                      <span className="italic text-gray-500">No</span>
                    )}
                  </td>
                  {/* Actions Cell */}
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

      {/* Modal for Add/Edit Service */}
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
        {displayError(formErrors.general) && (
          // Display general errors at the top of the form
          <p className={modalErrorStyle}>{displayError(formErrors.general)}</p>
        )}
        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()} // Prevent default form submission
          className="space-y-4"
        >
          {/* Title */}
          <div>
            <label htmlFor="title" className={labelStyle}>
              Service Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title" // Name matches Zod schema field
              id="title"
              required // Client-side validation hint
              className={`${inputStyle} ${formErrors.title ? "border-red-500" : ""}`}
              disabled={isSaving}
            />
            {displayError(formErrors.title) && (
              <p className={modalErrorStyle}>
                {displayError(formErrors.title)}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className={labelStyle}>
              Description
            </label>
            <textarea
              name="description" // Name matches Zod schema field
              id="description"
              rows={3}
              className={`${textareaStyle} ${formErrors.description ? "border-red-500" : ""}`}
              disabled={isSaving}
            ></textarea>
            {displayError(formErrors.description) && (
              <p className={modalErrorStyle}>
                {displayError(formErrors.description)}
              </p>
            )}
          </div>

          {/* Price and Branch (side-by-side) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="price" className={labelStyle}>
                Price (in cents) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price" // Name matches Zod schema field
                id="price"
                required // Client-side validation hint
                min="0"
                step="1"
                className={`${inputStyle} ${formErrors.price ? "border-red-500" : ""}`}
                disabled={isSaving}
              />
              {displayError(formErrors.price) && (
                <p className={modalErrorStyle}>
                  {displayError(formErrors.price)}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="branchId" className={labelStyle}>
                Branch <span className="text-red-500">*</span>
              </label>
              <SelectInputGroup
                name="branchId" // Name matches Zod schema field
                id="branchId"
                label="" // Label handled by the div above
                value={selectedBranchId}
                onChange={(key, value) => setSelectedBranchId(value)}
                options={branchOptions}
                valueKey="id"
                labelKey="title"
                required={true} // Client-side validation hint
                isLoading={isLoading && branches.length === 0}
                error={displayError(formErrors.branchId)} // Pass specific error type string or undefined
                disabled={isSaving || (isLoading && branches.length === 0)}
                className={`${selectStyle} ${formErrors.branchId ? "border-red-500" : ""}`}
              />
            </div>
          </div>

          {/* Post-Treatment Email Section (Conditional) */}
          <fieldset className="space-y-4 rounded border border-customGray/30 p-4">
            <legend className="px-2 text-sm font-medium text-customBlack/80">
              Post-Treatment Email
            </legend>
            <div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="sendPostTreatmentEmail"
                  name="sendPostTreatmentEmail" // Name matches Zod schema field
                  checked={sendPostTreatmentEmail}
                  onChange={(e) => setSendPostTreatmentEmail(e.target.checked)}
                  className={checkboxStyle}
                  disabled={isSaving}
                />
                <label
                  htmlFor="sendPostTreatmentEmail"
                  className="cursor-pointer text-sm font-medium text-customBlack/80"
                >
                  Send post-treatment email after service completion?
                </label>
              </div>
            </div>

            {sendPostTreatmentEmail && ( // Conditionally render based on state
              <>
                <div>
                  <label
                    htmlFor="postTreatmentEmailSubject"
                    className={labelStyle}
                  >
                    Email Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="postTreatmentEmailSubject" // Name matches Zod schema field
                    id="postTreatmentEmailSubject"
                    required={sendPostTreatmentEmail} // Client-side hint
                    // --- Make this input CONTROLLED ---
                    value={postTreatmentEmailSubjectState}
                    onChange={(e) =>
                      setPostTreatmentEmailSubjectState(e.target.value)
                    }
                    // --- END CONTROLLED ---
                    className={`${inputStyle} ${formErrors.postTreatmentEmailSubject ? "border-red-500" : ""}`}
                    disabled={isSaving}
                  />
                  {displayError(formErrors.postTreatmentEmailSubject) && (
                    <p className={modalErrorStyle}>
                      {displayError(formErrors.postTreatmentEmailSubject)}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="postTreatmentInstructions"
                    className={labelStyle}
                  >
                    Instructions <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="postTreatmentInstructions" // Name matches Zod schema field
                    id="postTreatmentInstructions"
                    rows={6}
                    required={sendPostTreatmentEmail} // Client-side hint
                    // --- Make this input CONTROLLED ---
                    value={postTreatmentInstructionsState}
                    onChange={(e) =>
                      setPostTreatmentInstructionsState(e.target.value)
                    }
                    // --- END CONTROLLED ---
                    className={`${textareaStyle} ${formErrors.postTreatmentInstructions ? "border-red-500" : ""}`}
                    disabled={isSaving}
                  ></textarea>
                  {displayError(formErrors.postTreatmentInstructions) && (
                    <p className={modalErrorStyle}>
                      {displayError(formErrors.postTreatmentInstructions)}
                    </p>
                  )}
                </div>
              </>
            )}
          </fieldset>

          {/* Follow-up Policy */}
          <div>
            <label htmlFor="followUpPolicy" className={labelStyle}>
              Follow-up Recommendation Policy{" "}
              <span className="text-red-500">*</span>
            </label>
            <SelectInputGroup
              name="followUpPolicy" // Name matches Zod schema field
              id="followUpPolicy"
              label="" // Label handled by div above
              value={selectedFollowUpPolicy}
              onChange={(key, value) => {
                // Ensure the selected value is a valid enum member before setting state
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
              required={true} // Client-side hint
              isLoading={false} // Select options are hardcoded
              error={displayError(formErrors.followUpPolicy)} // Pass specific error type string or undefined
              disabled={isSaving}
              className={`${selectStyle} ${formErrors.followUpPolicy ? "border-red-500" : ""}`}
            />
          </div>

          {/* Recommended Follow-up Days (Conditional) */}
          {selectedFollowUpPolicy !== FollowUpPolicy.NONE && (
            <div>
              <label htmlFor="recommendedFollowUpDays" className={labelStyle}>
                Recommended days for follow-up{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="recommendedFollowUpDays" // Name matches Zod schema field
                id="recommendedFollowUpDays"
                required={true}
                min="1"
                step="1"
                className={`${inputStyle} ${formErrors.recommendedFollowUpDays ? "border-red-500" : ""}`}
                disabled={isSaving}
              />
              {displayError(formErrors.recommendedFollowUpDays) && (
                <p className={modalErrorStyle}>
                  {displayError(formErrors.recommendedFollowUpDays)}
                </p>
              )}
            </div>
          )}

          {/* Modal Footer Buttons */}
          <div className="flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            <Button
              type="button" // Important to prevent form submission
              onClick={closeModal}
              disabled={isSaving}
              invert
            >
              Cancel
            </Button>
            <Button
              type="button" // Important to prevent form submission
              onClick={handleSave}
              disabled={isSaving}
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
