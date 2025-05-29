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
import Button from "../Buttons/Button";
import {
  AlertCircle,
  Loader2,
  PlusCircle,
  CalendarDays,
  Tag,
  DollarSign,
} from "lucide-react";

import {
  MonthlySales,
  PaymentMethodTotals,
  ExpenseCategory,
} from "@/lib/Types";

import { Branch } from "@prisma/client";

import { createExpense } from "@/lib/ServerAction";

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

const CustomStackedPaymentTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const validEntries = payload.filter(
      (entry: any) =>
        entry.value !== undefined && entry.value !== null && entry.value > 0,
    );

    if (validEntries.length === 0) {
      const monthlyDataPoint: MonthlySales | undefined = payload[0]?.payload;
      const totalExpenses = monthlyDataPoint?.totalExpenses ?? 0;
      if (totalExpenses === 0) return null;

      return (
        <div className="min-w-[150px] rounded border bg-customOffWhite p-2 text-sm shadow-md">
          <p className="mb-1 border-b border-customGray pb-1 font-semibold text-customBlack">
            {label} {}
          </p>
          <p className="mt-1 border-t border-customGray pt-1 font-medium text-red-600">
            Expenses Total: {formatCurrencyPHPNoDecimal(totalExpenses)}
          </p>
        </div>
      );
    }

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
          {label} {}
        </p>
        <div className="space-y-0.5">
          {}
          {validEntries.map((entry: any) => (
            <p
              key={`tooltip-stacked-payment-${entry.dataKey}`}
              style={{ color: entry.color || entry.fill }}
            >
              {entry.name}: {formatCurrencyPHPNoDecimal(entry.value)}
            </p>
          ))}
          {}
          <p className="mt-1 border-t border-customGray pt-1 font-medium text-customBlack">
            Sales Total: {formatCurrencyPHPNoDecimal(totalSales)}
          </p>
          {}
          {totalExpenses > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-red-600">
              Expenses Total: {formatCurrencyPHPNoDecimal(totalExpenses)}
            </p>
          )}
          {}
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

const CustomStackedBranchTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const validEntries = payload.filter(
      (entry: any) =>
        entry.value !== undefined && entry.value !== null && entry.value > 0,
    );
    if (validEntries.length === 0) return null;

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
          {label} {}
        </p>
        <div className="space-y-0.5">
          {}
          {validEntries
            .sort(
              (a: { value: number }, b: { value: number }) => b.value - a.value,
            )

            .map((entry: any) => (
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
          {}
          {totalExpenses > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-red-600">
              Expenses Total: {formatCurrencyPHPNoDecimal(totalExpenses)}
            </p>
          )}
          {}
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

type SalesDetailsProps = {
  monthlyData: MonthlySales[];
  paymentTotals: PaymentMethodTotals;
  grandTotal: number;
  overallTotalExpenses: number;
  isLoading: boolean;
  onClose: () => void;
  isOwner: boolean;
  branches: Branch[];
  onDataRefresh: () => Promise<void>;
  loggedInUserId: string;
};

const initialExpenseFormState = {
  date: new Date().toISOString().split("T")[0],
  amount: "",

  category: Object.values(ExpenseCategory)[0] as ExpenseCategory,
  description: "",
  branchId: "",
};

export default function ExpandedSales({
  monthlyData,
  paymentTotals,
  grandTotal,
  overallTotalExpenses,
  isLoading,
  onClose,
  isOwner,
  branches,
  onDataRefresh,
  loggedInUserId,
}: SalesDetailsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [expenseFormData, setExpenseFormData] = useState(
    initialExpenseFormState,
  );

  useEffect(() => {
    if (isAddExpenseModalOpen) {
      setExpenseFormData(initialExpenseFormState);
      setActionError(null);
    }
  }, [isAddExpenseModalOpen]);

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

  const monthlyChartData = monthlyData;

  const branchColorMap = useMemo(() => {
    const map: { [key: string]: string } = {};

    (branches ?? []).forEach((branch, index) => {
      map[branch.title] = branchColors[index % branchColors.length];
    });
    console.log("[ExpandedSales] Branch Color Map created:", map);
    return map;
  }, [branches]);

  const isEffectivelyLoading = isLoading || isRefreshing;
  const isAnyError = actionError != null;

  const showMonthlyPaymentChart =
    !isEffectivelyLoading && monthlyChartData.length > 0;
  const showMonthlyBranchChart =
    !isEffectivelyLoading && monthlyChartData.length > 0 && branches.length > 0;

  const showCentralMessage =
    isEffectivelyLoading ||
    (!isEffectivelyLoading && monthlyChartData.length === 0);

  const handleExpenseInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    const updatedValue = value;
    setExpenseFormData((prev) => ({ ...prev, [name]: updatedValue }));
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
      console.error("Logged-in user ID is missing during expense submission.");
      return;
    }

    setIsRefreshing(true);

    try {
      const dataToSend = {
        date: expenseFormData.date,
        amount: amountNum,
        category: expenseFormData.category,
        description:
          expenseFormData.description === ""
            ? null
            : expenseFormData.description,
        recordedById: loggedInUserId,
        branchId:
          expenseFormData.branchId === "" ? null : expenseFormData.branchId,
      };

      console.log(
        "[ExpandedSales] Calling createExpense with data:",
        dataToSend,
      );

      const result:
        | { success: true; expenseId: string }
        | { success: false; error: string } = await createExpense(dataToSend);

      if (result.success) {
        console.log(
          "[ExpandedSales] Expense added successfully:",
          result.expenseId,
        );

        setIsAddExpenseModalOpen(false);
        await onDataRefresh();
      } else {
        console.error("[ExpandedSales] Failed to add expense:", result.error);
        setActionError(`Failed to add expense: ${result.error}`);
      }
    } catch (error: any) {
      console.error("[ExpandedSales] Error calling createExpense:", error);
      setActionError(
        `An unexpected error occurred: ${error.message || "Unknown error"}`,
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="max-h-[75vh] overflow-y-auto px-2">
      {}
      {isOwner && (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-customGray pb-4">
          <Button
            onClick={() => {
              setActionError(null);
              setIsAddExpenseModalOpen(true);
            }}
            variant="outline"
            size="sm"
            disabled={isEffectivelyLoading}
            className="text-sm"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
          </Button>
        </div>
      )}

      {}
      {}
      {isAddExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          {}
          <div className="w-full max-w-md rounded border border-customGray bg-white p-6 shadow-lg">
            {}
            <h2 className="mb-4 text-lg font-semibold text-customBlack">
              Add Expense
            </h2>

            {}
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

            {}
            <div className="mb-4">
              <label
                htmlFor="expenseAmount"
                className="mb-1 block text-sm font-medium text-customBlack/70"
              >
                Amount (in PHP)
              </label>
              <div className="relative">
                {}
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

            {}
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
                {}
                {Object.values(ExpenseCategory).map((category) => (
                  <option key={category} value={category}>
                    {}
                    {category.charAt(0).toUpperCase() +
                      category.slice(1).toLowerCase().replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            {}
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

            {}
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
                <option value="">No Specific Branch</option> {}
                {(branches ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.title}
                  </option>
                ))}
              </select>
            </div>

            {}
            <div className="mt-6 flex justify-end gap-2">
              {}
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddExpenseModalOpen(false)}
                disabled={isRefreshing}
              >
                Cancel
              </Button>
              {}
              <Button
                type="button"
                onClick={handleAddExpense}
                disabled={isRefreshing}
              >
                {" "}
                {isRefreshing && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Expense
              </Button>
            </div>
            {}
          </div>
          {}
        </div>
      )}
      {}

      {}
      {}
      {showCentralMessage && (
        <div className="flex h-[400px] flex-col items-center justify-center text-customBlack/70">
          {isEffectivelyLoading && (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {}
              {isLoading
                ? "Loading sales details..."
                : isRefreshing
                  ? "Refreshing data..."
                  : "Loading..."}
            </>
          )}
          {!isEffectivelyLoading && monthlyChartData.length === 0 && (
            <p className="text-center italic text-customBlack/60">
              No sales data available for the last 6 months.
            </p>
          )}
        </div>
      )}

      {}
      {}
      {!showCentralMessage && (
        <>
          {}
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
            {}
            {(grandTotal !== 0 || overallTotalExpenses !== 0) && (
              <p
                className={`mt-2 flex flex-wrap justify-between gap-x-4 text-lg font-bold ${grandTotal - overallTotalExpenses >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                <span>Net Profit (Last 6 Months):</span>
                <span>
                  {formatCurrencyPHP(grandTotal - overallTotalExpenses)}
                </span>
              </p>
            )}
            {}
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
                {}
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

          {}
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
                    {}
                    <Bar
                      dataKey="cash"
                      stackId="a"
                      name="Cash"
                      fill={paymentMethodColors.cash}
                      radius={[4, 4, 0, 0]}
                    />
                    {}
                    <Bar
                      dataKey="ewallet"
                      stackId="a"
                      name="E-Wallet"
                      fill={paymentMethodColors.ewallet}
                    />
                    {}
                    <Bar
                      dataKey="bank"
                      stackId="a"
                      name="Bank Transfer"
                      fill={paymentMethodColors.bank}
                    />
                    {}
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

          {}
          {showMonthlyBranchChart && (
            <div className="mb-4">
              <h3 className="mb-2 text-base font-semibold text-customBlack">
                Monthly Sales Breakdown by Branch
              </h3>
              {}
              {monthlyChartData.length > 0 && branches.length === 0 && (
                <p className="py-4 text-center italic text-customBlack/60">
                  No branch data available to display sales breakdown.
                </p>
              )}
              {}
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
                      {}
                      {(branches ?? []).map((branch, index) => (
                        <Bar
                          key={`branch-bar-${branch.id}`}
                          dataKey={`branchMonthlySales.${branch.title}`}
                          stackId="b"
                          name={branch.title}
                          fill={branchColorMap[branch.title]}
                          radius={
                            index === (branches ?? []).length - 1
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

      {}
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
