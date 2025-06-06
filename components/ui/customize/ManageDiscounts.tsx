"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useCallback,
  useRef,
} from "react";
import Button from "@/components/Buttons/Button";
import { DiscountType } from "@prisma/client";
import {
  getAllServices,
  createDiscountRuleAction,
  getDiscountRules,
  toggleDiscountRuleAction,
  deleteDiscountRuleAction,
} from "@/lib/ServerAction";
import { MultiSelectProps, UIDiscountRuleWithServices } from "@/lib/Types";
import Select, { MultiValue, ActionMeta, GroupBase } from "react-select";
import { Power, Trash2, Plus, RotateCcw as RefreshIcon } from "lucide-react";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";

import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

const DISCOUNT_SERVICES_CACHE_KEY: CacheKey = "services_ManageDiscounts";
const DISCOUNT_RULES_CACHE_KEY: CacheKey = "discountRules_ManageDiscounts";

type SelectOption = MultiSelectProps["options"][number];

const ServiceMultiSelect: React.FC<MultiSelectProps> = ({
  name,
  options,
  isLoading,
  placeholder,
  value,
  onChange,
  required,
}) => {
  return (
    <div>
      {value.map((o) => (
        <input key={o.value} type="hidden" name={name} value={o.value} />
      ))}
      <Select<SelectOption, true, GroupBase<SelectOption>>
        isMulti
        name={`${name}_select`}
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
            backgroundColor: base.backgroundColor,
            cursor: state.isDisabled ? "not-allowed" : "default",
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
            cursor: state.isDisabled ? "not-allowed" : "default",
          }),
          multiValue: (base) => ({
            ...base,
            backgroundColor: "#E5E7EB",
            borderRadius: "4px",
          }),
          multiValueLabel: (base) => ({
            ...base,
            color: "#374151",
            paddingLeft: "6px",
            paddingRight: "2px",
          }),
          multiValueRemove: (base) => ({
            ...base,
            color: "#9CA3AF",
            borderTopRightRadius: "4px",
            borderBottomRightRadius: "4px",
            "&:hover": { backgroundColor: "#EF4444", color: "white" },
            cursor: "pointer",
          }),
          indicatorSeparator: (base) => ({
            ...base,
            backgroundColor: "#D1D5DB",
          }),
          dropdownIndicator: (base, state) => ({
            ...base,
            color: state.isFocused ? "#C28583" : "#D1D5DB",
            "&:hover": { color: "#C28583" },
          }),
          loadingIndicator: (base) => ({ ...base, color: "#C28583" }),
          placeholder: (base) => ({ ...base, color: "#9CA3AF" }),
        }}
        aria-label={placeholder || "Select services"}
        required={required}
        isSearchable={true}
        closeMenuOnSelect={false}
      />
    </div>
  );
};

