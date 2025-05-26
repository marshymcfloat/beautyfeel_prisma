// components/ui/ExpandedSales.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import Button from "../Buttons/Button"; // Adjust path
import {
  AlertCircle,
  Loader2,
  PlusCircle,
  CalendarDays,
  Tag,
  DollarSign,
} from "lucide-react"; // Icons

import {
  MonthlySales, // Now includes totalExpenses
  PaymentMethodTotals,
  // Assuming ExpenseCategory is from lib/Types
  ExpenseCategory, // Ensure ExpenseCategory is imported from your types file
} from "@/lib/Types"; // Adjust path as needed

// Importing types directly from Prisma client (if used for component props/state)
import { Branch } from "@prisma/client"; // Import Branch from Prisma Client

// Assuming server actions are imported
// Only import createExpense now
import { createExpense } from "@/lib/ServerAction"; // Adjust path as needed

// --- Define Colors ---
const paymentMethodColors = {
  cash: "#C28583", // customDarkPink
  ewallet: "#60A5FA", // Example blue
  bank: "#34D399", // Example green
  unknown: "#D9D9D9", // customGray
};

// Define a set of colors for branches (add more if needed)
const branchColors = [
  "#7B68EE", // MediumSlateBlue
  "#FF7F50", // Coral
  "#6495ED", // CornflowerBlue
  "#DC143C", // Crimson
  "#00CED1", // DarkTurquoise
  "#FFD700", // Gold
  "#32CD32", // LimeGreen
  "#FF69B4", // HotPink
  "#8A2BE2", // BlueViolet
  "#BA55D3", // MediumOrchid
  "#CD5C5C", // IndianRed
  "#4682B4", // SteelBlue
];
// --- End Define Colors ---

// Helper to format currency in PHP (assumes value is ALREADY in Pesos)
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

