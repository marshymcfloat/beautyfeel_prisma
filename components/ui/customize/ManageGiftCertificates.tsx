// components/ui/customize/ManageGiftCertificates.tsx
"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
} from "react";
import {
  createGiftCertificateAction,
  // --- Need new/modified server actions ---
  // getAllServices, // Replace this
  getServicesAndSetsForGC, // New action to get filtered services/sets
  getActiveGiftCertificates,
  getAllBranches, // New action to get branches
  // --- End ---
} from "@/lib/ServerAction"; // Assuming path is correct
import type {
  GiftCertificate as PrismaGC,
  Service as PrismaService,
  ServiceSet as PrismaServiceSet, // Import ServiceSet type if needed
  Branch as PrismaBranch, // Import Branch type
} from "@prisma/client";
import Button from "@/components/Buttons/Button";
import Select, { MultiValue, ActionMeta, SingleValue } from "react-select";
import { RefreshCw } from "lucide-react";

// --- Import the modified CustomerInput ---
import CustomerInput from "@/components/Inputs/CustomerInput";
import type { CustomerWithRecommendations as CustomerData } from "@/lib/Types"; // Type for customer data

// --- Types ---
type ServiceTypeFilter = "service" | "set"; // For filtering
// value/label for react-select, add 'type' if needed
type SelectOption = { value: string; label: string; type?: ServiceTypeFilter };
type ActiveGiftCertificate = PrismaGC; // Use full Prisma type for list
type BranchOption = { value: string; label: string };

