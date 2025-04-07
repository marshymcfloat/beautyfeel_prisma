// components/ui/ExpandedSales.tsx
"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend, // Import Legend
} from "recharts";
import Button from "../Buttons/Button"; // Adjust path
import {
  Banknote,
  CreditCard,
  Landmark,
  HelpCircle,
  CalendarDays,
} from "lucide-react";
// Import the DETAILED monthly type
import {
  MonthlySalesWithPaymentBreakdown,
  PaymentMethodTotals,
} from "@/lib/Types";

type SalesDetailsProps = {
  // Use the new detailed monthly type
  monthlyData: MonthlySalesWithPaymentBreakdown[];
  paymentTotals: PaymentMethodTotals; // Overall totals still useful for summary
  grandTotal: number;
  isLoading: boolean;
  onClose: () => void;
};

// Helper to format currency in PHP (assumes value is ALREADY in Pesos)
const formatCurrencyPHP = (
  value: number,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
) => {
  if (value === undefined || value === null) return "₱0.00";
  // REMOVED division by 100
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits,
    maximumFractionDigits,
  });
};
const formatCurrencyPHPNoDecimal = (value: number) =>
  formatCurrencyPHP(value, 0, 0);

// --- Define Colors for Stacked Bars ---
const paymentMethodColors = {
  cash: "#C28583", // customDarkPink
  ewallet: "#60A5FA", // Tailwind blue-500 (Placeholder - consider adding a custom blue)
  bank: "#34D399", // Tailwind emerald-400 (Placeholder - consider adding a custom green)
  unknown: "#D9D9D9", // customGray
};