// --- Custom Tooltip for Monthly Sales by Payment Method (Stacked) ---
const CustomStackedPaymentTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Filter out entries with zero or null/undefined value for cleaner tooltip
    const validEntries = payload.filter(
      (entry: any) =>
        entry.value !== undefined && entry.value !== null && entry.value > 0,
    );

    // If no valid sales entries, maybe hide tooltip or show only expenses
    if (validEntries.length === 0) {
      // Check if there are expenses for this month to still show something
      const monthlyDataPoint: MonthlySales | undefined = payload[0]?.payload;
      const totalExpenses = monthlyDataPoint?.totalExpenses ?? 0;
      if (totalExpenses === 0) return null; // If no sales and no expenses, show nothing

      // Otherwise, return a tooltip showing only expenses
      return (
        <div className="min-w-[150px] rounded border bg-customOffWhite p-2 text-sm shadow-md">
          <p className="mb-1 border-b border-customGray pb-1 font-semibold text-customBlack">
            {label} {/* Month Label */}
          </p>
          <p className="mt-1 border-t border-customGray pt-1 font-medium text-red-600">
            Expenses Total: {formatCurrencyPHPNoDecimal(totalExpenses)}
          </p>
        </div>
      );
    }

    // Get the original data object for the hovered month
    const monthlyDataPoint: MonthlySales | undefined = payload[0]?.payload;
    const totalExpenses = monthlyDataPoint?.totalExpenses ?? 0;

    const totalSales = validEntries.reduce(
      (sum: number, entry: any) => sum + (entry.value || 0),
      0,
    );
    const net = totalSales - totalExpenses; // Calculate Net Profit/Loss

    return (
      <div className="min-w-[150px] rounded border bg-customOffWhite p-2 text-sm shadow-md">
        <p className="mb-1 border-b border-customGray pb-1 font-semibold text-customBlack">
          {label} {/* Month Label */}
        </p>
        <div className="space-y-0.5">
          {/* Display Monthly Sales Breakdown */}
          {validEntries.map((entry: any) => (
            <p
              key={`tooltip-stacked-payment-${entry.dataKey}`}
              style={{ color: entry.color || entry.fill }}
            >
              {entry.name}: {formatCurrencyPHPNoDecimal(entry.value)}
            </p>
          ))}
          {/* Display Monthly Total Sales */}
          <p className="mt-1 border-t border-customGray pt-1 font-medium text-customBlack">
            Sales Total: {formatCurrencyPHPNoDecimal(totalSales)}
          </p>
          {/* --- Display Monthly Total Expenses --- */}
          {totalExpenses > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-red-600">
              Expenses Total: {formatCurrencyPHPNoDecimal(totalExpenses)}
            </p>
          )}
          {/* --- Display Net Profit/Loss --- */}
          <p
            className={`mt-1 border-t border-customGray pt-1 font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            Net: {formatCurrencyPHPNoDecimal(net)}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

// --- Custom Tooltip for Monthly Sales by Branch (Stacked) ---
const CustomStackedBranchTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Filter out entries with zero or null/undefined value for cleaner tooltip
    const validEntries = payload.filter(
      (entry: any) =>
        entry.value !== undefined && entry.value !== null && entry.value > 0,
    );
    if (validEntries.length === 0) return null; // Hide tooltip if no sales value

    // Get the original data object for the hovered month
    const monthlyDataPoint: MonthlySales | undefined = payload[0]?.payload;
    const totalExpenses = monthlyDataPoint?.totalExpenses ?? 0;

    const totalSales = validEntries.reduce(
      (sum: number, entry: any) => sum + (entry.value || 0),
      0,
    );
    const net = totalSales - totalExpenses;

    return (
      <div className="min-w-[150px] rounded border bg-customOffWhite p-2 text-sm shadow-md">
        <p className="mb-1 border-b border-customGray pb-1 font-semibold text-customBlack">
          {label} {/* Month Label */}
        </p>
        <div className="space-y-0.5">
          {/* --- FIX START: Explicitly type sort parameters --- */}
          {validEntries
            .sort(
              (a: { value: number }, b: { value: number }) => b.value - a.value,
            ) // Sort branches by sales value, explicitly typing a and b
            // --- FIX END ---
            .map(
              (
                entry: any, // Map still uses any for the full entry object structure
              ) => (
                <p
                  key={`tooltip-stacked-branch-${entry.dataKey}`}
                  style={{ color: entry.color || entry.fill }}
                >
                  {entry.name}: {formatCurrencyPHPNoDecimal(entry.value)}
                </p>
              ),
            )}
          {totalSales > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-customBlack">
              Sales Total: {formatCurrencyPHPNoDecimal(totalSales)}
            </p>
          )}
          {/* --- Display Monthly Total Expenses in Branch Tooltip too if desired --- */}
          {totalExpenses > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-red-600">
              Expenses Total: {formatCurrencyPHPNoDecimal(totalExpenses)}
            </p>
          )}
          {/* --- Display Net Profit/Loss --- */}
          <p
            className={`mt-1 border-t border-customGray pt-1 font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            Net: {formatCurrencyPHPNoDecimal(net)}
          </p>
        </div>
      </div>
    );
  }
  return null;
};
// --- END Custom Tooltips ---

// --- Component ---
type SalesDetailsProps = {
  monthlyData: MonthlySales[]; // Now includes totalExpenses per month
  paymentTotals: PaymentMethodTotals;
  grandTotal: number; // Total Sales
  overallTotalExpenses: number; // Overall Total Expenses
  isLoading: boolean; // Initial loading state from parent
  onClose: () => void;
  isOwner: boolean; // Flag if the user is an owner (to show add expense)
  branches: Branch[]; // List of all Branch objects (id, title, maybe code)
  onDataRefresh: () => Promise<void>; // Callback to refresh data in parent
  loggedInUserId: string; // Pass the user ID who is recording the sale/expense
};

// Initial form state for Expense
const initialExpenseFormState = {
  date: new Date().toISOString().split("T")[0], // Default to current date YYYY-MM-DD
  amount: "", // Keep as string for input binding (convert to number on submit)
  // Default to first category - ensure ExpenseCategory is imported and has values
  category: Object.values(ExpenseCategory)[0] as ExpenseCategory, // Cast to enum type
  description: "", // Keep as string for input binding
  branchId: "", // Empty string for "No Specific Branch" or Branch ID
};

