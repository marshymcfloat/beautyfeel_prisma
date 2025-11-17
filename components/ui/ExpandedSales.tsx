// ExpandedSales.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import Button from "../Buttons/Button"; // Assuming this is your custom Button component
import { AlertCircle, Loader2, PlusCircle } from "lucide-react";

import {
  ExpenseCategory,
  TimePeriod,
  SalesDataPoint,
  PaymentMethodTotals,
  SalesDataForSpecificPeriod,
} from "@/lib/Types";

import { Branch } from "@prisma/client"; // From Prisma schema

import {
  createExpense,
  getDailySalesForRange,
  getMonthlySalesForRange,
  getYearlySalesForRange,
} from "@/lib/ServerAction";

import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

const paymentMethodColors = {
  cash: "#C28583",
  ewallet: "#60A5FA",
  bank: "#34D399",
  unknown: "#D9D9D9",
};

const branchColors = [
  "#7B68EE",
  "#FF7F50",
  "#6495ED",
  "#DC143C",
  "#00CED1",
  "#FFD700",
  "#32CD32",
  "#FF69B4",
  "#8A2BE2",
  "#BA55D3",
  "#CD5C5C",
  "#4682B4",
];

const formatCurrencyPHP = (
  value: number | null | undefined,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
) => {
  if (value === undefined || value === null || isNaN(value) || !isFinite(value))
    return "₱0.00";
  const numericValue = typeof value === "number" ? value : 0;
  return numericValue.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits,
    maximumFractionDigits,
  });
};

const formatCurrencyPHPNoDecimal = (value: number | null | undefined) =>
  formatCurrencyPHP(value, 0, 0);

