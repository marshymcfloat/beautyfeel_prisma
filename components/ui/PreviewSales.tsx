// components/ui/SalesPreviewChart.tsx
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
} from "recharts";

import { MonthlySales } from "@/lib/Types";
import { Eye } from "lucide-react";

type SalesPreviewProps = {
  monthlyData: MonthlySales[]; // Assumes this receives { month, yearMonth, totalSales }
  isLoading: boolean;
  onViewDetails: () => void; // Callback to open the details modal
};

// Helper to format currency in PHP (assumes value is ALREADY in Pesos) - NO decimals for preview
const formatCurrencyPHPPreview = (value: number) => {
  if (value === undefined || value === null) return "₱0";
  // REMOVED division by 100
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

// Custom Tooltip for the chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length && payload[0].value) {
    // Check value exists
    return (
      <div className="rounded border bg-customOffWhite p-2 text-sm shadow-md">
        <p className="font-semibold text-customBlack">{`${label}`}</p>
        <p className="text-customDarkPink">{`Sales: ${formatCurrencyPHPPreview(payload[0].value)}`}</p>
      </div>
    );
  }
  return null;
};

// Component Name matches typical import pattern
export default function PreviewSales({
  monthlyData,
  isLoading,
  onViewDetails,
}: SalesPreviewProps) {
  return (
    <div className="h-[350px] rounded-lg border border-customGray/30 bg-customOffWhite p-4 shadow-custom">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-customBlack">
          Monthly Sales (Last 6 Months)
        </h2>
        <button
          onClick={onViewDetails}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-customDarkPink hover:bg-customDarkPink/10"
          aria-label="View sales details"
          disabled={isLoading}
        >
          <Eye size={14} /> Details
        </button>
      </div>
      {isLoading ? (
        <div className="flex h-[250px] items-center justify-center text-customBlack/70">
          Loading chart data...
        </div>
      ) : monthlyData.length === 0 ? (
        <div className="flex h-[250px] items-center justify-center text-customBlack/70">
          No sales data available for this period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={monthlyData}
            margin={{ top: 5, right: 0, left: -20, bottom: 5 }} // Adjusted left margin
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#D9D9D950" />
            <XAxis
              dataKey="month"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              stroke="#2E2A2A80"
            />
            <YAxis
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCurrencyPHPPreview} // Use PHP formatting (no decimals)
              stroke="#2E2A2A80"
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "#BCDCED40" }} // customLightBlue opacity
            />
            <Bar
              dataKey="totalSales" // Preview chart shows only total sales per month
              fill="#C28583" // customDarkPink
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
