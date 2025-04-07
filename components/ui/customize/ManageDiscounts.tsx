// components/ui/customize/ManageDiscounts.tsx
"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useCallback,
  useRef,
} from "react";
import Button from "@/components/Buttons/Button"; // Adjust path
import {
  Service as PrismaService,
  DiscountRule as PrismaDiscountRule, // Import base Prisma type
  DiscountType,
} from "@prisma/client"; // Import needed Prisma types
import {
  getAllServices,
  createDiscountRuleAction,
  getDiscountRules,
  toggleDiscountRuleAction,
  deleteDiscountRuleAction,
} from "@/lib/ServerAction"; // Import server actions
import Select, { MultiValue, ActionMeta } from "react-select"; // Import react-select
import { Power, Trash2 } from "lucide-react"; // Icons for buttons
// Import the specific type definition that includes the relation and new flag
import { UIDiscountRuleWithServices, ServiceOption } from "@/lib/Types";

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
  required?: boolean;
}

const ServiceMultiSelect: React.FC<MultiSelectProps> = ({
  name,
  options,
  isLoading,
  placeholder,
  value,
  onChange,
  required, // Include required if needed for styling/logic
}) => {
  return (
    <div>
      {/* Hidden inputs for FormData */}
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
        aria-label={placeholder || "Select services"}
        required={required}
      />
    </div>
  );
};
// --- End MultiSelect ---