export default function ManageDiscounts() {
  const [availableServices, setAvailableServices] = useState<SelectOption[]>(
    [],
  );
  const [selectedServices, setSelectedServices] = useState<
    MultiValue<SelectOption>
  >([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  const [formError, setFormError] = useState<Record<string, string[]>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [applyToSpecific, setApplyToSpecific] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [discountRules, setDiscountRules] = useState<
    UIDiscountRuleWithServices[]
  >([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [minEndDate, setMinEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const loadServices = useCallback(async (forceRefresh = false) => {
    setIsLoadingServices(true);
    if (!forceRefresh) {
      const cached = getCachedData<SelectOption[]>(DISCOUNT_SERVICES_CACHE_KEY);
      if (cached) {
        setAvailableServices(cached);
        setIsLoadingServices(false);
        return;
      }
    }
    try {
      const servicesData = await getAllServices();
      const serviceOptions: SelectOption[] = servicesData.map((s) => ({
        value: s.id,
        label: s.title,
      }));
      setAvailableServices(serviceOptions);
      setCachedData(DISCOUNT_SERVICES_CACHE_KEY, serviceOptions);
    } catch (err: any) {
      console.error("Error loading services:", err);
      setFormError((prev) => ({
        ...prev,
        general: [
          ...(prev.general || []),
          "Failed to load services for selection.",
        ],
      }));
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  const loadDiscountRules = useCallback(async (forceRefresh = false) => {
    setIsLoadingList(true);
    setListError(null);
    if (!forceRefresh) {
      const cached = getCachedData<UIDiscountRuleWithServices[]>(
        DISCOUNT_RULES_CACHE_KEY,
      );
      if (cached) {
        setDiscountRules(cached);
        setIsLoadingList(false);
        return;
      }
    }
    try {
      const rules = await getDiscountRules();
      setDiscountRules(rules);
      setCachedData(DISCOUNT_RULES_CACHE_KEY, rules);
    } catch (err: any) {
      console.error("Error loading discount rules:", err);
      setListError(err.message || "Could not load discount rules.");
      setDiscountRules([]);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const loadAllData = useCallback(
    (forceRefresh = false) => {
      loadServices(forceRefresh);
      loadDiscountRules(forceRefresh);
    },
    [loadServices, loadDiscountRules],
  );

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleRefreshAll = () => {
    invalidateCache([DISCOUNT_SERVICES_CACHE_KEY, DISCOUNT_RULES_CACHE_KEY]);
    loadAllData(true);
  };

  const handleAdd = () => {
    setFormError({});
    setSuccessMessage(null);
    setMinEndDate(new Date().toISOString().split("T")[0]);
    setIsModalOpen(true);
    formRef.current?.reset();
    setSelectedServices([]);
    setApplyToSpecific(false);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleCreateRuleClick = () => {
    if (!formRef.current) return;
    setFormError({});
    setSuccessMessage(null);
    const fd = new FormData(formRef.current);
    selectedServices.forEach((o) => fd.append("serviceIds", o.value));

    let errors: Record<string, string[]> = {};
    const discountType = fd.get("discountType");
    const discountValue = fd.get("discountValue");
    const applyTo = fd.get("applyTo");
    const startDate = fd.get("startDate") as string;
    const endDate = fd.get("endDate") as string;

    if (!discountType) errors.discountType = ["Type is required."];
    const numericDiscountValue = Number(discountValue);
    if (
      discountValue === null ||
      discountValue === "" ||
      isNaN(numericDiscountValue) ||
      numericDiscountValue < 0
    ) {
      errors.discountValue = ["A valid, non-negative value is required."];
    } else if (
      discountType === DiscountType.PERCENTAGE &&
      numericDiscountValue > 100
    ) {
      errors.discountValue = ["Percentage cannot exceed 100."];
    }
    if (!startDate) errors.startDate = ["Start date is required."];
    if (!endDate) errors.endDate = ["End date is required."];
    if (startDate && endDate && startDate > endDate)
      errors.endDate = ["End date cannot be before start date."];
    if (applyTo === "specific" && selectedServices.length === 0)
      errors.serviceIds = ["Please select at least one service."];

    if (Object.keys(errors).length > 0) {
      setFormError(errors);
      return;
    }

    startTransition(async () => {
      try {
        const result = await createDiscountRuleAction(fd);
        if (!result) {
          setFormError({ general: ["Action failed with no response."] });
          return;
        }
        if (result.success) {
          setSuccessMessage(
            result.message || "Discount rule created successfully!",
          );
          closeModal();
          invalidateCache(DISCOUNT_RULES_CACHE_KEY);
          await loadDiscountRules(true);
          setTimeout(() => setSuccessMessage(null), 4000);
        } else {
          setFormError(
            result.errors ?? {
              general: [result.message || "Failed to create rule."],
            },
          );
        }
      } catch (error) {
        console.error("Error creating discount rule:", error);
        setFormError({ general: ["An unexpected error occurred."] });
      }
    });
  };

  const handleToggleActive = (id: string, currentStatus: boolean) => {
    setListError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        const res = await toggleDiscountRuleAction(id, currentStatus);
        if (res.success) {
          invalidateCache(DISCOUNT_RULES_CACHE_KEY);
          await loadDiscountRules(true);
          setSuccessMessage(
            res.message ||
              `Rule ${currentStatus ? "deactivated" : "activated"}.`,
          );
          setTimeout(() => setSuccessMessage(null), 4000);
        } else {
          setListError(res.message || "Error toggling rule status.");
          setTimeout(() => setListError(null), 4000);
        }
      } catch (error) {
        console.error("Error toggling discount rule:", error);
        setListError("An unexpected error occurred while toggling status.");
        setTimeout(() => setListError(null), 4000);
      }
    });
  };

  const handleDeleteRule = (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this discount rule permanently? This action cannot be undone.",
      )
    )
      return;
    setListError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        const res = await deleteDiscountRuleAction(id);
        if (res.success) {
          invalidateCache(DISCOUNT_RULES_CACHE_KEY);
          await loadDiscountRules(true);
          setSuccessMessage(res.message || "Rule deleted successfully.");
          setTimeout(() => setSuccessMessage(null), 4000);
        } else {
          setListError(res.message || "Error deleting rule.");
          setTimeout(() => setListError(null), 4000);
        }
      } catch (error) {
        console.error("Error deleting discount rule:", error);
        setListError("An unexpected error occurred while deleting the rule.");
        setTimeout(() => setListError(null), 4000);
      }
    });
  };

  const handleStartDateChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newStartDate = event.target.value;
    const today = new Date().toISOString().split("T")[0];
    setMinEndDate(newStartDate > today ? newStartDate : today);
  };

  const isProcessing = isPending;
  const isAnyLoading = isLoadingServices || isLoadingList;

  const inputSelectClasses =
    "mt-1 block w-full rounded border border-customGray bg-white p-2 shadow-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:cursor-not-allowed disabled:bg-gray-100 sm:text-sm";
  const errorTextClasses = "mt-1 text-xs text-red-500";
  const labelClasses = "block text-sm font-medium text-customBlack/80";
  const successMessageClasses =
    "mb-4 rounded border border-green-300 bg-green-100 p-2 text-sm text-green-700";
  const listErrorMessageClasses =
    "mb-4 rounded border border-red-300 bg-red-100 p-3 text-sm text-red-600";
  const modalErrorStyle = "text-xs text-red-600 mb-3";
  const thStyleBase =
    "px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-customBlack/80";
  const tdStyleBase = "px-4 py-2 align-top text-sm text-customBlack/90";
  const statusBadgeBase =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";
  const statusActiveClasses = "bg-green-100 text-green-800";
  const statusInactiveClasses = "bg-gray-100 text-gray-800";

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          {" "}
          Manage Discounts{" "}
        </h2>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            onClick={handleRefreshAll}
            size="sm"
            variant="outline"
            className="flex w-full items-center justify-center gap-1.5 sm:w-auto"
            disabled={isAnyLoading || isProcessing}
            title="Refresh Data"
          >
            <RefreshIcon size={16} />
            Refresh Data
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isProcessing || isAnyLoading}
            size="sm"
            className="w-full sm:w-auto"
          >
            <Plus size={16} className="mr-1" /> Add Discount Rule
          </Button>
        </div>
      </div>

      {listError && <p className={listErrorMessageClasses}>{listError}</p>}
      {successMessage && (
        <p className={successMessageClasses}>{successMessage}</p>
      )}

      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        <h3 className="border-b border-customGray/30 bg-customGray/10 p-3 text-base font-semibold text-gray-700">
          Current Discount Rules
        </h3>
        {isLoadingList ? (
          <p className="py-10 text-center text-customBlack/70">
            {" "}
            Loading rules...{" "}
          </p>
        ) : !listError && discountRules.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">
            {" "}
            No discount rules found. Click "Add Discount Rule" to create
            one.{" "}
          </p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                <th className={thStyleBase}>Description</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  {" "}
                  Type / Value{" "}
                </th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>Dates</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  {" "}
                  Applies To{" "}
                </th>
                <th className={thStyleBase}>Status</th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {discountRules.map((rule) => (
                <tr
                  key={rule.id}
                  className={`hover:bg-customLightBlue/10 ${!rule.isActive ? "opacity-60" : ""}`}
                >
                  <td
                    className={`${tdStyleBase} max-w-[120px] whitespace-normal break-words sm:max-w-[150px]`}
                    title={rule.description || "No description"}
                  >
                    {rule.description || (
                      <span className="italic text-gray-400">None</span>
                    )}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
                  >
                    {rule.discountType === DiscountType.PERCENTAGE
                      ? "Percent"
                      : "Fixed"}{" "}
                    /
                    {rule.discountType === DiscountType.PERCENTAGE
                      ? `${rule.discountValue}%`
                      : `₱${Number(rule.discountValue).toFixed(2)}`}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
                  >
                    {new Date(rule.startDate).toLocaleDateString("en-CA")} -{" "}
                    {new Date(rule.endDate).toLocaleDateString("en-CA")}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden max-w-xs whitespace-normal break-words sm:table-cell`}
                  >
                    {rule.applyToAll ? (
                      <span className="font-medium text-green-700">
                        {" "}
                        All Services{" "}
                      </span>
                    ) : rule.services && rule.services.length > 0 ? (
                      <span
                        title={rule.services.map((s) => s.title).join(", ")}
                        className="block truncate"
                      >
                        {rule.services.map((s) => s.title).join(", ")}
                      </span>
                    ) : (
                      <span className="italic text-orange-600">
                        {" "}
                        Specific (None Selected){" "}
                      </span>
                    )}
                  </td>
                  <td className={tdStyleBase}>
                    <span
                      className={`${statusBadgeBase} ${rule.isActive ? statusActiveClasses : statusInactiveClasses}`}
                    >
                      {rule.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <button
                      title={
                        rule.isActive ? "Deactivate Rule" : "Activate Rule"
                      }
                      onClick={() => handleToggleActive(rule.id, rule.isActive)}
                      disabled={isProcessing}
                      className={`mr-2 inline-block rounded p-1 transition-colors disabled:opacity-50 ${rule.isActive ? "text-yellow-600 hover:bg-yellow-100" : "text-green-600 hover:bg-green-100"}`}
                    >
                      <Power size={16} />
                    </button>
                    <button
                      title="Delete Rule"
                      onClick={() => handleDeleteRule(rule.id)}
                      disabled={isProcessing}
                      className="inline-block rounded p-1 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
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
        title={<DialogTitle>Create Discount Rule</DialogTitle>}
        containerClassName="relative m-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl"
      >
        {formError.general && (
          <p className={modalErrorStyle}>{formError.general.join(", ")}</p>
        )}
        {Object.keys(formError).length > 0 && !formError.general && (
          <div className="mb-3 space-y-1 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-600">
            <p className="font-medium text-red-700">
              {" "}
              Please fix the following issues:{" "}
            </p>
            {Object.entries(formError).map(
              ([field, errors]) =>
                field !== "general" && (
                  <p key={field}>
                    <strong className="capitalize">
                      {" "}
                      {field.replace(/([A-Z])/g, " $1").replace("Ids", " IDs")}
                      :{" "}
                    </strong>{" "}
                    {errors.join(", ")}
                  </p>
                ),
            )}
          </div>
        )}

        <form
          ref={formRef}
          className="space-y-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="discountType" className={labelClasses}>
                {" "}
                Type*{" "}
              </label>
              <select
                id="discountType"
                name="discountType"
                required
                className={inputSelectClasses}
                aria-invalid={!!formError.discountType}
                aria-describedby={
                  formError.discountType ? "discountType-error" : undefined
                }
                defaultValue={DiscountType.PERCENTAGE}
              >
                <option value={DiscountType.PERCENTAGE}>Percentage (%)</option>
                <option value={DiscountType.FIXED_AMOUNT}>
                  {" "}
                  Fixed Amount (PHP){" "}
                </option>
              </select>
              {formError.discountType && (
                <p id="discountType-error" className={errorTextClasses}>
                  {formError.discountType.join(", ")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="discountValue" className={labelClasses}>
                {" "}
                Value*{" "}
              </label>
              <input
                type="number"
                id="discountValue"
                name="discountValue"
                required
                min="0"
                step="any"
                className={inputSelectClasses}
                aria-invalid={!!formError.discountValue}
                aria-describedby={
                  formError.discountValue ? "discountValue-error" : undefined
                }
              />
              {formError.discountValue && (
                <p id="discountValue-error" className={errorTextClasses}>
                  {formError.discountValue.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="applyTo" className={labelClasses}>
              {" "}
              Apply To*{" "}
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
          </div>

          {applyToSpecific && (
            <div>
              <label htmlFor="serviceIds" className={labelClasses}>
                {" "}
                Select Services*{" "}
              </label>
              <ServiceMultiSelect
                name="serviceIds"
                options={availableServices}
                isLoading={isLoadingServices}
                placeholder="Choose one or more services..."
                value={selectedServices}
                onChange={(newValue) => setSelectedServices(newValue)}
                required={applyToSpecific}
              />
              {formError.serviceIds && (
                <p className={errorTextClasses}>
                  {" "}
                  {formError.serviceIds.join(", ")}{" "}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="startDate" className={labelClasses}>
                {" "}
                Start Date*{" "}
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                required
                className={inputSelectClasses}
                aria-invalid={!!formError.startDate}
                aria-describedby={
                  formError.startDate ? "startDate-error" : undefined
                }
                min={new Date().toISOString().split("T")[0]}
                onChange={handleStartDateChange}
              />
              {formError.startDate && (
                <p id="startDate-error" className={errorTextClasses}>
                  {" "}
                  {formError.startDate.join(", ")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="endDate" className={labelClasses}>
                {" "}
                End Date*{" "}
              </label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                required
                className={inputSelectClasses}
                aria-invalid={!!formError.endDate}
                aria-describedby={
                  formError.endDate ? "endDate-error" : undefined
                }
                min={minEndDate}
              />
              {formError.endDate && (
                <p id="endDate-error" className={errorTextClasses}>
                  {formError.endDate.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="description" className={labelClasses}>
              {" "}
              Description (Optional){" "}
            </label>
            <input
              type="text"
              id="description"
              name="description"
              placeholder="e.g., Summer Kickoff Sale, VIP Discount"
              maxLength={100}
              className={inputSelectClasses}
            />
            <p className="mt-1 text-xs text-gray-500">
              {" "}
              A short note for internal reference or display (optional).{" "}
            </p>
          </div>

          <div className="flex justify-end space-x-3 border-t border-customGray/30 pt-4">
            <Button
              type="button"
              onClick={closeModal}
              disabled={isProcessing}
              invert
            >
              {" "}
              Cancel{" "}
            </Button>
            <Button
              type="button"
              onClick={handleCreateRuleClick}
              disabled={isProcessing || isLoadingServices}
            >
              {isProcessing ? "Creating..." : "Create Discount Rule"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
