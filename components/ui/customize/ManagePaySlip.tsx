// components/ui/customize/ManagePayslips.tsx
"use client";

import React, { useState, useCallback, useEffect, useTransition } from "react";
// --- Component Imports ---
// *** Ensure this path is correct for your project structure ***
import ManagePayslipModal from "./ManagePaySlipModal";
import Button from "@/components/Buttons/Button"; // Adjust path if needed
import { Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

// --- Types ---
import { PayslipData, ReleaseSalaryHandler } from "@/lib/Types"; // Adjust path if needed
// Import enum directly if using it for status comparison/display logic
import { PayslipStatus } from "@prisma/client"; // Assuming your type uses Prisma's enum

// --- Server Action Imports ---
// *** Ensure this path is correct and actions are implemented ***
import { getPayslips, releaseSalary } from "@/lib/ServerAction"; // Using ServerAction alias

// --- Helper Functions ---
const formatCurrency = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  )
    value = 0;
  const amountInPHP = value; // Assumes smallest unit input
  return amountInPHP.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
const formatDateRange = (start: Date, end: Date): string => {
  if (
    !start ||
    !end ||
    !(start instanceof Date) ||
    !(end instanceof Date) ||
    isNaN(start.getTime()) ||
    isNaN(end.getTime())
  )
    return "Invalid Period";
  try {
    if (
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear()
    )
      return `${format(start, "MMM dd")} - ${format(end, "dd, yyyy")}`;
    else if (start.getFullYear() === end.getFullYear())
      return `${format(start, "MMM dd")} - ${format(end, "MMM dd, yyyy")}`;
    else return `${format(start, "PP")} - ${format(end, "PP")}`;
  } catch {
    return "Invalid Period";
  }
};

