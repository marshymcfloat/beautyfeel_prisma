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
type ServiceOption = Pick<PrismaService, "id" | "title">;
type ActiveGiftCertificate = PrismaGC;

// --- Helper Function ---
function generateRandomCode(length: number = 8): string {
  const characters = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// --- Reusable MultiSelect Component ---
interface MultiSelectProps {
  name: string;
  options: { value: string; label: string }[];
  isLoading?: boolean;
  placeholder?: string;
  value: MultiValue<{ value: string; label: string }>;
  onChange: (
    newValue: MultiValue<{ value: string; label: string }>,
    actionMeta: ActionMeta<{ value: string; label: string }>,
  ) => void;
}

const ServiceMultiSelect: React.FC<MultiSelectProps> = ({
  name,
  options,
  isLoading,
  placeholder,
  value,
  onChange,
}) => {
  return (
    <div>
      {/* Hidden inputs remain useful if other parts of system expect standard form data */}
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
          control: (base) => ({
            ...base,
            borderColor: "#D1D5DB",
            minHeight: "42px",
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
  const [availableServices, setAvailableServices] = useState<ServiceOption[]>(
    [],
  );
  const [activeGCs, setActiveGCs] = useState<ActiveGiftCertificate[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isLoadingGCs, setIsLoadingGCs] = useState(true);
  const [formError, setFormError] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null); // Ref remains useful to access form elements
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [selectedServices, setSelectedServices] = useState<
    MultiValue<{ value: string; label: string }>
  >([]);

  // --- Fetch Data ---
  const loadInitialData = useCallback(async () => {
    setIsLoadingServices(true);
    setIsLoadingGCs(true);
    try {
      const [services, gcs] = await Promise.all([
        getAllServices(),
        getActiveGiftCertificates(),
      ]);
      setAvailableServices(services);
      setActiveGCs(gcs);
    } catch (err) {
      console.error("Failed to load initial data for GCs:", err);
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
    const newCode = generateRandomCode(5);
    if (codeInputRef.current) {
      codeInputRef.current.value = newCode;
    }
  };

  // --- NEW: Button Click Handler for Submission ---
  const handleSaveClick = async () => {
    if (!formRef.current) {
      console.error("Form ref is not available.");
      setFormError({ general: ["Form reference error."] });
      return;
    }

    setFormError({});
    setSuccessMessage(null);

    // Manually construct FormData from the current form state
    const formData = new FormData(formRef.current);

    // Manually add selected service IDs again, just in case hidden inputs weren't updated perfectly
    formData.delete("serviceIds"); // Clear any existing hidden inputs first
    selectedServices.forEach((option) => {
      formData.append("serviceIds", option.value);
    });

    // Perform client-side validation before calling the action
    if (!formData.getAll("serviceIds").length) {
      setFormError({ serviceIds: ["Please select at least one service."] });
      return;
    }
    const codeValue = formData.get("code") as string;
    if (!codeValue || codeValue.trim().length < 4) {
      setFormError({ code: ["Code is required (min 4 chars)."] });
      return;
    }
    // Add any other client-side checks here if needed

    // Start the server action transition
    startTransition(async () => {
      const result = await createGiftCertificateAction(formData);
      if (result.success) {
        setSuccessMessage(result.message);
        formRef.current?.reset();
        setSelectedServices([]); // Clear multi-select state
        await loadInitialData(); // Refresh list
      } else {
        setSuccessMessage(null);
        setFormError(
          result.errors ?? { general: [result.message || "Unknown error."] },
        );
        console.error("GC Creation failed:", result.message, result.errors);
      }
    });
  };

  const serviceOptionsForSelect = availableServices.map((s) => ({
    value: s.id,
    label: s.title,
  }));
  const isSaving = isPending;

  return (
    <div className="space-y-8">
      {/* --- Creation Form Section --- */}
      <div className="rounded bg-white bg-opacity-70 p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
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

        {/* REMOVED onSubmit from form */}
        <form ref={formRef} className="space-y-4">
          {/* Code Input with Generator */}
          <div>
            <label
              htmlFor="code"
              className="block text-sm font-medium text-gray-700"
            >
              Certificate Code*
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                ref={codeInputRef}
                type="text"
                name="code"
                id="code"
                required
                minLength={4}
                className="block w-full flex-1 rounded-none rounded-l-md border border-r-0 border-gray-300 p-2 focus:border-pink-500 focus:ring-pink-500 sm:text-sm"
                style={{ textTransform: "uppercase" }}
                placeholder="Enter code or generate"
              />
              <Button
                type="button"
                onClick={handleGenerateCode}
                className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                title="Generate Random Code"
                size="sm"
                invert
              >
                <RefreshCw size={16} />
                <span>Generate</span>
              </Button>
            </div>
            {formError.code && (
              <p className="mt-1 text-xs text-red-500">
                {formError.code.join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Min 4 chars. Uppercase. Must be unique.
            </p>
          </div>

          {/* Service Multi-Select (Controlled) */}
          <div>
            <label
              htmlFor="serviceIds"
              className="block text-sm font-medium text-gray-700"
            >
              Included Services*
            </label>
            <ServiceMultiSelect
              name="serviceIds"
              options={serviceOptionsForSelect}
              isLoading={isLoadingServices}
              placeholder="Select one or more services..."
              value={selectedServices}
              onChange={(newValue) => setSelectedServices(newValue)}
            />
            {formError.serviceIds && (
              <p className="mt-1 text-xs text-red-500">
                {formError.serviceIds.join(", ")}
              </p>
            )}
          </div>

          {/* Recipient Info (Optional) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="recipientName"
                className="block text-sm font-medium text-gray-700"
              >
                Recipient Name
              </label>
              <input
                type="text"
                name="recipientName"
                id="recipientName"
                className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
              />
              {formError.recipientName && (
                <p className="mt-1 text-xs text-red-500">
                  {formError.recipientName.join(", ")}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="recipientEmail"
                className="block text-sm font-medium text-gray-700"
              >
                Recipient Email (Optional)
              </label>
              <input
                type="email"
                name="recipientEmail"
                id="recipientEmail"
                className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
              />
              {formError.recipientEmail && (
                <p className="mt-1 text-xs text-red-500">
                  {formError.recipientEmail.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Expiry Date (Optional) */}
          <div>
            <label
              htmlFor="expiresAt"
              className="block text-sm font-medium text-gray-700"
            >
              Expires At (Optional)
            </label>
            <input
              type="date"
              name="expiresAt"
              id="expiresAt"
              className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm"
              min={new Date().toISOString().split("T")[0]}
            />
            {formError.expiresAt && (
              <p className="mt-1 text-xs text-red-500">
                {formError.expiresAt.join(", ")}
              </p>
            )}
          </div>

          {/* Submit Button - Changed type to "button", added onClick */}
          <div className="flex justify-end pt-2">
            <Button
              type="button" // Changed from submit
              onClick={handleSaveClick} // Added onClick handler
              disabled={isSaving || isLoadingServices}
            >
              {isSaving ? "Creating..." : "Create Gift Certificate"}
            </Button>
          </div>
        </form>
      </div>

      {/* --- Active Gift Certificates List Section --- */}
      <div className="rounded bg-white bg-opacity-70 p-6 shadow-md">
        {/* ... (table display logic remains the same) ... */}
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Active Gift Certificates
        </h2>
        {isLoadingGCs ? (
          <p className="py-4 text-center text-customBlack/70">
            Loading active certificates...
          </p>
        ) : activeGCs.length === 0 ? (
          <p className="py-4 text-center text-customBlack/60">
            No active gift certificates found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-customGray/50">
              <thead className="bg-customGray/30">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-customBlack">
                    Code
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-customBlack">
                    Recipient
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-customBlack">
                    Expires
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-customBlack">
                    Issued
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-customGray/30">
                {activeGCs.map((gc) => (
                  <tr key={gc.id} className="hover:bg-customWhiteBlue">
                    <td className="px-4 py-2 font-mono text-sm text-customBlack">
                      {gc.code}
                    </td>
                    <td className="px-4 py-2 text-sm text-customBlack/90">
                      {gc.recipientName || (
                        <span className="italic text-customBlack/50">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-customBlack/90">
                      {gc.expiresAt ? (
                        new Date(gc.expiresAt).toLocaleDateString()
                      ) : (
                        <span className="italic text-customBlack/50">
                          Never
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-customBlack/90">
                      {new Date(gc.issuedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
