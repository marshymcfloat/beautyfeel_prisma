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
  getAllServices,
  getActiveGiftCertificates,
} from "@/lib/ServerAction";
import type {
  GiftCertificate as PrismaGC,
  Service as PrismaService,
} from "@prisma/client";
import Button from "@/components/Buttons/Button";
import Select, { MultiValue, ActionMeta } from "react-select";
import { RefreshCw } from "lucide-react";

// --- Types ---
// Use value/label for react-select compatibility
type SelectOption = { value: string; label: string };
type ActiveGiftCertificate = PrismaGC; // Use full Prisma type for list

// --- Helper Function --- (Keep as is)
function generateRandomCode(length: number = 5): string {
  // Adjusted default length
  const characters = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789"; // Removed O
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// --- Reusable MultiSelect Component --- (Use definition from ManageDiscounts or shared file)
interface MultiSelectPropsGC {
  // Renamed slightly to avoid potential conflicts if copy-pasted directly
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
  // This component definition should ideally live in a shared file
  // Copied here for completeness based on your provided code structure
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
        name={name + "_select"} // Avoid name clash with hidden inputs
        options={options}
        className="basic-multi-select"
        classNamePrefix="select"
        value={value}
        onChange={onChange}
        isLoading={isLoading}
        placeholder={placeholder}
        inputId={name}
        styles={{
          // Use consistent styling from other components
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
        aria-label={placeholder || "Select services"}
      />
    </div>
  );
};
// --- End MultiSelect ---

// --- Main Component ---
export default function ManageGiftCertificates() {
  const [availableServices, setAvailableServices] = useState<SelectOption[]>(
    [],
  ); // Use SelectOption
  const [activeGCs, setActiveGCs] = useState<ActiveGiftCertificate[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isLoadingGCs, setIsLoadingGCs] = useState(true);
  const [formError, setFormError] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [selectedServices, setSelectedServices] = useState<
    MultiValue<SelectOption>
  >([]); // Use SelectOption

  // --- Fetch Data ---
  const loadInitialData = useCallback(async () => {
    setIsLoadingServices(true);
    setIsLoadingGCs(true);
    setFormError({}); // Clear errors on load
    // Keep success message or clear it? Decide based on UX. Clearing here.
    // setSuccessMessage(null);
    try {
      const [servicesData, gcs] = await Promise.all([
        getAllServices(), // Assuming this returns PrismaService[]
        getActiveGiftCertificates(),
      ]);
      // Map PrismaService[] to SelectOption[]
      const serviceOptions = servicesData.map((s) => ({
        value: s.id,
        label: s.title,
      }));
      setAvailableServices(serviceOptions);
      setActiveGCs(gcs);
    } catch (err: any) {
      console.error("Failed to load initial data for GCs:", err);
      // Show error to user?
      setFormError({
        general: ["Failed to load required data. Please refresh."],
      });
    } finally {
      setIsLoadingServices(false);
      setIsLoadingGCs(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // --- Generate Code ---
  const handleGenerateCode = () => {
    const newCode = generateRandomCode(5); // Generate 5-char code
    if (codeInputRef.current) {
      codeInputRef.current.value = newCode;
      // Optionally trigger change event if needed by other logic
    }
  };

  // --- Form Submission Handler ---
  const handleSaveClick = () => {
    // Keep async for await inside
    if (!formRef.current) {
      setFormError({ general: ["Form reference error."] });
      return;
    }
    setFormError({});
    setSuccessMessage(null);

    const formData = new FormData(formRef.current);

    // Manually add selected service IDs
    formData.delete("serviceIds"); // Clear existing if any
    selectedServices.forEach((option) =>
      formData.append("serviceIds", option.value),
    );

    // Client-side validation
    let errors: Record<string, string[]> = {};
    if (selectedServices.length === 0) {
      errors.serviceIds = ["Please select at least one service."];
    }
    const codeValue = formData.get("code") as string;
    if (!codeValue || codeValue.trim().length < 4) {
      // Keep min 4 check
      errors.code = ["Code is required (min 4 chars)."];
    }
    const emailValue = formData.get("recipientEmail") as string;
    if (emailValue && !/\S+@\S+\.\S+/.test(emailValue)) {
      // Basic email format check
      errors.recipientEmail = ["Please enter a valid email address."];
    }
    const expiresValue = formData.get("expiresAt") as string;
    if (
      expiresValue &&
      new Date(expiresValue) < new Date(new Date().setHours(0, 0, 0, 0))
    ) {
      // Check if expiry is past
      errors.expiresAt = ["Expiry date cannot be in the past."];
    }

    if (Object.keys(errors).length > 0) {
      setFormError(errors);
      return;
    }

    startTransition(async () => {
      const result = await createGiftCertificateAction(formData);
      if (result.success) {
        setSuccessMessage(
          result.message || "Gift certificate created successfully!",
        );
        formRef.current?.reset(); // Reset form fields
        setSelectedServices([]); // Clear multi-select state
        if (codeInputRef.current) codeInputRef.current.value = ""; // Clear code input
        await loadInitialData(); // Refresh active GC list
        setTimeout(() => setSuccessMessage(null), 5000); // Clear success message after delay
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

  // --- Style constants --- (Adopt from other components)
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink";
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const errorTextStyle = "mt-1 text-xs text-red-500";
  const formSectionStyle =
    "rounded border border-customGray/30 bg-white/80 shadow-sm p-4 md:p-6"; // Harmonized style
  const listSectionStyle =
    "rounded border border-customGray/30 bg-white/80 shadow-sm"; // Harmonized style
  const thStyleBase =
    "px-4 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider"; // Harmonized style
  const tdStyleBase = "px-4 py-2 text-sm text-customBlack/90 align-top"; // Harmonized style

  return (
    <div className="space-y-6 p-1">
      <div className={formSectionStyle}>
        <h2 className="mb-4 text-lg font-semibold text-customBlack">
          Create Gift Certificate
        </h2>

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
                className={`block w-full flex-1 rounded-none rounded-l-md border border-r-0 border-customGray p-2 uppercase focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink sm:text-sm`} // Added uppercase class
                placeholder="Enter or Generate"
                aria-invalid={!!formError.code}
                aria-describedby={formError.code ? "code-error" : undefined}
              />
              <Button
                type="button"
                onClick={handleGenerateCode}
                className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-customGray bg-customGray/10 px-3 py-2 text-sm font-medium hover:bg-customGray/20 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                title="Generate Random Code (5 chars)"
                size="sm" // Ensure size prop works if Button component supports it
                invert
              >
                <RefreshCw size={16} className="h-4 w-4" />
                <span className="hidden sm:inline">Generate</span>{" "}
                {/* Hide text on small screens */}
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

          <div>
            <label htmlFor="serviceIds" className={labelStyle}>
              Included Services <span className="text-red-500">*</span>
            </label>
            <ServiceMultiSelectGC
              name="serviceIds"
              options={availableServices} // Use state with SelectOption[]
              isLoading={isLoadingServices}
              placeholder="Select one or more services..."
              value={selectedServices} // Use state with MultiValue<SelectOption>
              onChange={setSelectedServices} // Directly use the setter
            />
            {formError.serviceIds && (
              <p className={errorTextStyle}>
                {formError.serviceIds.join(", ")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="recipientName" className={labelStyle}>
                {" "}
                Recipient Name{" "}
              </label>
              <input
                type="text"
                name="recipientName"
                id="recipientName"
                className={inputStyle}
                aria-invalid={!!formError.recipientName}
              />
              {formError.recipientName && (
                <p className={errorTextStyle}>
                  {formError.recipientName.join(", ")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="recipientEmail" className={labelStyle}>
                {" "}
                Recipient Email{" "}
              </label>
              <input
                type="email"
                name="recipientEmail"
                id="recipientEmail"
                className={inputStyle}
                aria-invalid={!!formError.recipientEmail}
                aria-describedby={
                  formError.recipientEmail ? "email-error" : undefined
                }
              />
              {formError.recipientEmail && (
                <p id="email-error" className={errorTextStyle}>
                  {formError.recipientEmail.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="expiresAt" className={labelStyle}>
              {" "}
              Expires At (Optional){" "}
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

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={isSaving || isLoadingServices || isLoadingGCs} // Disable if loading anything
            >
              {isSaving ? "Creating..." : "Create Certificate"}
            </Button>
          </div>
        </form>
      </div>
      <div className={listSectionStyle}>
        <h3 className="border-b border-customGray/30 bg-customGray/10 p-3 text-base font-semibold text-gray-700">
          Active Gift Certificates
        </h3>
        <div className="min-w-full overflow-x-auto">
          {isLoadingGCs ? (
            <p className="py-10 text-center text-customBlack/70">
              Loading certificates...
            </p>
          ) : !formError.general && activeGCs.length === 0 ? ( // Check for general loading errors too
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
                  <th className={`${thStyleBase} hidden sm:table-cell`}>
                    Expires
                  </th>
                  <th className={`${thStyleBase} hidden sm:table-cell`}>
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
                    </td>
                    <td className={`${tdStyleBase} hidden sm:table-cell`}>
                      {gc.recipientName || (
                        <span className="italic text-gray-400">N/A</span>
                      )}
                    </td>
                    <td
                      className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
                    >
                      {gc.expiresAt ? (
                        new Date(gc.expiresAt).toLocaleDateString()
                      ) : (
                        <span className="italic text-gray-400">Never</span>
                      )}
                    </td>
                    <td
                      className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
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