// --- Main Component for the "Payslips" Tab ---
export default function ManagePayslips() {
  // State remains the same
  const [payslips, setPayslips] = useState<PayslipData[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("PENDING");
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [isReleasing, startReleaseTransition] = useTransition();

  // Data fetching and handlers remain the same
  const loadPayslips = useCallback(async (statusFilter: string) => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const data = await getPayslips(statusFilter);
      setPayslips(data);
    } catch (error: any) {
      console.error("Failed to fetch payslips", error);
      setListError(error.message || "Could not load payslips.");
      setPayslips([]);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadPayslips(filterStatus);
  }, [filterStatus, loadPayslips]);

  const handleOpenModal = (payslip: PayslipData) => {
    setSelectedPayslip(payslip);
    setReleaseError(null);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedPayslip(null), 300);
  };

  const handleReleaseSalary: ReleaseSalaryHandler = useCallback(
    async (payslipId: string) => {
      setReleaseError(null);
      startReleaseTransition(async () => {
        try {
          await releaseSalary(payslipId);
          await loadPayslips(filterStatus);
          handleCloseModal();
        } catch (error: any) {
          console.error("Release salary failed:", error);
          setReleaseError(error.message || "Failed to release salary.");
        }
      });
    },
    [filterStatus, loadPayslips],
  );

  // --- Styling Constants (Similar to ManageAccounts for consistency) ---
  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"; // Adjusted style
  const tdStyleBase = "px-3 py-2 text-sm text-gray-800 align-top"; // Use align-top

  // --- Render ---
  return (
    <div className="space-y-4">
      {/* Header and Filter Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Manage Payslips</h2>
        <div className="flex items-center gap-2">
          <label
            htmlFor="status-filter"
            className="text-sm font-medium text-gray-600"
          >
            Filter:
          </label>
          <select
            id="status-filter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded border-gray-300 text-sm shadow-sm focus:border-customDarkPink focus:ring-customDarkPink"
            disabled={isLoadingList}
          >
            <option value="ALL">All</option>
            <option value="PENDING">Pending</option>
            <option value="RELEASED">Released</option>
          </select>
        </div>
      </div>

      {/* Loading State for List */}
      {isLoadingList && (
        <div className="flex items-center justify-center py-10 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading payslips...
        </div>
      )}
      {/* Error State for List */}
      {listError && !isLoadingList && (
        <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> <span>{listError}</span>
        </div>
      )}

      {/* Responsive Payslip List Table */}
      {!isLoadingList && !listError && (
        // Add overflow container for horizontal scrolling on very small screens
        <div className="min-w-full overflow-x-auto rounded border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* Employee: Always Visible */}
                <th scope="col" className={`${thStyleBase} w-[30%] sm:w-[25%]`}>
                  Employee
                </th>
                {/* Period: Hidden on xs, visible sm+ */}
                <th
                  scope="col"
                  className={`${thStyleBase} hidden sm:table-cell sm:w-[25%]`}
                >
                  Period
                </th>
                {/* Net Pay: Hidden on xs, visible sm+ */}
                <th
                  scope="col"
                  className={`${thStyleBase} hidden sm:table-cell sm:w-[15%]`}
                >
                  Net Pay
                </th>
                {/* Status: Always Visible */}
                <th scope="col" className={`${thStyleBase} w-[20%] sm:w-[15%]`}>
                  Status
                </th>
                {/* Actions: Always Visible */}
                <th
                  scope="col"
                  className={`${thStyleBase} w-[20%] text-right sm:w-[20%]`}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {/* Handle Empty State */}
              {payslips.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-10 text-center italic text-gray-500"
                  >
                    No payslips found
                    {filterStatus !== "ALL"
                      ? ` for "${filterStatus}" status`
                      : ""}
                    .
                  </td>
                </tr>
              ) : (
                // Map Payslip Data to Table Rows
                payslips.map((payslip) => (
                  <tr key={payslip.id} className="hover:bg-gray-50">
                    {/* Employee: Always Visible */}
                    <td className={`${tdStyleBase} font-medium text-gray-900`}>
                      {payslip.employeeName}
                      {/* Show Period below name on XS screens */}
                      <div className="text-xs text-gray-500 sm:hidden">
                        {formatDateRange(
                          payslip.periodStartDate,
                          payslip.periodEndDate,
                        )}
                      </div>
                      {/* Show Net Pay below name on XS screens */}
                      <div className="text-xs font-semibold text-blue-600 sm:hidden">
                        {formatCurrency(payslip.netPay)}
                      </div>
                    </td>
                    {/* Period: Hidden on xs */}
                    <td
                      className={`${tdStyleBase} hidden whitespace-nowrap text-gray-500 sm:table-cell`}
                    >
                      {formatDateRange(
                        payslip.periodStartDate,
                        payslip.periodEndDate,
                      )}
                    </td>
                    {/* Net Pay: Hidden on xs */}
                    <td
                      className={`${tdStyleBase} hidden whitespace-nowrap font-semibold text-blue-600 sm:table-cell`}
                    >
                      {formatCurrency(payslip.netPay)}
                    </td>
                    {/* Status: Always Visible */}
                    <td className={`${tdStyleBase} whitespace-nowrap`}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold leading-5 ${payslip.status === PayslipStatus.PENDING ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"}`}
                      >
                        {payslip.status}
                      </span>
                    </td>
                    {/* Actions: Always Visible */}
                    <td
                      className={`${tdStyleBase} whitespace-nowrap text-right`}
                    >
                      <Button
                        size="sm"
                        onClick={() => handleOpenModal(payslip)}
                      >
                        {payslip.status === PayslipStatus.PENDING
                          ? "Manage"
                          : "View Details"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* --- MODAL RENDERING --- */}
      {/* Render the modal when a payslip is selected */}
      {selectedPayslip && (
        <ManagePayslipModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          payslipData={selectedPayslip}
          onReleaseSalary={handleReleaseSalary}
          isLoading={isReleasing}
          releaseError={releaseError}
        />
      )}
    </div>
  );
}