// --- Custom Tooltip for Stacked Bar Chart ---
const CustomStackedTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Calculate total for the specific month stack being hovered
    const total = payload.reduce(
      (sum: number, entry: any) => sum + (entry.value || 0),
      0,
    );
    return (
      <div className="min-w-[150px] rounded border bg-customOffWhite p-2 text-sm shadow-md">
        <p className="mb-1 border-b border-customGray pb-1 font-semibold text-customBlack">
          {label}
        </p>
        <div className="space-y-0.5">
          {payload.map((entry: any) =>
            // Ensure value exists before formatting
            entry.value ? (
              <p
                key={`tooltip-${entry.dataKey}`}
                style={{ color: entry.color || entry.fill }}
              >
                {entry.name}: {formatCurrencyPHPNoDecimal(entry.value)}
              </p>
            ) : null,
          )}
          {/* Display total only if it's greater than 0 or if needed */}
          {total > 0 && (
            <p className="mt-1 border-t border-customGray pt-1 font-medium text-customBlack">
              Total: {formatCurrencyPHPNoDecimal(total)}
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Helper component for payment breakdown item
const PaymentBreakdownItem = ({
  icon: Icon,
  label,
  amount,
}: {
  icon: React.ElementType;
  label: string;
  amount: number;
}) => (
  // Use smaller padding for items within the monthly breakdown
  <div className="flex items-center justify-between rounded border border-customGray/50 bg-customWhiteBlue px-3 py-1.5">
    <span className="flex items-center gap-2 text-sm text-customBlack">
      <Icon size={16} className="text-customDarkPink" /> {label}
    </span>
    <span className="text-sm font-semibold text-customBlack">
      {formatCurrencyPHP(amount)}
    </span>
  </div>
);

// --- Component --- RENAMED export default function
export default function ExpandedSales({
  monthlyData,
  paymentTotals,
  grandTotal,
  isLoading,
  onClose,
}: SalesDetailsProps) {
  // Prepare data for the stacked chart
  const chartData = monthlyData;

  console.log(monthlyData);

  return (
    <>
      {" "}
      {isLoading ? ( // Line 84 from error message
        <div className="flex h-[400px] items-center justify-center text-customBlack/70">
          Loading details...
        </div>
      ) : (
        // Scrollable container
        <div className="max-h-[75vh] overflow-y-auto pr-2">
          {/* Overall Summary Section */}
          <div className="mb-6 rounded-md border border-customGray bg-customLightBlue p-4">
            <p className="flex flex-wrap justify-between gap-x-4 text-lg text-customBlack">
              <span>Total Sales (Last 6 Months):</span>
              <span className="font-bold text-customDarkPink">
                {formatCurrencyPHP(grandTotal)}
              </span>
            </p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-medium text-customBlack/80 hover:text-customBlack">
                View Overall Payment Breakdown
              </summary>
              <div className="mt-2 space-y-1 border-l-2 border-customDarkPink/50 pl-2">
                <p className="flex justify-between">
                  <span>Cash:</span>{" "}
                  <span className="font-medium">
                    {formatCurrencyPHP(paymentTotals.cash)}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span>E-Wallet:</span>{" "}
                  <span className="font-medium">
                    {formatCurrencyPHP(paymentTotals.ewallet)}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span>Bank:</span>{" "}
                  <span className="font-medium">
                    {formatCurrencyPHP(paymentTotals.bank)}
                  </span>
                </p>
                {paymentTotals.unknown > 0 && (
                  <p className="flex justify-between">
                    <span>Unknown:</span>{" "}
                    <span className="font-medium">
                      {formatCurrencyPHP(paymentTotals.unknown)}
                    </span>
                  </p>
                )}
              </div>
            </details>
          </div>

          {/* Stacked Bar Chart Section */}
          <div className="mb-4">
            <h3 className="mb-2 text-base font-semibold text-customBlack">
              Monthly Sales Breakdown by Payment Method
            </h3>
            {chartData.length > 0 ? (
              <div className="h-[300px]">
                {" "}
                {/* Allocate height for chart + legend */}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 5, right: 5, left: -20, bottom: 20 }} // Adjusted left margin
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#D9D9D950" />
                    <XAxis
                      dataKey="month"
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: "#2E2A2A30" }} // Light axis line
                      stroke="#2E2A2A90" // Darker tick text
                    />
                    <YAxis
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: "#2E2A2A30" }}
                      tickFormatter={formatCurrencyPHPNoDecimal} // Use no decimals for axis
                      stroke="#2E2A2A90"
                    />
                    <Tooltip
                      content={<CustomStackedTooltip />} // Use the stacked tooltip
                      cursor={{ fill: "#BCDCED40" }} // customLightBlue opacity
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconSize={10}
                      wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
                    />

                    {/* Define STACKED Bars - one for each payment method */}
                    {/* Use radius only on the first bar in the stack */}
                    <Bar
                      dataKey="cash"
                      stackId="a"
                      name="Cash"
                      fill={paymentMethodColors.cash}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="ewallet"
                      stackId="a"
                      name="E-Wallet"
                      fill={paymentMethodColors.ewallet}
                    />
                    <Bar
                      dataKey="bank"
                      stackId="a"
                      name="Bank Transfer"
                      fill={paymentMethodColors.bank}
                    />
                    {/* Only include 'unknown' bar if there's potentially data */}
                    {/* Check if ANY month has unknown data, or use overall total as proxy */}
                    {chartData.some((d) => d.unknown > 0) ||
                    paymentTotals.unknown > 0 ? (
                      <Bar
                        dataKey="unknown"
                        stackId="a"
                        name="Unknown"
                        fill={paymentMethodColors.unknown}
                      />
                    ) : null}
                    {/* Removed complex radius logic for simplicity */}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-4 text-center italic text-customBlack/60">
                No monthly data to display chart.
              </p>
            )}
          </div>
        </div> // End scrollable div
      )}
      {/* Close Button */}
      <div className="mt-6 flex justify-end border-t border-customGray pt-4">
        <Button type="button" onClick={onClose} invert={true}>
          Close
        </Button>
      </div>
    </>
  );
}