interface TooltipPayloadEntry {
  value: number;
  dataKey: string;
  name: string;
  color?: string;
  fill?: string;
  payload: SalesDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

const CustomStackedPaymentTooltip = ({
  active,
  payload,
  label,
}: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const validEntries = payload.filter(
      (entry: TooltipPayloadEntry) =>
        entry.value !== undefined && entry.value !== null && entry.value > 0,
    );
    const dataPoint: SalesDataPoint | undefined = payload[0]?.payload;
    const totalExpenses = dataPoint?.totalExpenses ?? 0;

    if (validEntries.length === 0 && totalExpenses === 0) {
      return null;
    }
    const totalSales = validEntries.reduce(
      (sum: number, entry: TooltipPayloadEntry) => sum + (entry.value || 0),
      0,
    );
    const net = totalSales - totalExpenses;
    return (
      <div className="min-w-[150px] rounded border bg-customOffWhite p-2 text-sm shadow-md">
        <p className="mb-1 border-b border-customGray pb-1 font-semibold text-customBlack">
          {label}
        </p>
        <div className="space-y-0.5">
          {validEntries
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .map((entry: TooltipPayloadEntry) => (
              <p
                key={`tooltip-stacked-payment-${entry.dataKey}`}
                style={{ color: entry.color || entry.fill }}
              >
                {entry.name}: {formatCurrencyPHPNoDecimal(entry.value)}
              </p>
            ))}
          {totalSales > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-customBlack">
              Sales Total: {formatCurrencyPHPNoDecimal(totalSales)}
            </p>
          )}
          {totalExpenses > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-red-600">
              Expenses Total: {formatCurrencyPHPNoDecimal(totalExpenses)}
            </p>
          )}
          {(totalSales > 0 || totalExpenses > 0) && (
            <p
              className={`mt-1 border-t border-customGray pt-1 font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              Net: {formatCurrencyPHPNoDecimal(net)}
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const CustomStackedBranchTooltip = ({
  active,
  payload,
  label,
}: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const validEntries = payload.filter(
      (entry: TooltipPayloadEntry) =>
        entry.value !== undefined && entry.value !== null && entry.value > 0,
    );
    const dataPoint: SalesDataPoint | undefined = payload[0]?.payload;
    const totalExpenses = dataPoint?.totalExpenses ?? 0;

    // Only render tooltip if there's sales data or expense data
    if (validEntries.length === 0 && totalExpenses === 0) {
      return null;
    }

    const totalSales = validEntries.reduce(
      (sum: number, entry: TooltipPayloadEntry) => sum + (entry.value || 0),
      0,
    );
    const net = totalSales - totalExpenses;

    return (
      <div className="min-w-[150px] rounded border bg-customOffWhite p-2 text-sm shadow-md">
        <p className="mb-1 border-b border-customGray pb-1 font-semibold text-customBlack">
          {label}
        </p>
        <div className="space-y-0.5">
          {validEntries
            .sort(
              (a: TooltipPayloadEntry, b: TooltipPayloadEntry) =>
                (b.value || 0) - (a.value || 0),
            )
            .map((entry: TooltipPayloadEntry) => (
              <p
                key={`tooltip-stacked-branch-${entry.dataKey}`}
                style={{ color: entry.color || entry.fill }}
              >
                {entry.name}: {formatCurrencyPHPNoDecimal(entry.value)}
              </p>
            ))}
          {totalSales > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-customBlack">
              Sales Total: {formatCurrencyPHPNoDecimal(totalSales)}
            </p>
          )}
          {totalExpenses > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-red-600">
              Expenses Total: {formatCurrencyPHPNoDecimal(totalExpenses)}
            </p>
          )}
          {(totalSales > 0 || totalExpenses > 0) && (
            <p
              className={`mt-1 border-t border-customGray pt-1 font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              Net: {formatCurrencyPHPNoDecimal(net)}
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const getFriendlyPeriodNameLocal = (period: TimePeriod): string => {
  if (!period) return "Unknown";
  switch (period) {
    case "daily":
      return "Daily";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    default:
      const exhaustiveCheck: never = period;
      return "Unknown";
  }
};

const getDefaultSalesDataForPeriodLocal = (
  period: TimePeriod,
  branches: Branch[] = [],
): SalesDataForSpecificPeriod => ({
  chartDataItems: [],
  paymentTotalsForPeriod: { cash: 0, ewallet: 0, bank: 0, unknown: 0 },
  totalSalesForPeriod: 0,
  totalExpensesForPeriod: 0,
  periodRangeString: `No data for ${getFriendlyPeriodNameLocal(period)}`,
  branches: branches, // Include branches even if data is empty
  meta: {
    fetchedPeriod: period,
    fetchedTimestamp: null, // Use null for default/empty state timestamp
  },
});

type SalesDetailsProps = {
  isOpen: boolean;
  onClose: () => void;
  isOwner: boolean;
  initialBranches: Branch[]; // Branches passed from parent dashboard
  onParentDataRefresh?: () => Promise<void>; // Callback to refresh parent data
  loggedInUserId: string;
  initialPeriodType?: TimePeriod; // Default period to show when opening
};

const initialExpenseFormState = {
  date: new Date().toISOString().split("T")[0],
  amount: "",
  category: Object.values(ExpenseCategory)[0] as ExpenseCategory,
  description: "",
  branchId: "", // Use "" for no specific branch initially
};

// Memoize the BarChart component to prevent unnecessary re-renders
// Recharts' BarChart is the most complex part, memoizing it can help.
// React.memo performs a shallow comparison of props by default.
// Since chartDataItems, margin, etc. are useMemoized or simple values,
// this should work effectively.
const MemoizedBarChart = React.memo(BarChart);

export default function ExpandedSales({
  isOpen,
  onClose,
  isOwner,
  initialBranches,
  onParentDataRefresh,
  loggedInUserId,
  initialPeriodType = "monthly", // Default to monthly
}: SalesDetailsProps) {
  const [activeDisplayPeriod, setActiveDisplayPeriod] =
    useState<TimePeriod>(initialPeriodType);
  const [salesData, setSalesData] = useState<SalesDataForSpecificPeriod | null>(
    null,
  );
  const [isLoadingSalesInternal, setIsLoadingSalesInternal] = useState(true);
  const [componentError, setComponentError] = useState<string | null>(null);

  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState(
    initialExpenseFormState,
  );

  const [componentBranches, setComponentBranches] = useState<Branch[]>(
    initialBranches || [],
  );

  // Effect to sync branches state based on initial props or fetched data
  useEffect(() => {
    // Prioritize branches from fetched data if available and different
    if (salesData?.branches && salesData.branches.length > 0) {
      // Simple check: if lengths differ or the first/last branch title differs
      // A deep comparison like JSON.stringify(a) !== JSON.stringify(b) is more robust
      // but potentially slower for very large branch lists (unlikely here).
      // Let's stick to the JSON.stringify comparison which is safest for correctness.
      if (
        JSON.stringify(salesData.branches) !== JSON.stringify(componentBranches)
      ) {
        console.log(
          "[ExpandedSales] Updating componentBranches from fetched salesData.",
        );
        setComponentBranches(salesData.branches);
      }
    } else if (
      initialBranches &&
      initialBranches.length > 0 &&
      componentBranches.length === 0
    ) {
      // If no branches in salesData and componentBranches is empty, use initial props
      console.log(
        "[ExpandedSales] Updating componentBranches from initialBranches prop.",
      );
      setComponentBranches(initialBranches);
    }
    // If salesData.branches is empty but componentBranches has initialBranches,
    // we keep componentBranches as it might be needed for the expense form.
    // If both are empty, componentBranches remains empty, which is correct.
  }, [initialBranches, componentBranches, salesData?.branches]); // Dependencies

  // Memoized function to fetch sales data based on period (incorporating cache check)
  const fetchSalesDataForPeriodInternal = useCallback(
    async (periodToFetch: TimePeriod) => {
      // If not owner, just show default empty data with available branches
      if (!isOwner) {
        console.log(
          "[ExpandedSales] Not owner. Setting default empty state for period:",
          periodToFetch,
        );
        setSalesData(
          getDefaultSalesDataForPeriodLocal(periodToFetch, componentBranches),
        );
        setIsLoadingSalesInternal(false);
        setComponentError(null);
        return;
      }

      const cacheKeyMap: Record<TimePeriod, CacheKey> = {
        daily: "salesData_daily",
        monthly: "salesData_monthly",
        yearly: "salesData_yearly",
      };
      const currentCacheKey = cacheKeyMap[periodToFetch];

      // Attempt to get data from cache first
      const cachedSalesData =
        getCachedData<SalesDataForSpecificPeriod>(currentCacheKey);

      // --- CACHE CHECK LOGIC ---
      // Use cached data ONLY if it exists AND is considered fresh AND has chart data items.
      // An empty chartDataItems array in cache means no sales data was found last time.
      // Also check if the cached period matches the requested period.
      if (
        cachedSalesData &&
        cachedSalesData.chartDataItems && // Check if chart data exists in cache
        cachedSalesData.chartDataItems.length > 0 && // Check if chart data is not empty
        cachedSalesData.meta?.fetchedPeriod === periodToFetch // Ensure cached data is for the requested period
      ) {
        console.log(
          `[ExpandedSales] Using cached data for ${periodToFetch}. Chart data items count: ${cachedSalesData.chartDataItems.length}.`,
        );
        // Use cached data. The branch syncing effect will handle updating componentBranches.
        setSalesData(cachedSalesData); // Set component state from cache
        setIsLoadingSalesInternal(false); // Turn off loading instantly
        setComponentError(null); // Clear errors
        return; // Exit the function early as we used cached data
      } else {
        console.log(
          `[ExpandedSales] Cache miss/stale/empty for ${periodToFetch}. Cached data:`,
          cachedSalesData,
          `\nCache Key: ${currentCacheKey}`,
          `\nRequested Period: ${periodToFetch}`,
          `\nCached Period: ${cachedSalesData?.meta?.fetchedPeriod}`,
          `\nHas Chart Data: ${!!cachedSalesData?.chartDataItems}`,
          `\nChart Data Length: ${cachedSalesData?.chartDataItems?.length}`,
        );
      }

      // --- CACHE MISS (or stale, or empty chart data): Proceed with server fetch ---
      console.log(
        `[ExpandedSales] Fetching ${periodToFetch} data from server.`,
      );
      setIsLoadingSalesInternal(true); // Start loading indicator
      setComponentError(null); // Clear previous errors
      // Clear previous sales data state immediately to show loading state correctly
      setSalesData(null);

      try {
        let result: SalesDataForSpecificPeriod | null = null;
        // Call the appropriate server action based on the period
        if (periodToFetch === "monthly")
          result = await getMonthlySalesForRange(6); // Fetch last 6 months
        else if (periodToFetch === "daily")
          result = await getDailySalesForRange(30); // Fetch last 30 days
        else if (periodToFetch === "yearly")
          result = await getYearlySalesForRange(3); // Fetch last 3 years

        console.log(
          `[ExpandedSales] Server fetch result for ${periodToFetch}:`,
          result,
        );

        if (result) {
          // Data fetched successfully. Update component state and cache.

          // Use branches from the fetch result if available,
          // otherwise fall back to componentBranches state (derived from initialBranches).
          // This ensures branches from the backend are used if provided,
          // but we still have a branch list (from props) if the fetch was for
          // a period with no sales and thus no branches in the result.
          const branchesToUse =
            result.branches && result.branches.length > 0
              ? result.branches
              : componentBranches.length > 0
                ? componentBranches
                : initialBranches; // Final fallback to initial

          result.branches = branchesToUse;

          result.meta = {
            fetchedPeriod: periodToFetch,
            fetchedTimestamp: Date.now(), // Set timestamp for freshness
          };

          // Only cache if there is meaningful data (sales > 0 or expenses > 0 or chart items)
          // Avoid caching empty result states that might just indicate no data for the period.
          // However, caching empty *valid* results (e.g., period has no sales/expenses)
          // prevents refetching unnecessarily. Let's cache if `result` is not null.
          setCachedData(currentCacheKey, result); // Cache the fetched data

          setSalesData(result); // Update component state with fresh data
          setComponentError(null); // Clear error on success
        } else {
          // Handle case where server action returns null or unexpected value
          console.error(
            `[ExpandedSales] Server action for ${periodToFetch} returned null or invalid data.`,
          );
          // Set default empty state, but include current branches
          setSalesData({
            ...getDefaultSalesDataForPeriodLocal(
              periodToFetch,
              componentBranches, // Pass current branches state
            ),
            meta: { fetchedPeriod: periodToFetch, fetchedTimestamp: null },
          });
          setComponentError(
            `Failed to load data for ${getFriendlyPeriodNameLocal(periodToFetch)}. Server returned empty or invalid data.`,
          );
        }
      } catch (error: any) {
        console.error(
          `[ExpandedSales] Error fetching ${periodToFetch} data:`,
          error,
        );
        // Set default empty state on error, but include current branches
        setSalesData({
          ...getDefaultSalesDataForPeriodLocal(
            periodToFetch,
            componentBranches, // Pass current branches state
          ),
          meta: { fetchedPeriod: periodToFetch, fetchedTimestamp: null },
        });
        setComponentError(
          `Error fetching data: ${error.message || "Unknown error"}`,
        );
      } finally {
        setIsLoadingSalesInternal(false); // Stop loading indicator
      }
    },
    [isOwner, componentBranches, initialBranches],
  );

  // Effect to handle modal open/close and period switching
  useEffect(() => {
    console.log(
      `[ExpandedSales] useEffect triggered. isOpen: ${isOpen}, activeDisplayPeriod: ${activeDisplayPeriod}`,
    );
    // Only trigger data fetch logic when the modal is open
    if (isOpen) {
      // When modal is open or just opened, trigger the fetch logic for the active display period.
      // fetchSalesDataForPeriodInternal now checks the cache first.
      fetchSalesDataForPeriodInternal(activeDisplayPeriod);
    } else {
      // When modal closes, reset state that affects the display *inside* the modal
      console.log("[ExpandedSales] Modal is closing.");
      // Keep activeDisplayPeriod and componentBranches as they might be relevant on next open
      // setActiveDisplayPeriod(initialPeriodType); // Don't reset period, keeps state between closes
      setSalesData(null); // Clear data on close to ensure fetch logic runs on next open
      setIsLoadingSalesInternal(true); // Assume loading for next open
      setComponentError(null); // Clear errors
      setIsAddExpenseModalOpen(false); // Close expense modal
      setActionError(null); // Clear action error
    }
    // Dependencies:
    // isOpen: Triggers logic for opening/closing.
    // activeDisplayPeriod: Triggers fetch when period is switched *while modal is open*.
    // fetchSalesDataForPeriodInternal: Stable function reference.
    // initialPeriodType: Removed as dependency since we no longer reset activeDisplayPeriod on close.
  }, [isOpen, activeDisplayPeriod, fetchSalesDataForPeriodInternal]);

  // Handler for switching periods via buttons
  const handlePeriodSwitch = (newPeriod: TimePeriod) => {
    console.log(`[ExpandedSales] Switching period to ${newPeriod}`);
    // Only switch if a different period is selected and we are not already loading
    if (newPeriod !== activeDisplayPeriod && !isLoadingSalesInternal) {
      setActiveDisplayPeriod(newPeriod); // This state change triggers the useEffect to fetch
    }
  };

  // Effect for handling expense modal state and resetting form
  useEffect(() => {
    if (isAddExpenseModalOpen) {
      console.log("[ExpandedSales] Expense modal opened. Resetting form.");
      // Use a clean initial state clone to avoid shared reference issues
      const defaultBranchId =
        componentBranches && componentBranches.length > 0
          ? componentBranches[0].id // Set the first branch as default if available
          : ""; // Otherwise, set to empty string (no specific branch)

      setExpenseFormData({
        ...initialExpenseFormState,
        branchId: defaultBranchId,
      });
      setActionError(null); // Clear action error
    }
    console.log(
      `[ExpandedSales] Expense modal state changed: ${isAddExpenseModalOpen}`,
    );
  }, [isAddExpenseModalOpen, componentBranches]); // Depend on componentBranches to update default branch

  const handleExpenseInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setExpenseFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleAddExpense = async () => {
    setActionError(null);
    if (!expenseFormData.date) {
      setActionError("Please select a date.");
      return;
    }
    const amountNum = Number(expenseFormData.amount);
    if (
      expenseFormData.amount === "" ||
      isNaN(amountNum) ||
      amountNum <= 0 ||
      !isFinite(amountNum)
    ) {
      setActionError("Please enter a valid positive amount.");
      return;
    }
    if (!expenseFormData.category) {
      setActionError("Please select an expense category.");
      return;
    }
    if (!loggedInUserId) {
      setActionError("User not logged in. Cannot record expense.");
      return;
    }

    setIsSubmittingExpense(true);
    console.log("[ExpandedSales] Submitting expense:", expenseFormData);
    try {
      const dataToSend = {
        date: expenseFormData.date, // Prisma handles "YYYY-MM-DD" string for @db.Date
        amount: amountNum,
        category: expenseFormData.category,
        description:
          expenseFormData.description === ""
            ? null // Send null if description is empty
            : expenseFormData.description,
        recordedById: loggedInUserId,
        branchId:
          expenseFormData.branchId === ""
            ? null // Send null if no branch is selected
            : expenseFormData.branchId,
      };
      const result = await createExpense(dataToSend);
      console.log("[ExpandedSales] Create expense result:", result);

      if (result.success) {
        setIsAddExpenseModalOpen(false);

        // --- CACHE INVALIDATION/REFRESH ---
        // Invalidate cache for the currently viewed period in the modal
        const cacheKeyMap: Record<TimePeriod, CacheKey> = {
          daily: "salesData_daily",
          monthly: "salesData_monthly",
          yearly: "salesData_yearly",
        };
        // Invalidate the cache key corresponding to the *currently active display period* in the modal
        invalidateCache(cacheKeyMap[activeDisplayPeriod]);

        // Refetch data for the currently active display period in the modal.
        // This call will now hit the server because the cache was invalidated.
        console.log(
          `[ExpandedSales] Expense added, invalidating cache for ${activeDisplayPeriod} and refetching.`,
        );
        await fetchSalesDataForPeriodInternal(activeDisplayPeriod);

        // Call parent refresh callback if provided (e.g., to update dashboard preview)
        // The parent dashboard's preview is likely monthly, so it needs its monthly cache invalidated.
        // The parent's onParentDataRefresh should handle invalidating its own monthly cache.
        if (onParentDataRefresh) {
          console.log("[ExpandedSales] Triggering parent data refresh.");
          // Assume parent refresh handles its own cache invalidation (likely monthly)
          await onParentDataRefresh();
        }
      } else {
        setActionError(
          `Failed to add expense: ${result.error || "Unknown error"}`,
        );
      }
    } catch (error: any) {
      console.error("[ExpandedSales] Error adding expense:", error);
      setActionError(
        `An unexpected error occurred: ${error.message || "Unknown error"}`,
      );
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  // Memoized data for rendering
  const chartDataItems = useMemo(
    () => salesData?.chartDataItems || [],
    [salesData],
  );
  const paymentTotalsForPeriod = useMemo(
    () =>
      salesData?.paymentTotalsForPeriod || {
        cash: 0,
        ewallet: 0,
        bank: 0,
        unknown: 0,
      },
    [salesData],
  );
  const totalSalesForPeriod = useMemo(
    () => salesData?.totalSalesForPeriod || 0,
    [salesData],
  );
  const totalExpensesForPeriod = useMemo(
    () => salesData?.totalExpensesForPeriod || 0,
    [salesData],
  );
  const currentPeriodRangeString = useMemo(
    () =>
      salesData?.periodRangeString ||
      `Data for ${getFriendlyPeriodNameLocal(activeDisplayPeriod)}`,
    [salesData, activeDisplayPeriod],
  );

  // Memoized branch colors for consistent charting
  const branchColorMap = useMemo(() => {
    const map: { [key: string]: string } = {};
    // Use componentBranches state for rendering branch-specific data
    (componentBranches ?? []).forEach((branch, index) => {
      map[branch.title] = branchColors[index % branchColors.length];
    });
    return map;
  }, [componentBranches]);

  const friendlyPeriodName = getFriendlyPeriodNameLocal(activeDisplayPeriod);

  // Determine what to display based on loading/error/data state
  // Show central message if loading, error, OR if there's no sales data AND no expense data AND no chart data items
  const showCentralMessage =
    isLoadingSalesInternal ||
    componentError ||
    (!isLoadingSalesInternal &&
      !componentError &&
      totalSalesForPeriod === 0 &&
      totalExpensesForPeriod === 0 &&
      chartDataItems.length === 0); // Condition adjusted slightly for clarity

  // Determine if summary should be shown (if there are sales or expenses)
  const showSummary = totalSalesForPeriod > 0 || totalExpensesForPeriod > 0;

  // Determine if payment chart should be shown (only if there are chart data items)
  const showPaymentChart = !showCentralMessage && chartDataItems.length > 0;
  // Determine if branch chart should be shown (only if there are chart data items AND branches)
  const showBranchChart =
    !showCentralMessage &&
    chartDataItems.length > 0 &&
    (componentBranches?.length ?? 0) > 0;

  console.log(
    `[ExpandedSales Render] Period: ${activeDisplayPeriod}, Status: Loading=${isLoadingSalesInternal}, Error=${!!componentError}, SalesData=${!!salesData}, ChartItems=${chartDataItems.length}, Branches=${componentBranches.length}, TotalSales=${totalSalesForPeriod}, TotalExpenses=${totalExpensesForPeriod}, ShowCharts: Payment=${showPaymentChart}, Branch=${showBranchChart}`,
  );

  if (!isOpen) {
    return null; // Render nothing when closed for best performance
  }

  return (
    // The main modal content div - gated by isOpen prop for better performance
    // Parent component should ideally handle mounting/unmounting based on `isOpen`
    // but adding this here provides a fallback if parent doesn't.
    // Removed the conditional rendering here based on the note above - parent should control.
    // Keeping the original structure where the component is always mounted but content changes.
    // If performance is still an issue, the parent should render conditionally.
    <div className="max-h-[75vh] overflow-y-auto px-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-customGray pb-4">
        <div className="flex gap-2">
          {/* Period Switch Buttons */}
          {(["daily", "monthly", "yearly"] as TimePeriod[]).map((period) => (
            <Button
              key={period}
              type="button"
              onClick={() => handlePeriodSwitch(period)}
              variant={
                activeDisplayPeriod === period
                  ? ("default" as any) // Cast to 'any' if ButtonVariant type is strict
                  : ("outline" as any)
              }
              size="sm"
              disabled={isLoadingSalesInternal}
              className="text-sm"
            >
              {getFriendlyPeriodNameLocal(period)}
            </Button>
          ))}
        </div>
        {/* Add Expense Button (Owner only) */}
        {isOwner && (
          <Button
            type="button"
            onClick={() => {
              // Open expense modal
              setIsAddExpenseModalOpen(true);
            }}
            variant={"outline" as any}
            size="sm"
            disabled={isLoadingSalesInternal || isSubmittingExpense}
            className="text-sm"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
          </Button>
        )}
      </div>

      {/* Add Expense Modal */}
      {/* Render the modal overlay and content only when it's open */}
      {isAddExpenseModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded border border-customGray bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-customBlack">
              Add Expense
            </h2>
            {actionError && (
              <div className="mb-4 flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-600">
                <AlertCircle size={16} /> {actionError}
              </div>
            )}
            {/* Expense Form Fields */}
            <div className="mb-4">
              <label
                htmlFor="expenseDate"
                className="mb-1 block text-sm font-medium text-customBlack/70"
              >
                Date
              </label>
              <input
                type="date"
                id="expenseDate"
                name="date"
                value={expenseFormData.date}
                onChange={handleExpenseInputChange}
                className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                required
              />
            </div>
            <div className="mb-4">
              <label
                htmlFor="expenseAmount"
                className="mb-1 block text-sm font-medium text-customBlack/70"
              >
                Amount (in PHP)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-customBlack/70">
                  ₱
                </span>
                <input
                  type="number"
                  id="expenseAmount"
                  name="amount"
                  value={expenseFormData.amount}
                  onChange={handleExpenseInputChange}
                  className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 pl-8 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                  step="0.01"
                  min="0"
                  required
                />
              </div>
            </div>
            <div className="mb-4">
              <label
                htmlFor="expenseCategory"
                className="mb-1 block text-sm font-medium text-customBlack/70"
              >
                Category
              </label>
              <select
                id="expenseCategory"
                name="category"
                value={expenseFormData.category}
                onChange={handleExpenseInputChange}
                className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                required
              >
                {Object.values(ExpenseCategory).map((category) => (
                  <option key={category} value={category}>
                    {/* Format enum names nicely */}
                    {category.charAt(0).toUpperCase() +
                      category.slice(1).toLowerCase().replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label
                htmlFor="expenseDescription"
                className="mb-1 block text-sm font-medium text-customBlack/70"
              >
                Description (Optional)
              </label>
              <textarea
                id="expenseDescription"
                name="description"
                value={expenseFormData.description}
                onChange={handleExpenseInputChange}
                className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                rows={3}
              />
            </div>
            <div className="mb-4">
              <label
                htmlFor="expenseBranch"
                className="mb-1 block text-sm font-medium text-customBlack/70"
              >
                Branch (Optional)
              </label>
              <select
                id="expenseBranch"
                name="branchId"
                value={expenseFormData.branchId}
                onChange={handleExpenseInputChange}
                className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
              >
                <option value="">No Specific Branch</option>
                {(componentBranches ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant={"outline" as any}
                onClick={() => setIsAddExpenseModalOpen(false)}
                disabled={isSubmittingExpense}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleAddExpense}
                disabled={isSubmittingExpense}
              >
                {isSubmittingExpense && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Expense
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCentralMessage && (
        <div className="flex h-[400px] flex-col items-center justify-center text-customBlack/70">
          {isLoadingSalesInternal && (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading {friendlyPeriodName.toLowerCase()} sales details...
            </>
          )}
          {componentError && !isLoadingSalesInternal && (
            <div className="text-center text-red-500">
              <AlertCircle className="mx-auto mb-2 h-8 w-8" />{" "}
              <p>{componentError}</p>{" "}
              <Button
                type="button"
                onClick={() =>
                  fetchSalesDataForPeriodInternal(activeDisplayPeriod)
                }
                variant={"outline" as any}
                size="sm"
                className="mt-4"
              >
                Try Again
              </Button>{" "}
            </div>
          )}
          {!isLoadingSalesInternal &&
            !componentError &&
            totalSalesForPeriod === 0 &&
            totalExpensesForPeriod === 0 &&
            chartDataItems.length === 0 && (
              <p className="text-center italic text-customBlack/60">
                No {friendlyPeriodName.toLowerCase()} sales or expense data
                available for the selected period.
              </p>
            )}
          {!isLoadingSalesInternal &&
            !componentError &&
            totalSalesForPeriod === 0 &&
            totalExpensesForPeriod > 0 &&
            chartDataItems.length === 0 && (
              <p className="text-center italic text-customBlack/60">
                No {friendlyPeriodName.toLowerCase()} sales data available for
                charting, but there are expenses recorded.
              </p>
            )}
          {!isLoadingSalesInternal &&
            !componentError &&
            !showPaymentChart &&
            !showBranchChart &&
            (totalSalesForPeriod > 0 || totalExpensesForPeriod > 0) && // Check if there's *any* data to show
            chartDataItems.length === 0 && // but still no chart data
            !(totalSalesForPeriod === 0 && totalExpensesForPeriod === 0) && ( // and it's not the 'absolutely no data' case
              <p className="text-center italic text-customBlack/60">
                Data available, but cannot be displayed as a chart for this
                period.
              </p>
            )}
        </div>
      )}

      {/* Sales Summary and Charts */}
      {/* Only render this section if there is some data to show (either sales, expenses, or chart items) */}
      {(!showCentralMessage ||
        totalSalesForPeriod > 0 ||
        totalExpensesForPeriod > 0 ||
        chartDataItems.length > 0) &&
        salesData && ( // Also ensure salesData is not null (implies loading/error state handled by central message)
          <>
            {/* Sales Summary Block */}
            {/* Show summary block if there are sales OR expenses */}
            {showSummary && (
              <div className="mb-6 rounded-md border border-customGray bg-customLightBlue p-4">
                <p className="flex flex-wrap justify-between gap-x-4 text-lg text-customBlack">
                  <span>Total Sales ({currentPeriodRangeString}):</span>
                  <span className="font-bold text-customDarkPink">
                    {formatCurrencyPHP(totalSalesForPeriod)}
                  </span>
                </p>
                <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-lg text-red-600">
                  {" "}
                  {/* Changed text color to red for expenses */}
                  <span>Total Expenses ({currentPeriodRangeString}):</span>
                  <span className="font-bold">
                    {" "}
                    {/* Bold already handled by parent class */}
                    {formatCurrencyPHP(totalExpensesForPeriod)}
                  </span>
                </p>
                {/* Display Net only if there are sales or expenses */}
                {(totalSalesForPeriod !== 0 ||
                  totalExpensesForPeriod !== 0) && (
                  <p
                    className={`mt-2 flex flex-wrap justify-between gap-x-4 text-lg font-bold ${totalSalesForPeriod - totalExpensesForPeriod >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    <span>Net Profit ({currentPeriodRangeString}):</span>
                    <span>
                      {formatCurrencyPHP(
                        totalSalesForPeriod - totalExpensesForPeriod,
                      )}
                    </span>
                  </p>
                )}
                {/* Payment Breakdown Details - Only relevant if there are sales */}
                {totalSalesForPeriod > 0 && (
                  <details className="mt-4 text-sm">
                    <summary className="cursor-pointer font-medium text-customBlack/80 hover:text-customBlack">
                      View Payment Breakdown ({currentPeriodRangeString} - Sales
                      Only)
                    </summary>
                    <div className="mt-2 space-y-1 border-l-2 border-customDarkPink/50 pl-2">
                      <p className="flex justify-between">
                        <span>Cash:</span>
                        <span className="font-medium">
                          {formatCurrencyPHP(paymentTotalsForPeriod.cash)}
                        </span>
                      </p>
                      <p className="flex justify-between">
                        <span>E-Wallet:</span>
                        <span className="font-medium">
                          {formatCurrencyPHP(paymentTotalsForPeriod.ewallet)}
                        </span>
                      </p>
                      <p className="flex justify-between">
                        <span>Bank:</span>
                        <span className="font-medium">
                          {formatCurrencyPHP(paymentTotalsForPeriod.bank)}
                        </span>
                      </p>
                      {paymentTotalsForPeriod.unknown > 0 && (
                        <p className="flex justify-between">
                          <span>Unknown:</span>
                          <span className="font-medium">
                            {formatCurrencyPHP(paymentTotalsForPeriod.unknown)}
                          </span>
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}

            {showPaymentChart && (
              <div className="mb-6">
                <h3 className="mb-2 text-base font-semibold text-customBlack">
                  {friendlyPeriodName} Sales Breakdown by Payment Method
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    debounce={150}
                  >
                    <MemoizedBarChart
                      data={chartDataItems}
                      margin={{ top: 5, right: 5, left: -20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#D9D9D950" />
                      <XAxis
                        dataKey="periodLabel"
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: "#2E2A2A30" }}
                        stroke="#2E2A2A90"
                      />
                      <YAxis
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: "#2E2A2A30" }}
                        tickFormatter={formatCurrencyPHPNoDecimal}
                        stroke="#2E2A2A90"
                      />
                      <Tooltip
                        content={<CustomStackedPaymentTooltip />}
                        cursor={{ fill: "#BCDCED40" }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconSize={10}
                        wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
                      />
                      {chartDataItems.some((d) => d.unknown > 0) && (
                        <Bar
                          dataKey="unknown"
                          stackId="sales"
                          name="Unknown"
                          fill={paymentMethodColors.unknown}
                          isAnimationActive={false}
                        />
                      )}
                      <Bar
                        dataKey="bank"
                        stackId="sales"
                        name="Bank Transfer"
                        fill={paymentMethodColors.bank}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="ewallet"
                        stackId="sales"
                        name="E-Wallet"
                        fill={paymentMethodColors.ewallet}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="cash"
                        stackId="sales"
                        name="Cash"
                        fill={paymentMethodColors.cash}
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                    </MemoizedBarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {showBranchChart && ( // Only show chart if there are chart data items AND branches
              <div className="mb-4">
                <h3 className="mb-2 text-base font-semibold text-customBlack">
                  {friendlyPeriodName} Sales Breakdown by Branch
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    debounce={150}
                  >
                    {/* Use MemoizedBarChart here */}
                    <MemoizedBarChart
                      data={chartDataItems}
                      margin={{ top: 5, right: 5, left: -20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#D9D9D950" />
                      <XAxis
                        dataKey="periodLabel"
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: "#2E2A2A30" }}
                        stroke="#2E2A2A90"
                      />
                      <YAxis
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: "#2E2A2A30" }}
                        tickFormatter={formatCurrencyPHPNoDecimal}
                        stroke="#2E2A2A90"
                      />
                      <Tooltip
                        content={<CustomStackedBranchTooltip />}
                        cursor={{ fill: "#BCDCED40" }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconSize={10}
                        wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
                      />
                      {(componentBranches ?? []).map((branch, index, arr) => (
                        <Bar
                          key={`branch-bar-${branch.id}`}
                          dataKey={`branchPeriodSales.${branch.title}`}
                          stackId="branchSales" // All branches share the same stack ID
                          name={branch.title}
                          fill={branchColorMap[branch.title]}
                          radius={
                            index === arr.length - 1 ? [4, 4, 0, 0] : undefined
                          }
                          isAnimationActive={false}
                        />
                      ))}
                    </MemoizedBarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {/* Message if branch chart cannot be shown due to missing branch data, but sales data items exist */}
            {!showBranchChart &&
              !showCentralMessage &&
              chartDataItems.length > 0 &&
              (componentBranches?.length ?? 0) === 0 && (
                <div className="mb-4 py-4 text-center italic text-customBlack/60">
                  Branch data is not available to display breakdown by branch.
                </div>
              )}
          </>
        )}
    </div>
  );
}
