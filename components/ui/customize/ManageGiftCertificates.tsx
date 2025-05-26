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
  getServicesAndSetsForGC,
  getActiveGiftCertificates,
  getAllBranches,
} from "@/lib/ServerAction";
import type {
  GiftCertificate as PrismaGC,
  Service as PrismaService,
  ServiceSet as PrismaServiceSet,
  Branch as PrismaBranch,
} from "@prisma/client";
import Button from "@/components/Buttons/Button";
import Select, { MultiValue, ActionMeta, SingleValue } from "react-select";
import { RefreshCw, RotateCcw as RefreshIcon } from "lucide-react"; // Added RefreshIcon

import CustomerInput from "@/components/Inputs/CustomerInput";
import type { CustomerWithRecommendations as CustomerData } from "@/lib/Types";

import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

// --- Cache Keys ---
const GC_BRANCHES_CACHE_KEY: CacheKey = "branches_ManageGiftCertificates";
const GC_ITEMS_CACHE_KEY: CacheKey = "items_ManageGiftCertificates";
const GC_ACTIVE_LIST_CACHE_KEY: CacheKey = "activeGCs_ManageGiftCertificates";

// --- Types ---
type ServiceTypeFilter = "service" | "set";
type SelectOption = { value: string; label: string; type?: ServiceTypeFilter };
type ActiveGiftCertificate = PrismaGC;
type BranchOption = { value: string; label: string };