// --- Helper Function --- (Keep as is)
function generateRandomCode(length: number = 5): string {
  const characters = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789"; // Removed O
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// --- Reusable MultiSelect Component --- (Assuming definition exists or copy from above)
interface MultiSelectPropsGC {
  name: string;
  options: SelectOption[];
  isLoading?: boolean;
  placeholder?: string;
  value: MultiValue<SelectOption>;
  onChange: (
    newValue: MultiValue<SelectOption>,
    actionMeta: ActionMeta<SelectOption>,
  ) => void;
}
const ServiceMultiSelectGC: React.FC<MultiSelectPropsGC> = ({
  name,
  options,
  isLoading,
  placeholder,
  value,
  onChange,
}) => {
  // Definition copied from original prompt for completeness
  return (
    <div>
      {value.map((option) => (
        <input
          key={option.value}
          type="hidden"
          name={name}
          value={option.value}
        />
      ))}
      <Select
        isMulti
        name={name + "_select"}
        options={options}
        className="basic-multi-select"
        classNamePrefix="select"
        value={value}
        onChange={onChange}
        isLoading={isLoading}
        placeholder={placeholder}
        inputId={name}
        styles={{
          control: (base, state) => ({
            ...base,
            borderColor: state.isFocused ? "#C28583" : "#D1D5DB",
            boxShadow: state.isFocused ? "0 0 0 1px #C28583" : "none",
            "&:hover": { borderColor: "#C28583" },
            minHeight: "42px",
          }),
          option: (base, state) => ({
            ...base,
            backgroundColor: state.isSelected
              ? "#C28583"
              : state.isFocused
                ? "#F6F4EB"
                : "white",
            color: state.isSelected ? "#F6F4EB" : "#2E2A2A",
            "&:active": { backgroundColor: "#C28583aa" },
          }),
          multiValue: (base) => ({ ...base, backgroundColor: "#E5E7EB" }),
          multiValueLabel: (base) => ({ ...base, color: "#374151" }),
          multiValueRemove: (base) => ({
            ...base,
            color: "#9CA3AF",
            "&:hover": { backgroundColor: "#EF4444", color: "white" },
          }),
        }}
        aria-label={placeholder || "Select services or sets"}
      />
    </div>
  );
};
// --- End MultiSelect ---

// --- Main Component ---
export default function ManageGiftCertificates() {
  // --- State for Filters ---
  const [serviceType, setServiceType] = useState<ServiceTypeFilter>("service");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all"); // 'all' or branch ID
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);

  // --- State for Services/Sets based on filters ---
  const [availableItems, setAvailableItems] = useState<SelectOption[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true); // Renamed from isLoadingServices

  // --- State for Customer Input ---
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(
    null,
  );
  const [recipientEmail, setRecipientEmail] = useState(""); // State for email input

  // --- Existing State ---
  const [activeGCs, setActiveGCs] = useState<ActiveGiftCertificate[]>([]);
  const [isLoadingGCs, setIsLoadingGCs] = useState(true);
  const [formError, setFormError] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [selectedServicesOrSets, setSelectedServicesOrSets] = useState<
    MultiValue<SelectOption>
  >([]); // Use SelectOption

  // --- Fetch Branches (Once on Mount) ---
  const loadBranches = useCallback(async () => {
    setIsLoadingBranches(true);
    try {
      const branchesData = await getAllBranches(); // Assumes this action exists
      const branchOptions = branchesData.map((b: PrismaBranch) => ({
        value: b.id,
        label: b.title,
      }));
      setBranches([{ value: "all", label: "All Branches" }, ...branchOptions]); // Add 'All' option
    } catch (err) {
      console.error("Failed to load branches:", err);
      setFormError((prev) => ({
        ...prev,
        general: [...(prev.general || []), "Failed to load branches."],
      }));
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // --- Fetch Services/Sets based on Filters ---
  const loadItems = useCallback(async () => {
    setIsLoadingItems(true);
    setAvailableItems([]); // Clear previous items
    setSelectedServicesOrSets([]); // Clear selection when filters change
    try {
      // Call the new action with filters
      const itemsData = await getServicesAndSetsForGC(
        serviceType,
        selectedBranchId,
      );
      // Assume itemsData is already in { value, label } format from server action
      setAvailableItems(itemsData);
    } catch (err: any) {
      console.error("Failed to load services/sets:", err);
      setFormError((prev) => ({
        ...prev,
        general: [
          ...(prev.general || []),
          "Failed to load services/sets for selection.",
        ],
      }));
    } finally {
      setIsLoadingItems(false);
    }
  }, [serviceType, selectedBranchId]); // Re-run when filters change

  useEffect(() => {
    loadItems();
  }, [loadItems]); // Fetch items whenever loadItems changes (i.e., filters change)

  // --- Fetch Active GCs (Once on Mount or on demand) ---
  const loadActiveGCs = useCallback(async () => {
    setIsLoadingGCs(true);
    try {
      const gcs = await getActiveGiftCertificates();
      setActiveGCs(gcs);
    } catch (err: any) {
      console.error("Failed to load active GCs:", err);
      setFormError((prev) => ({
        ...prev,
        general: [
          ...(prev.general || []),
          "Failed to load active gift certificates.",
        ],
      }));
    } finally {
      setIsLoadingGCs(false);
    }
  }, []);

  useEffect(() => {
    loadActiveGCs();
  }, [loadActiveGCs]);

  // --- Handle Customer Selection ---
  const handleCustomerSelected = useCallback(
    (customer: CustomerData | null) => {
      setSelectedCustomer(customer);
      setRecipientEmail(customer?.email || ""); // Auto-fill email, allow override later
      // Clear any previous customer-related errors if needed
      setFormError((prev) => {
        const { recipientName, recipientEmail, ...rest } = prev; // Remove specific errors
        return rest;
      });
    },
    [],
  );

  // --- Generate Code --- (No changes needed)
  const handleGenerateCode = () => {
    const newCode = generateRandomCode(5);
    if (codeInputRef.current) {
      codeInputRef.current.value = newCode;
    }
  };

  // --- Form Submission Handler ---
  const handleSaveClick = () => {
    if (!formRef.current) {
      setFormError({ general: ["Form reference error."] });
      return;
    }
    setFormError({});
    setSuccessMessage(null);

    // --- Manually construct data instead of FormData ---
    const codeValue = codeInputRef.current?.value.trim() || "";
    const expiresValue = formRef.current.expiresAt.value;
    const itemIds = selectedServicesOrSets.map((option) => option.value);
    // recipientEmail state holds the potentially edited email
    // selectedCustomer state holds the customer object (ID, name etc.)

    // Client-side validation
    let errors: Record<string, string[]> = {};
    if (itemIds.length === 0) {
      errors.serviceIds = ["Please select at least one service or set."];
    }
    if (!codeValue || codeValue.length < 4) {
      errors.code = ["Code is required (min 4 chars)."];
    }
    if (
      recipientEmail &&
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(recipientEmail)
    ) {
      errors.recipientEmail = ["Please enter a valid email address."];
    }
    if (
      expiresValue &&
      new Date(expiresValue) < new Date(new Date().setHours(0, 0, 0, 0))
    ) {
      errors.expiresAt = ["Expiry date cannot be in the past."];
    }
    // Add validation for customer selection if needed (e.g., require selection)
    // if (!selectedCustomer) {
    //   errors.recipientName = ["Please select a recipient customer."];
    // }

    if (Object.keys(errors).length > 0) {
      setFormError(errors);
      return;
    }

    // --- Prepare data for the server action ---
    const gcData = {
      code: codeValue.toUpperCase(), // Send uppercase code
      itemIds: itemIds, // Send array of IDs
      itemType: serviceType, // Send the type ('service' or 'set') - Action needs to handle this
      recipientCustomerId: selectedCustomer?.id || null, // Send customer ID or null
      recipientName: selectedCustomer?.name || null, // Optional: Send name if action needs it
      recipientEmail: recipientEmail || null, // Send potentially edited email
      expiresAt: expiresValue || null, // Send date string or null
    };

    startTransition(async () => {
      // Assume createGiftCertificateAction accepts an object now, not FormData
      const result = await createGiftCertificateAction(gcData); // Pass structured data
      if (result.success) {
        setSuccessMessage(
          result.message || "Gift certificate created successfully!",
        );
        formRef.current?.reset(); // Reset form fields
        setSelectedServicesOrSets([]); // Clear multi-select state
        setSelectedCustomer(null); // Clear selected customer
        setRecipientEmail(""); // Clear email state
        setServiceType("service"); // Reset filters
        setSelectedBranchId("all"); // Reset filters
        if (codeInputRef.current) codeInputRef.current.value = ""; // Clear code input
        // Reload GCs, and items (which will happen due to filter reset)
        await loadActiveGCs();
        // loadItems(); // This will be triggered by filter state changes
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setSuccessMessage(null);
        setFormError(
          result.errors ?? {
            general: [result.message || "Failed to create certificate."],
          },
        );
      }
    });
  };

  const isSaving = isPending;

  // --- Style constants --- (Keep as defined in original prompt)
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink";
  const selectStyle = // Style for regular select dropdowns
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink";
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const errorTextStyle = "mt-1 text-xs text-red-500";
  const formSectionStyle =
    "rounded border border-customGray/30 bg-white/80 shadow-sm p-4 md:p-6";
  const listSectionStyle =
    "rounded border border-customGray/30 bg-white/80 shadow-sm";
  const thStyleBase =
    "px-4 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-4 py-2 text-sm text-customBlack/90 align-top";

  return (
    <div className="space-y-6 p-1">
      {/* --- Create GC Form Section --- */}
      <div className={formSectionStyle}>
        <h2 className="mb-4 text-lg font-semibold text-customBlack">
          Create Gift Certificate
        </h2>

        {/* General Feedback Messages */}
        {formError.general && (
          <p className="mb-4 rounded border border-red-300 bg-red-100 p-2 text-sm text-red-600">
            {formError.general.join(", ")}
          </p>
        )}
        {successMessage && (
          <p className="mb-4 rounded border border-green-300 bg-green-100 p-2 text-sm text-green-700">
            {successMessage}
          </p>
        )}

        <form
          ref={formRef}
          className="space-y-4"
          onSubmit={(e) => e.preventDefault()}
        >
          {/* --- Row 1: Code --- */}
          <div>
            <label htmlFor="code" className={labelStyle}>
              Certificate Code <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                ref={codeInputRef}
                type="text"
                name="code"
                id="code"
                required
                minLength={4}
                className={`block w-full flex-1 rounded-none rounded-l-md border border-r-0 border-customGray p-2 uppercase focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink sm:text-sm`}
                placeholder="Enter or Generate"
                aria-invalid={!!formError.code}
                aria-describedby={formError.code ? "code-error" : undefined}
              />
              <Button
                type="button"
                onClick={handleGenerateCode}
                className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-customGray bg-customGray/10 px-3 py-2 text-sm font-medium hover:bg-customGray/20 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                title="Generate Random Code (5 chars)"
                size="sm"
                invert
              >
                <RefreshCw size={16} className="h-4 w-4" />
                <span className="hidden sm:inline">Generate</span>
              </Button>
            </div>
            {formError.code && (
              <p id="code-error" className={errorTextStyle}>
                {formError.code.join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Min 4 chars. Uppercase. Must be unique.
            </p>
          </div>

          {/* --- Row 2: Filters for Services/Sets --- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="serviceTypeFilter" className={labelStyle}>
                Item Type <span className="text-red-500">*</span>
              </label>
              <select
                id="serviceTypeFilter"
                name="serviceTypeFilter"
                value={serviceType}
                onChange={(e) =>
                  setServiceType(e.target.value as ServiceTypeFilter)
                }
                className={selectStyle} // Use consistent select style
                disabled={isSaving || isLoadingItems || isLoadingBranches}
              >
                <option value="service">Single Service</option>
                <option value="set">Set</option>
              </select>
            </div>
            <div>
              <label htmlFor="branchFilter" className={labelStyle}>
                Filter by Branch
              </label>
              <select
                id="branchFilter"
                name="branchFilter"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className={selectStyle} // Use consistent select style
                disabled={isLoadingBranches || isSaving || isLoadingItems}
              >
                {isLoadingBranches ? (
                  <option>Loading branches...</option>
                ) : (
                  branches.map((branch) => (
                    <option key={branch.value} value={branch.value}>
                      {branch.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* --- Row 3: Service/Set Selection --- */}
          <div>
            <label htmlFor="serviceIds" className={labelStyle}>
              Included {serviceType === "service" ? "Services" : "Sets"}
              <span className="text-red-500">*</span>
            </label>
            <ServiceMultiSelectGC
              name="serviceIds" // Keep name consistent, value extracted manually
              options={availableItems} // Use state with filtered items
              isLoading={isLoadingItems}
              placeholder={`Select one or more ${serviceType === "service" ? "services" : "sets"}...`}
              value={selectedServicesOrSets}
              onChange={setSelectedServicesOrSets} // Directly use the setter
            />
            {formError.serviceIds && (
              <p className={errorTextStyle}>
                {formError.serviceIds.join(", ")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative flex flex-col items-center pt-2">
              <CustomerInput
                onCustomerSelect={handleCustomerSelected}
                error={formError.recipientName?.join(", ")} // Pass potential error
                initialValue={selectedCustomer?.name || ""} // Set initial value if customer selected
              />
            </div>

            {/* Recipient Email */}
            <div>
              <label htmlFor="recipientEmail" className={labelStyle}>
                Recipient Email (Auto-filled, Editable)
              </label>
              <input
                type="email"
                name="recipientEmail"
                id="recipientEmail"
                value={recipientEmail} // Controlled input
                onChange={(e) => setRecipientEmail(e.target.value)} // Allow editing
                className={inputStyle} // Use standard input style
                aria-invalid={!!formError.recipientEmail}
                aria-describedby={
                  formError.recipientEmail ? "email-error" : undefined
                }
                placeholder="Enter email or select customer"
              />
              {formError.recipientEmail && (
                <p id="email-error" className={errorTextStyle}>
                  {formError.recipientEmail.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* --- Row 5: Expiry Date --- */}
          <div>
            <label htmlFor="expiresAt" className={labelStyle}>
              Expires At (Optional)
            </label>
            <input
              type="date"
              name="expiresAt"
              id="expiresAt"
              className={inputStyle}
              min={new Date().toISOString().split("T")[0]} // Prevent past dates
              aria-invalid={!!formError.expiresAt}
              aria-describedby={
                formError.expiresAt ? "expires-error" : undefined
              }
            />
            {formError.expiresAt && (
              <p id="expires-error" className={errorTextStyle}>
                {formError.expiresAt.join(", ")}
              </p>
            )}
          </div>

          {/* --- Submit Button --- */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={
                isSaving || isLoadingItems || isLoadingGCs || isLoadingBranches
              } // Disable if loading anything
            >
              {isSaving ? "Creating..." : "Create Certificate"}
            </Button>
          </div>
        </form>
      </div>

      {/* --- Active GC List Section --- */}
      <div className={listSectionStyle}>
        <h3 className="border-b border-customGray/30 bg-customGray/10 p-3 text-base font-semibold text-gray-700">
          Active Gift Certificates
        </h3>
        <div className="min-w-full overflow-x-auto">
          {isLoadingGCs ? (
            <p className="py-10 text-center text-customBlack/70">
              Loading certificates...
            </p>
          ) : !formError.general?.some((e) => e.includes("active gift cert")) && // Check specific general error
            activeGCs.length === 0 ? (
            <p className="py-10 text-center text-customBlack/60">
              No active gift certificates found.
            </p>
          ) : (
            <table className="min-w-full divide-y divide-customGray/30">
              <thead className="bg-customGray/10">
                <tr>
                  <th className={thStyleBase}>Code</th>
                  <th className={`${thStyleBase} hidden sm:table-cell`}>
                    Recipient
                  </th>
                  <th className={`${thStyleBase} hidden md:table-cell`}>
                    Expires
                  </th>
                  <th className={`${thStyleBase} hidden lg:table-cell`}>
                    Issued
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-customGray/30">
                {activeGCs.map((gc) => (
                  <tr key={gc.id} className="hover:bg-customLightBlue/10">
                    <td
                      className={`${tdStyleBase} whitespace-nowrap font-mono uppercase`}
                    >
                      {gc.code}
                      <div className="text-xs text-gray-500 sm:hidden">
                        Recipient: {gc.recipientName || "N/A"}
                      </div>
                      <div className="text-xs text-gray-500 sm:hidden">
                        Expires:{" "}
                        {gc.expiresAt
                          ? new Date(gc.expiresAt).toLocaleDateString()
                          : "Never"}
                      </div>
                    </td>
                    <td className={`${tdStyleBase} hidden sm:table-cell`}>
                      {gc.recipientName || (
                        <span className="italic text-gray-400">N/A</span>
                      )}
                      {gc.recipientEmail && (
                        <div className="max-w-[150px] truncate text-[10px] text-gray-400">
                          {gc.recipientEmail}
                        </div>
                      )}
                    </td>
                    <td
                      className={`${tdStyleBase} hidden whitespace-nowrap md:table-cell`}
                    >
                      {gc.expiresAt ? (
                        new Date(gc.expiresAt).toLocaleDateString()
                      ) : (
                        <span className="italic text-gray-400">Never</span>
                      )}
                    </td>
                    <td
                      className={`${tdStyleBase} hidden whitespace-nowrap lg:table-cell`}
                    >
                      {new Date(gc.issuedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