export default function ExpandedSales({
  monthlyData,
  paymentTotals,
  grandTotal, // Total Sales
  overallTotalExpenses, // Overall Total Expenses
  isLoading,
  onClose,
  isOwner,
  branches, // Use the prop name here (array of {id, title, code?})
  onDataRefresh,
  loggedInUserId,
}: SalesDetailsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false); // State for refreshing data
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false); // State for expense modal visibility
  const [actionError, setActionError] = useState<string | null>(null); // State for action-specific errors (e.g., from createExpense)

  // Expense form states
  const [expenseFormData, setExpenseFormData] = useState(
    initialExpenseFormState,
  );

  // Reset expense form state when modal opens
  useEffect(() => {
    if (isAddExpenseModalOpen) {
      setExpenseFormData(initialExpenseFormState);
      setActionError(null); // Clear error on modal open
    }
  }, [isAddExpenseModalOpen]);

  // Effects to log prop changes for debugging
  useEffect(() => {
    console.log("[ExpandedSales] Received branches prop:", branches);
  }, [branches]);
  useEffect(() => {
    console.log(
      "[ExpandedSales] Received overallTotalExpenses prop:",
      overallTotalExpenses,
    );
    console.log(
      "[ExpandedSales] Received monthlyData (with expenses):",
      monthlyData,
    );
  }, [overallTotalExpenses, monthlyData]);
  useEffect(() => {
    console.log("[ExpandedSales] Rendered with props:", {
      monthlyDataCount: monthlyData?.length,
      grandTotal,
      overallTotalExpenses,
      isLoadingInitial: isLoading,
      isOwner,
      branchesCount: branches?.length,
      branchTitles: branches?.map((b) => b.title),
      loggedInUserId,
    });
  }, [
    monthlyData,
    grandTotal,
    overallTotalExpenses,
    isLoading,
    isOwner,
    branches,
    loggedInUserId,
  ]);

  // Use monthlyData directly as chart data source
  const monthlyChartData = monthlyData;

  // Memoized map to get branch colors based on branch titles
  const branchColorMap = useMemo(() => {
    const map: { [key: string]: string } = {};
    // Ensure branches is not null or undefined before mapping
    (branches ?? []).forEach((branch, index) => {
      map[branch.title] = branchColors[index % branchColors.length];
    });
    console.log("[ExpandedSales] Branch Color Map created:", map);
    return map;
  }, [branches]); // Depend on the branches array

  // Determine overall loading or error state for the main view
  const isEffectivelyLoading = isLoading || isRefreshing; // Consider initial load and action refreshing as loading
  const isAnyError = actionError != null; // Check for action-specific errors (displayed in modal or above chart)

  // Conditions for showing charts vs central message
  const showMonthlyPaymentChart =
    !isEffectivelyLoading && monthlyChartData.length > 0;
  const showMonthlyBranchChart =
    !isEffectivelyLoading && monthlyChartData.length > 0 && branches.length > 0; // Only show branch chart if branches data is available

  // Show central message if loading, has a non-action-specific error, or no data
  const showCentralMessage =
    isEffectivelyLoading ||
    // We only show the central message for initial load/no data errors, not action errors which are displayed elsewhere
    // (modal for add expense, or above chart for other actions if needed)
    (!isEffectivelyLoading && monthlyChartData.length === 0);

  // --- Form Change Handlers ---
  const handleExpenseInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    // Keep amount as string for state, as input type="number" binds strings
    // We'll convert to number during validation/submission
    const updatedValue = value;
    setExpenseFormData((prev) => ({ ...prev, [name]: updatedValue }));
  };
  // --- End Form Change Handlers ---

  // --- Submission Handler (Add Expense) ---
  const handleAddExpense = async () => {
    setActionError(null); // Clear previous action errors

    // Client-side validation before sending to server
    if (!expenseFormData.date) {
      setActionError("Please select a date.");
      return;
    }
    // Validate amount string before converting
    const amountNum = Number(expenseFormData.amount);
    if (
      expenseFormData.amount === "" ||
      isNaN(amountNum) ||
      amountNum <= 0 || // Amount must be positive
      !isFinite(amountNum) // Check for Infinity, -Infinity, NaN
    ) {
      setActionError("Please enter a valid positive amount.");
      return;
    }
    if (!expenseFormData.category) {
      setActionError("Please select an expense category.");
      return;
    }
    // Ensure loggedInUserId is available before proceeding
    if (!loggedInUserId) {
      setActionError("User not logged in. Cannot record expense.");
      console.error("Logged-in user ID is missing during expense submission.");
      return; // Stop submission
    }

    setIsRefreshing(true); // Indicate that an action is in progress (saving/refreshing)

    try {
      // Prepare data for the server action
      const dataToSend = {
        date: expenseFormData.date, // YYYY-MM-DD string
        amount: amountNum, // Validated number
        category: expenseFormData.category, // Valid ExpenseCategory enum value
        description:
          expenseFormData.description === ""
            ? null
            : expenseFormData.description, // Convert empty string description to null
        recordedById: loggedInUserId, // User ID of the person adding the expense
        branchId:
          expenseFormData.branchId === "" ? null : expenseFormData.branchId, // Convert empty string branch ID to null
      };

      console.log(
        "[ExpandedSales] Calling createExpense with data:",
        dataToSend,
      );
      // Call the server action
      // Assuming createExpense returns { success: true, expenseId: string } or { success: false, error: string }
      const result:
        | { success: true; expenseId: string }
        | { success: false; error: string } = await createExpense(dataToSend);

      if (result.success) {
        console.log(
          "[ExpandedSales] Expense added successfully:",
          result.expenseId,
        );
        // Close the modal and trigger data refresh in the parent component
        setIsAddExpenseModalOpen(false);
        await onDataRefresh(); // Refresh data (will set parent's loading state)
      } else {
        // Handle server-side error from createExpense
        console.error("[ExpandedSales] Failed to add expense:", result.error);
        setActionError(`Failed to add expense: ${result.error}`); // Display the error message returned by the server
      }
    } catch (error: any) {
      // Catch unexpected errors during the action execution (e.g., network issues, uncaught server errors)
      console.error("[ExpandedSales] Error calling createExpense:", error);
      setActionError(
        `An unexpected error occurred: ${error.message || "Unknown error"}`,
      );
    } finally {
      // Set refreshing state to false after action completes (success or failure)
      setIsRefreshing(false);
    }
  };
  // --- End Submission Handler ---

  return (
    // The main container for the sales details view
    // max-h-[75vh] and overflow-y-auto are suitable for the content within the modal body
    <div className="max-h-[75vh] overflow-y-auto px-2">
      {/* Action Buttons (e.g., Add Expense for Owner) */}
      {isOwner && (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-customGray pb-4">
          <Button
            onClick={() => {
              setActionError(null); // Clear any previous action error before opening modal
              setIsAddExpenseModalOpen(true); // Open the Add Expense modal
            }}
            variant="outline" // Use outline variant for secondary actions
            size="sm" // Use small size
            disabled={isEffectivelyLoading} // Disable button if data is loading or refreshing
            className="text-sm"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
          </Button>
        </div>
      )}

      {/* Add Expense Modal */}
      {/* Using a simple fixed overlay for the modal */}
      {isAddExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          {/* Modal content container */}
          <div className="w-full max-w-md rounded border border-customGray bg-white p-6 shadow-lg">
            {/* Modal Title */}
            <h2 className="mb-4 text-lg font-semibold text-customBlack">
              Add Expense
            </h2>

            {/* Action Error Display (within the modal) */}
            {actionError && (
              <div className="mb-4 flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-600">
                <AlertCircle size={16} /> {actionError}
              </div>
            )}

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

            {/* Amount Input */}
            <div className="mb-4">
              <label
                htmlFor="expenseAmount"
                className="mb-1 block text-sm font-medium text-customBlack/70"
              >
                Amount (in PHP)
              </label>
              <div className="relative">
                {/* Currency Symbol */}
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-customBlack/70">
                  ₱
                </span>
                <input
                  type="number" // Use number type for numeric input
                  id="expenseAmount"
                  name="amount"
                  value={expenseFormData.amount} // Bind to string state value
                  onChange={handleExpenseInputChange}
                  className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 pl-8 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                  step="0.01" // Allow decimal cents
                  min="0" // Allow 0, validation handles positive requirement
                  required
                />
              </div>
            </div>

            {/* Category Select */}
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
                value={expenseFormData.category} // Bind to category state value
                onChange={handleExpenseInputChange}
                className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                required
              >
                {/* Map through ExpenseCategory enum values */}
                {Object.values(ExpenseCategory).map((category) => (
                  <option key={category} value={category}>
                    {/* Format category name (e.g., "RENT" -> "Rent", "UTILITIES" -> "Utilities") */}
                    {category.charAt(0).toUpperCase() +
                      category.slice(1).toLowerCase().replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            {/* Description Textarea */}
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
                value={expenseFormData.description} // Bind to description state value
                onChange={handleExpenseInputChange}
                className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
                rows={3}
              />
            </div>

            {/* Branch Select */}
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
                value={expenseFormData.branchId} // Bind to branchId state value
                onChange={handleExpenseInputChange}
                className="w-full rounded border border-customGray bg-customOffWhite/70 p-2 text-customBlack/80 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink"
              >
                <option value="">No Specific Branch</option>{" "}
                {/* Option for null branchId */}
                {(branches ?? []).map(
                  (
                    branch, // Use branches prop directly
                  ) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.title}
                    </option>
                  ),
                )}
              </select>
            </div>

            {/* Modal Action Buttons */}
            <div className="mt-6 flex justify-end gap-2">
              {/* Cancel Button */}
              <Button
                type="button" // Use type="button" to prevent form submission
                variant="outline"
                onClick={() => setIsAddExpenseModalOpen(false)} // Close modal handler
                disabled={isRefreshing} // Disable while action is in progress
              >
                Cancel
              </Button>
              {/* Save Expense Button */}
              <Button
                type="button" // Use type="button" to prevent form submission
                onClick={handleAddExpense} // Handle save action
                disabled={isRefreshing} // Disable while saving/refreshing
              >
                {" "}
                {isRefreshing && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Expense
              </Button>
            </div>
            {/* End form content */}
          </div>
          {/* End Modal content container */}
        </div>
      )}
      {/* End Add Expense Modal */}

      {/* Central Loading/Error/No Data Message */}
      {/* Show this message if data is loading, or if data is loaded but there's no monthly data */}
      {showCentralMessage && (
        // Action errors are handled separately, usually within the modal or explicitly above a section
        // You might display actionError here if it's not handled inside a modal.
        // If actionError is only for the expense modal, it won't show here.
        // If it could be for other actions, you'd check `!isAnyError` for showing this block
        // or display actionError in a separate dedicated alert area.
        // Let's assume actionError is only for the modal for now.
        <div className="flex h-[400px] flex-col items-center justify-center text-customBlack/70">
          {isEffectivelyLoading && (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {/* Adjust loading message based on state */}
              {
                isLoading // Initial load state from parent
                  ? "Loading sales details..."
                  : isRefreshing // Refreshing state triggered by actions
                    ? "Refreshing data..."
                    : "Loading..." // Fallback
              }
            </>
          )}
          {!isEffectivelyLoading && monthlyChartData.length === 0 && (
            <p className="text-center italic text-customBlack/60">
              No sales data available for the last 6 months.
            </p>
          )}
        </div>
      )}

      {/* Sales Summary and Charts Section */}
      {/* Render charts and summary only if not loading and there's monthly data */}
      {!showCentralMessage && ( // Only render if the central message is NOT shown
        <>
          {/* Overall Summary Section */}
          <div className="mb-6 rounded-md border border-customGray bg-customLightBlue p-4">
            <p className="flex flex-wrap justify-between gap-x-4 text-lg text-customBlack">
              <span>Total Sales (Last 6 Months):</span>
              <span className="font-bold text-customDarkPink">
                {formatCurrencyPHP(grandTotal)}
              </span>
            </p>
            <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-lg text-customBlack">
              <span>Total Expenses (Last 6 Months):</span>
              <span className="font-bold text-red-600">
                {formatCurrencyPHP(overallTotalExpenses)}
              </span>
            </p>
            {/* Optional: Display Net Profit */}
            {(grandTotal !== 0 || overallTotalExpenses !== 0) && ( // Only show Net if there were sales or expenses
              <p
                className={`mt-2 flex flex-wrap justify-between gap-x-4 text-lg font-bold ${grandTotal - overallTotalExpenses >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                <span>Net Profit (Last 6 Months):</span>
                <span>
                  {formatCurrencyPHP(grandTotal - overallTotalExpenses)}
                </span>
              </p>
            )}
            {/* Overall Payment Breakdown Details */}
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-customBlack/80 hover:text-customBlack">
                View Overall Payment Breakdown (Sales Only)
              </summary>
              <div className="mt-2 space-y-1 border-l-2 border-customDarkPink/50 pl-2">
                <p className="flex justify-between">
                  <span>Cash:</span>
                  <span className="font-medium">
                    {formatCurrencyPHP(paymentTotals.cash)}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span>E-Wallet:</span>
                  <span className="font-medium">
                    {formatCurrencyPHP(paymentTotals.ewallet)}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span>Bank:</span>
                  <span className="font-medium">
                    {formatCurrencyPHP(paymentTotals.bank)}
                  </span>
                </p>
                {/* Only show Unknown if there's a value */}
                {paymentTotals.unknown > 0 && (
                  <p className="flex justify-between">
                    <span>Unknown:</span>
                    <span className="font-medium">
                      {formatCurrencyPHP(paymentTotals.unknown)}
                    </span>
                  </p>
                )}
              </div>
            </details>
          </div>

          {/* Monthly Sales Breakdown by Payment Method Chart */}
          {showMonthlyPaymentChart && (
            <div className="mb-6">
              <h3 className="mb-2 text-base font-semibold text-customBlack">
                Monthly Sales Breakdown by Payment Method
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyChartData}
                    margin={{ top: 5, right: 5, left: -20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#D9D9D950" />
                    <XAxis
                      dataKey="month"
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
                    {/* Bar for Cash Sales */}
                    <Bar
                      dataKey="cash"
                      stackId="a"
                      name="Cash"
                      fill={paymentMethodColors.cash}
                      radius={[4, 4, 0, 0]} // Apply border radius to top of stack
                    />
                    {/* Bar for E-Wallet Sales */}
                    <Bar
                      dataKey="ewallet"
                      stackId="a"
                      name="E-Wallet"
                      fill={paymentMethodColors.ewallet}
                    />
                    {/* Bar for Bank Transfer Sales */}
                    <Bar
                      dataKey="bank"
                      stackId="a"
                      name="Bank Transfer"
                      fill={paymentMethodColors.bank}
                    />
                    {/* Bar for Unknown Payment Method Sales (only show if applicable) */}
                    {monthlyChartData.some((d) => d.unknown > 0) && (
                      <Bar
                        dataKey="unknown"
                        stackId="a"
                        name="Unknown"
                        fill={paymentMethodColors.unknown}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Monthly Sales Breakdown by Branch Chart */}
          {showMonthlyBranchChart && (
            <div className="mb-4">
              <h3 className="mb-2 text-base font-semibold text-customBlack">
                Monthly Sales Breakdown by Branch
              </h3>
              {/* Only show message if chart should be shown but branches array is empty */}
              {monthlyChartData.length > 0 && branches.length === 0 && (
                <p className="py-4 text-center italic text-customBlack/60">
                  No branch data available to display sales breakdown.
                </p>
              )}
              {/* Render the chart if branches are available */}
              {monthlyChartData.length > 0 && branches.length > 0 && (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyChartData}
                      margin={{ top: 5, right: 5, left: -20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#D9D9D950" />
                      <XAxis
                        dataKey="month"
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
                        wrapperStyle={{
                          fontSize: "11px",
                          paddingTop: "10px",
                        }}
                      />
                      {/* Iterate over the actual branches array to create Bar components */}
                      {(branches ?? []).map((branch, index) => (
                        <Bar
                          key={`branch-bar-${branch.id}`} // Use branch.id for unique key
                          dataKey={`branchMonthlySales.${branch.title}`} // Data key points to the nested sales object
                          stackId="b" // Stack ID for branches
                          name={branch.title} // Display branch title in the legend and tooltip
                          fill={branchColorMap[branch.title]} // Get color from the map
                          radius={
                            index === (branches ?? []).length - 1 // Apply radius only to the top bar (last in the loop)
                              ? [4, 4, 0, 0]
                              : undefined
                          }
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Close Button (only shown when not loading) */}
      {!isEffectivelyLoading && (
        <div className="mt-6 flex justify-end border-t border-customGray pt-4">
          <Button type="button" onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