// --- Helper Function ---
function generateRandomCode(length: number = 5): string {
  const characters = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// --- Reusable MultiSelect Component ---
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

// --- Main Component ---
export default function ManageGiftCertificates() {
  const [serviceType, setServiceType] = useState<ServiceTypeFilter>("service");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);

  const [availableItems, setAvailableItems] = useState<SelectOption[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(
    null,
  );
  const [recipientEmail, setRecipientEmail] = useState("");

  const [activeGCs, setActiveGCs] = useState<ActiveGiftCertificate[]>([]);
  const [isLoadingGCs, setIsLoadingGCs] = useState(true);
  const [formError, setFormError] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [selectedServicesOrSets, setSelectedServicesOrSets] = useState<
    MultiValue<SelectOption>
  >([]);

  const loadBranches = useCallback(async (forceRefresh = false) => {
    setIsLoadingBranches(true);
    if (!forceRefresh) {
      const cached = getCachedData<PrismaBranch[]>(GC_BRANCHES_CACHE_KEY);
      if (cached) {
        const branchOptions = cached.map((b: PrismaBranch) => ({
          value: b.id,
          label: b.title,
        }));
        setBranches([
          { value: "all", label: "All Branches" },
          ...branchOptions,
        ]);
        setIsLoadingBranches(false);
        return;
      }
    }
    try {
      const branchesData = await getAllBranches();
      const branchOptions = branchesData.map((b: PrismaBranch) => ({
        value: b.id,
        label: b.title,
      }));
      setBranches([{ value: "all", label: "All Branches" }, ...branchOptions]);
      setCachedData(GC_BRANCHES_CACHE_KEY, branchesData);
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

  const loadItems = useCallback(
    async (forceRefresh = false) => {
      setIsLoadingItems(true);
      const cacheParams = { serviceType, selectedBranchId };
      if (!forceRefresh) {
        const cached = getCachedData<SelectOption[]>(
          GC_ITEMS_CACHE_KEY,
          cacheParams,
        );
        if (cached) {
          setAvailableItems(cached);
          setIsLoadingItems(false);
          // Note: Do not clear selectedServicesOrSets here if loading from cache
          // unless the intention is to always reset selection on filter change.
          // Current behavior: if filter changes, loadItems is called, clears selection,
          // then if data is cached, it uses cached items.
          return;
        }
      }
      setAvailableItems([]); // Clear previous items if fetching new
      setSelectedServicesOrSets([]); // Clear selection when filters change AND fetching new
      try {
        const itemsData = await getServicesAndSetsForGC(
          serviceType,
          selectedBranchId,
        );
        setAvailableItems(itemsData);
        setCachedData(GC_ITEMS_CACHE_KEY, itemsData, cacheParams);
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
    },
    [serviceType, selectedBranchId],
  );

  const loadActiveGCs = useCallback(async (forceRefresh = false) => {
    setIsLoadingGCs(true);
    if (!forceRefresh) {
      const cached = getCachedData<ActiveGiftCertificate[]>(
        GC_ACTIVE_LIST_CACHE_KEY,
      );
      if (cached) {
        setActiveGCs(cached);
        setIsLoadingGCs(false);
        return;
      }
    }
    try {
      const gcs = await getActiveGiftCertificates();
      setActiveGCs(gcs);
      setCachedData(GC_ACTIVE_LIST_CACHE_KEY, gcs);
    } catch (err: any) {
      console.error("Failed to load active GCs:", err);
      setFormError((prev) => ({
        ...prev,
        general: [
          ...(prev.general || []),
          "Failed to load active gift certificates.",
        ],
      }));
      setActiveGCs([]); // Clear on error
    } finally {
      setIsLoadingGCs(false);
    }
  }, []);

  useEffect(() => {
    loadBranches();
    loadActiveGCs();
  }, [loadBranches, loadActiveGCs]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleRefreshAll = () => {
    invalidateCache([
      GC_BRANCHES_CACHE_KEY,
      GC_ITEMS_CACHE_KEY,
      GC_ACTIVE_LIST_CACHE_KEY,
    ]);
    loadBranches(true);
    loadItems(true); // This will use current filters
    loadActiveGCs(true);
  };

  const handleCustomerSelected = useCallback(
    (customer: CustomerData | null) => {
      setSelectedCustomer(customer);
      setRecipientEmail(customer?.email || "");
      setFormError((prev) => {
        const { recipientName, recipientEmail, ...rest } = prev;
        return rest;
      });
    },
    [],
  );

  const handleGenerateCode = () => {
    const newCode = generateRandomCode(5);
    if (codeInputRef.current) codeInputRef.current.value = newCode;
  };

  const handleSaveClick = () => {
    if (!formRef.current) {
      setFormError({ general: ["Form reference error."] });
      return;
    }
    setFormError({});
    setSuccessMessage(null);

    const codeValue = codeInputRef.current?.value.trim() || "";
    const expiresValue = formRef.current.expiresAt.value;
    const itemIds = selectedServicesOrSets.map((option) => option.value);

    let errors: Record<string, string[]> = {};
    if (itemIds.length === 0)
      errors.serviceIds = ["Please select at least one service or set."];
    if (!codeValue || codeValue.length < 4)
      errors.code = ["Code is required (min 4 chars)."];
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

    if (Object.keys(errors).length > 0) {
      setFormError(errors);
      return;
    }

    const gcData = {
      code: codeValue.toUpperCase(),
      itemIds: itemIds,
      itemType: serviceType,
      purchaserCustomerId: selectedCustomer?.id || null, // <--- ADD THIS LINE
      recipientCustomerId: selectedCustomer?.id || null, // This might be redundant based on your schema/server logic, but keep it for now if type expects it
      recipientName: selectedCustomer?.name || null,
      recipientEmail: recipientEmail || null,
      expiresAt: expiresValue || null,
    };

    startTransition(async () => {
      const result = await createGiftCertificateAction(gcData);
      if (result.success) {
        setSuccessMessage(
          result.message || "Gift certificate created successfully!",
        );
        formRef.current?.reset();
        setSelectedServicesOrSets([]);
        setSelectedCustomer(null);
        setRecipientEmail("");
        if (codeInputRef.current) codeInputRef.current.value = "";

        // Reset filters to defaults (might trigger loadItems via useEffect if values change)
        const defaultServiceType = "service";
        const defaultBranchId = "all";
        let filtersChanged = false;
        if (serviceType !== defaultServiceType) {
          setServiceType(defaultServiceType);
          filtersChanged = true;
        }
        if (selectedBranchId !== defaultBranchId) {
          setSelectedBranchId(defaultBranchId);
          filtersChanged = true;
        }

        invalidateCache([GC_ACTIVE_LIST_CACHE_KEY, GC_ITEMS_CACHE_KEY]); // Invalidate GCs and potentially items
        await loadActiveGCs(true); // Force reload GCs
        if (!filtersChanged) {
          // If filters didn't change, items cache for current filters is still valid but might need refresh from server if data for those filters changed
          await loadItems(true); // So explicitly reload items if filters didn't change
        }
        // If filters *did* change, useEffect for loadItems will trigger with new filters

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
  const isAnyLoading = isLoadingBranches || isLoadingItems || isLoadingGCs;

  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink";
  const selectStyle =
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Gift Certificates
        </h2>
        <Button
          onClick={handleRefreshAll}
          size="sm"
          variant="outline"
          className="flex w-full items-center justify-center gap-1.5 sm:w-auto"
          disabled={isAnyLoading || isSaving}
          title="Refresh All Data"
        >
          <RefreshIcon size={16} />
          Refresh Data
        </Button>
      </div>

      {/* --- Create GC Form Section --- */}
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
                {" "}
                {formError.code.join(", ")}{" "}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {" "}
              Min 4 chars. Uppercase. Must be unique.{" "}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="serviceTypeFilter" className={labelStyle}>
                {" "}
                Item Type <span className="text-red-500">*</span>{" "}
              </label>
              <select
                id="serviceTypeFilter"
                name="serviceTypeFilter"
                value={serviceType}
                onChange={(e) =>
                  setServiceType(e.target.value as ServiceTypeFilter)
                }
                className={selectStyle}
                disabled={isSaving || isLoadingItems || isLoadingBranches}
              >
                <option value="service">Single Service</option>
                <option value="set">Set</option>
              </select>
            </div>
            <div>
              <label htmlFor="branchFilter" className={labelStyle}>
                {" "}
                Filter by Branch{" "}
              </label>
              <select
                id="branchFilter"
                name="branchFilter"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className={selectStyle}
                disabled={isLoadingBranches || isSaving || isLoadingItems}
              >
                {isLoadingBranches ? (
                  <option>Loading branches...</option>
                ) : (
                  branches.map((branch) => (
                    <option key={branch.value} value={branch.value}>
                      {" "}
                      {branch.label}{" "}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="serviceIds" className={labelStyle}>
              Included {serviceType === "service" ? "Services" : "Sets"}
              <span className="text-red-500">*</span>
            </label>
            <ServiceMultiSelectGC
              name="serviceIds"
              options={availableItems}
              isLoading={isLoadingItems}
              placeholder={`Select one or more ${serviceType === "service" ? "services" : "sets"}...`}
              value={selectedServicesOrSets}
              onChange={setSelectedServicesOrSets}
            />
            {formError.serviceIds && (
              <p className={errorTextStyle}>
                {" "}
                {formError.serviceIds.join(", ")}{" "}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative flex flex-col items-center pt-2">
              <CustomerInput
                onCustomerSelect={handleCustomerSelected}
                error={formError.recipientName?.join(", ")}
                initialValue={selectedCustomer?.name || ""}
              />
            </div>
            <div>
              <label htmlFor="recipientEmail" className={labelStyle}>
                {" "}
                Recipient Email (Auto-filled, Editable){" "}
              </label>
              <input
                type="email"
                name="recipientEmail"
                id="recipientEmail"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className={inputStyle}
                aria-invalid={!!formError.recipientEmail}
                aria-describedby={
                  formError.recipientEmail ? "email-error" : undefined
                }
                placeholder="Enter email or select customer"
              />
              {formError.recipientEmail && (
                <p id="email-error" className={errorTextStyle}>
                  {" "}
                  {formError.recipientEmail.join(", ")}{" "}
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
              min={new Date().toISOString().split("T")[0]}
              aria-invalid={!!formError.expiresAt}
              aria-describedby={
                formError.expiresAt ? "expires-error" : undefined
              }
            />
            {formError.expiresAt && (
              <p id="expires-error" className={errorTextStyle}>
                {" "}
                {formError.expiresAt.join(", ")}{" "}
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={isSaving || isAnyLoading}
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
              {" "}
              Loading certificates...{" "}
            </p>
          ) : !formError.general?.some((e) => e.includes("active gift cert")) &&
            activeGCs.length === 0 ? (
            <p className="py-10 text-center text-customBlack/60">
              {" "}
              No active gift certificates found.{" "}
            </p>
          ) : (
            <table className="min-w-full divide-y divide-customGray/30">
              <thead className="bg-customGray/10">
                <tr>
                  <th className={thStyleBase}>Code</th>
                  <th className={`${thStyleBase} hidden sm:table-cell`}>
                    {" "}
                    Recipient{" "}
                  </th>
                  <th className={`${thStyleBase} hidden md:table-cell`}>
                    {" "}
                    Expires{" "}
                  </th>
                  <th className={`${thStyleBase} hidden lg:table-cell`}>
                    {" "}
                    Issued{" "}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-customGray/30">
                {activeGCs.map((gc) => (
                  <tr key={gc.id} className="hover:bg-customLightBlue/10">
                    <td
                      className={`${tdStyleBase} whitespace-nowrap font-mono uppercase`}
                    >
                      {" "}
                      {gc.code}
                      <div className="text-xs text-gray-500 sm:hidden">
                        {" "}
                        Recipient: {gc.recipientName || "N/A"}{" "}
                      </div>
                      <div className="text-xs text-gray-500 sm:hidden">
                        {" "}
                        Expires:{" "}
                        {gc.expiresAt
                          ? new Date(gc.expiresAt).toLocaleDateString()
                          : "Never"}{" "}
                      </div>
                    </td>
                    <td className={`${tdStyleBase} hidden sm:table-cell`}>
                      {gc.recipientName || (
                        <span className="italic text-gray-400">N/A</span>
                      )}
                      {gc.recipientEmail && (
                        <div className="max-w-[150px] truncate text-[10px] text-gray-400">
                          {" "}
                          {gc.recipientEmail}{" "}
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