// --- Main Component ---
export default function ManageDiscounts() {
  // Form State
  const [availableServices, setAvailableServices] = useState<ServiceOption[]>(
    [],
  );
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [formError, setFormError] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [applyToSpecific, setApplyToSpecific] = useState(false);
  const [selectedServices, setSelectedServices] = useState<
    MultiValue<{ value: string; label: string }>
  >([]);
  const formRef = useRef<HTMLFormElement>(null);

  // List State - Use the imported UIDiscountRuleWithServices type
  const [discountRules, setDiscountRules] = useState<
    UIDiscountRuleWithServices[]
  >([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Actions State
  const [isPending, startTransition] = useTransition();

  // --- Load Data ---
  const loadData = useCallback(async () => {
    setIsLoadingServices(true);
    setIsLoadingList(true);
    setListError(null);
    try {
      // Fetch rules first, as services are needed only for the form dropdown
      const rules = await getDiscountRules(); // Returns UIDiscountRuleWithServices[]
      setDiscountRules(rules); // Set state with correctly typed data
      setIsLoadingList(false); // Stop list loading

      // Then fetch services for the form
      const services = await getAllServices();
      setAvailableServices(services);
    } catch (err: any) {
      console.error("Failed to load discount data:", err);
      setListError(err.message || "Could not load discount rules or services.");
      setIsLoadingList(false); // Ensure loading stops on error too
    } finally {
      setIsLoadingServices(false); // Stop service loading
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Form Submission Handler ---
  const handleCreateRuleClick = () => {
    if (!formRef.current) return;
    setFormError({});
    setSuccessMessage(null);
    const formData = new FormData(formRef.current);
    selectedServices.forEach((option) =>
      formData.append("serviceIds", option.value),
    );

    // Client Checks
    if (
      formData.get("applyTo") === "specific" &&
      !formData.getAll("serviceIds").length
    ) {
      setFormError({ serviceIds: ["Select services."] });
      return;
    }
    if (!formData.get("discountValue")) {
      setFormError({ discountValue: ["Value required."] });
      return;
    }
    if (!formData.get("startDate")) {
      setFormError({ startDate: ["Start date required."] });
      return;
    }
    if (!formData.get("endDate")) {
      setFormError({ endDate: ["End date required."] });
      return;
    }
    if (formData.get("endDate")! < formData.get("startDate")!) {
      setFormError({ endDate: ["End date must be after start date."] });
      return;
    }

    startTransition(async () => {
      const result = await createDiscountRuleAction(formData);

      if (!result) {
        console.error("Discount creation action returned undefined.");
        setFormError({
          general: [
            "An unexpected error occurred. Action did not return a result.",
          ],
        });
        return; // Stop execution for this transition
      }
      if (result.success) {
        setSuccessMessage(result.message);
        formRef.current?.reset();
        setSelectedServices([]);
        setApplyToSpecific(false);
        await loadData(); // Refresh list
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setFormError(
          result.errors ?? { general: [result.message || "Unknown error."] },
        );
      }
    });
  };

  // --- Toggle Active Status ---
  const handleToggleActive = (id: string, currentStatus: boolean) => {
    startTransition(async () => {
      const result = await toggleDiscountRuleAction(id, currentStatus);
      if (result.success) {
        await loadData();
        setSuccessMessage(result.message);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setFormError({ general: [result.message || "Error toggling status."] });
        setTimeout(() => setFormError({}), 4000);
      }
    });
  };

  // --- Delete Discount ---
  const handleDeleteRule = (id: string) => {
    if (!window.confirm("Delete this discount rule permanently?")) return;
    startTransition(async () => {
      const result = await deleteDiscountRuleAction(id);
      if (result.success) {
        await loadData();
        setSuccessMessage(result.message);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setFormError({ general: [result.message || "Error deleting rule."] });
        setTimeout(() => setFormError({}), 4000);
      }
    });
  };

  const serviceOptionsForSelect = availableServices.map((s) => ({
    value: s.id,
    label: s.title,
  }));
  const isProcessing = isPending;

  // --- Standard Classes ---
  const inputSelectClasses =
    "mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm sm:text-sm focus:border-pink-500 focus:ring-pink-500 disabled:bg-gray-100 disabled:cursor-not-allowed";
  const errorTextClasses = "mt-1 text-xs text-red-500";
  const labelClasses = "block text-sm font-medium text-gray-700";
  const successMessageClasses =
    "mb-4 rounded border border-green-300 bg-green-100 p-2 text-sm text-green-700";
  const errorMessageClasses =
    "mb-4 rounded border border-red-300 bg-red-100 p-2 text-sm text-red-600";
  const thClasses =
    "px-4 py-2 text-left text-xs font-medium uppercase text-customBlack tracking-wider";
  const tdClasses = "px-4 py-2 text-sm text-customBlack/90 whitespace-nowrap";
  const statusBadgeBase =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";
  const statusActiveClasses = "bg-green-100 text-green-800";
  const statusInactiveClasses = "bg-gray-100 text-gray-800";

  return (
    <div className="space-y-8">
      {/* --- Create Form Section --- */}
      <div className="rounded bg-white bg-opacity-70 p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Create Time-Based Discount
        </h2>
        {formError.general && (
          <p className={errorMessageClasses}>{formError.general.join(", ")}</p>
        )}
        {successMessage && (
          <p className={successMessageClasses}>{successMessage}</p>
        )}

        <form ref={formRef} className="space-y-4">
          {/* Discount Type & Value */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="discountType" className={labelClasses}>
                Discount Type*
              </label>
              <select
                id="discountType"
                name="discountType"
                required
                className={inputSelectClasses}
              >
                <option value={DiscountType.PERCENTAGE}>Percentage (%)</option>
                <option value={DiscountType.FIXED_AMOUNT}>
                  Fixed Amount (PHP)
                </option>
              </select>
              {formError.discountType && (
                <p className={errorTextClasses}>
                  {formError.discountType.join(", ")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="discountValue" className={labelClasses}>
                Discount Value*
              </label>
              <input
                type="number"
                id="discountValue"
                name="discountValue"
                required
                min="0"
                step="any"
                className={inputSelectClasses}
              />
              {formError.discountValue && (
                <p className={errorTextClasses}>
                  {formError.discountValue.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Apply To */}
          <div>
            <label htmlFor="applyTo" className={labelClasses}>
              Apply To*
            </label>
            <select
              id="applyTo"
              name="applyTo"
              required
              className={inputSelectClasses}
              onChange={(e) =>
                setApplyToSpecific(e.target.value === "specific")
              }
              defaultValue="all"
            >
              <option value="all">All Services</option>
              <option value="specific">Specific Services</option>
            </select>
            {formError.applyTo && (
              <p className={errorTextClasses}>{formError.applyTo.join(", ")}</p>
            )}
          </div>

          {/* Conditional Service Selection */}
          {applyToSpecific && (
            <div>
              <label htmlFor="serviceIds" className={labelClasses}>
                Select Services*
              </label>
              <ServiceMultiSelect
                name="serviceIds"
                options={serviceOptionsForSelect}
                isLoading={isLoadingServices}
                placeholder="Choose services..."
                value={selectedServices}
                onChange={setSelectedServices}
                required={applyToSpecific}
              />
              {formError.serviceIds && (
                <p className={errorTextClasses}>
                  {formError.serviceIds.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Date Range */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="startDate" className={labelClasses}>
                Start Date*
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                required
                className={inputSelectClasses}
              />
              {formError.startDate && (
                <p className={errorTextClasses}>
                  {formError.startDate.join(", ")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="endDate" className={labelClasses}>
                End Date*
              </label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                required
                className={inputSelectClasses}
              />
              {formError.endDate && (
                <p className={errorTextClasses}>
                  {formError.endDate.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className={labelClasses}>
              Description
            </label>
            <input
              type="text"
              id="description"
              name="description"
              placeholder="e.g., Summer Sale"
              className={inputSelectClasses}
            />
            {formError.description && (
              <p className={errorTextClasses}>
                {formError.description.join(", ")}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleCreateRuleClick}
              disabled={isProcessing || isLoadingServices}
            >
              {isProcessing ? "Setting Rule..." : "Set Discount Rule"}
            </Button>
          </div>
        </form>
      </div>

      {/* --- List Active/Inactive Discounts --- */}
      <div className="rounded bg-white bg-opacity-70 p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Current Discount Rules
        </h2>
        {listError && <p className={errorMessageClasses}>{listError}</p>}
        {isLoadingList ? (
          <p className="py-4 text-center text-customBlack/70">
            Loading discount rules...
          </p>
        ) : discountRules.length === 0 ? (
          <p className="py-4 text-center text-customBlack/60">
            No discount rules found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-customGray/50">
              <thead className="bg-customGray/30">
                <tr>
                  <th className={thClasses}>Description</th>
                  <th className={thClasses}>Type</th>
                  <th className={thClasses}>Value</th>
                  <th className={thClasses}>Dates</th>
                  <th className={thClasses}>Applies To</th>
                  <th className={thClasses}>Status</th>
                  <th className={`${thClasses} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-customGray/30">
                {discountRules.map(
                  (
                    rule, // rule is UIDiscountRuleWithServices
                  ) => (
                    <tr
                      key={rule.id}
                      className={`hover:bg-customWhiteBlue ${!rule.isActive ? "italic opacity-50" : ""}`}
                    >
                      <td className={`${tdClasses} max-w-[150px] truncate`}>
                        {rule.description || "-"}
                      </td>
                      <td className={tdClasses}>{rule.discountType}</td>
                      <td className={tdClasses}>
                        {rule.discountType === DiscountType.PERCENTAGE
                          ? `${rule.discountValue}%`
                          : `₱${Number(rule.discountValue).toFixed(2)}`}
                      </td>
                      <td className={tdClasses}>
                        {new Date(rule.startDate).toLocaleDateString()} -{" "}
                        {new Date(rule.endDate).toLocaleDateString()}
                      </td>
                      <td className={`${tdClasses} max-w-xs truncate`}>
                        {/* Corrected check using applyToAll flag */}
                        {rule.applyToAll ? (
                          <span className="font-medium text-green-700">
                            All Services
                          </span>
                        ) : // Display services list only if NOT applyToAll
                        rule.services && rule.services.length > 0 ? (
                          <span
                            title={rule.services.map((s) => s.title).join(", ")}
                          >
                            {rule.services.map((s) => s.title).join(", ")}
                          </span>
                        ) : (
                          <span className="italic text-customBlack/50">
                            Specific (None selected?)
                          </span>
                        )}
                      </td>
                      <td className={tdClasses}>
                        <span
                          className={`${statusBadgeBase} ${rule.isActive ? statusActiveClasses : statusInactiveClasses}`}
                        >
                          {rule.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className={`${tdClasses} text-right`}>
                        <button
                          title={
                            rule.isActive ? "Deactivate Rule" : "Activate Rule"
                          }
                          onClick={() =>
                            handleToggleActive(rule.id, rule.isActive)
                          }
                          disabled={isProcessing}
                          className={`mr-2 rounded p-1 ${rule.isActive ? "text-yellow-600 hover:bg-yellow-100 hover:text-yellow-800" : "text-green-600 hover:bg-green-100 hover:text-green-800"} transition-colors disabled:opacity-50`}
                        >
                          <Power size={16} />
                        </button>
                        <button
                          title="Delete Rule"
                          onClick={() => handleDeleteRule(rule.id)}
                          disabled={isProcessing}
                          className="rounded p-1 text-red-600 transition-colors hover:bg-red-100 hover:text-red-800 disabled:opacity-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Define these utility classes in your global CSS or Tailwind config
/*
.th-style { @apply px-4 py-2 text-left text-xs font-medium uppercase text-customBlack tracking-wider; }
.td-style { @apply px-4 py-2 text-sm text-customBlack/90 whitespace-nowrap; }
.status-badge { @apply inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium; }
.status-active { @apply bg-green-100 text-green-800; }
.status-inactive { @apply bg-gray-100 text-gray-800; }
.error-message { @apply mb-4 rounded border border-red-300 bg-red-100 p-2 text-sm text-red-600; }
.success-message { @apply mb-4 rounded border border-green-300 bg-green-100 p-2 text-sm text-green-700; }
.error-text { @apply mt-1 text-xs text-red-500; }
*/
