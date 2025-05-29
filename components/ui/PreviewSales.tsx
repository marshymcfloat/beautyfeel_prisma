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
import { MonthlySales, BranchSalesDataPoint } from "@/lib/Types";
import { Eye } from "lucide-react";

type SalesPreviewProps = {
  monthlyData: MonthlySales[];
  isLoading: boolean;
  onViewDetails: () => void;
};

const formatCurrencyPHPPreview = (value: number) => {
  if (value === undefined || value === null || isNaN(value)) return "₱0";
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const CustomTooltipContent = ({ active, payload, label }: any) => {
  if (active && payload && payload.length && payload[0].payload) {
    const data = payload[0].payload as MonthlySales;
    return (
      <div className="rounded border bg-customOffWhite p-3 text-sm shadow-md">
        <p className="mb-1 font-semibold text-customBlack">{`${label}`}</p>
        <p className="text-customDarkPink">{`Total: ${formatCurrencyPHPPreview(data.totalSales)}`}</p>
        {data.branchSales && data.branchSales.length > 0 && (
          <div className="mt-2 border-t border-customGray/30 pt-2">
            <p className="font-medium text-customBlack/80">Breakdown:</p>
            <ul className="list-disc pl-4">
              {data.branchSales.map(
                (branch: BranchSalesDataPoint, index: number) => (
                  <li key={index} className="leading-tight text-customBlack/70">
                    {branch.branchTitle}:{" "}
                    {formatCurrencyPHPPreview(branch.totalSales)}
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
        {(!data.branchSales || data.branchSales.length === 0) &&
          data.totalSales > 0 && (
            <div className="mt-2 border-t border-customGray/30 pt-2 text-customBlack/70">
              <p className="text-xs italic">
                No branch breakdown for this month.
              </p>
            </div>
          )}
      </div>
    );
  }
  return null;
};
const CustomTooltip = React.memo(CustomTooltipContent);

const PreviewSalesComponent: React.FC<SalesPreviewProps> = ({
  monthlyData,
  isLoading,
  onViewDetails,
}) => {
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
            margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
          >
            {" "}
            {}
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
              tickFormatter={formatCurrencyPHPPreview}
              stroke="#2E2A2A80"
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "#BCDCED40" }}
            />
            <Bar dataKey="totalSales" fill="#C28583" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

PreviewSalesComponent.displayName = "PreviewSales";
export default React.memo(PreviewSalesComponent);
