// src/components/ui/customize/ManagePayslips.tsx
"use client";

import React, { useState, useCallback, useEffect, useTransition } from "react";
import ManagePayslipModal from "./ManagePaySlipModal";
import Button from "@/components/Buttons/Button";
import { Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import {
  PayslipData,
  ReleaseSalaryHandler,
  AttendanceRecord, // Import types for historical data
  SalaryBreakdownItem, // Import types for historical data
} from "@/lib/Types";
import { PayslipStatus } from "@prisma/client";
import {
  getPayslips,
  releaseSalary,
  getAttendanceForPeriod, // Import new actions
  getCommissionBreakdownForPeriod, // Import new actions
} from "@/lib/ServerAction";

// --- Helper Functions (keep as they are) ---
const formatCurrency = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  )
    value = 0;
  return value.toLocaleString("en-PH", {
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

// --- Main Component ---
export default function ManagePayslips() {
  const [payslips, setPayslips] = useState<PayslipData[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("PENDING"); // Default to PENDING
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [isReleasing, startReleaseTransition] = useTransition();

  // --- State for Historical Data in Modal ---
  const [modalAttendance, setModalAttendance] = useState<AttendanceRecord[]>(
    [],
  );
  const [modalBreakdown, setModalBreakdown] = useState<SalaryBreakdownItem[]>(
    [],
  );
  const [isLoadingModalData, setIsLoadingModalData] = useState(false);
  const [modalDataError, setModalDataError] = useState<string | null>(null);

  // --- Data Fetching ---
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

  // --- Modal Handling ---
  const handleOpenModal = useCallback(async (payslip: PayslipData) => {
    setSelectedPayslip(payslip);
    setReleaseError(null);
    setModalDataError(null);
    setModalAttendance([]); // Reset historical data
    setModalBreakdown([]);

    // Fetch historical data needed for the modal display (attendance & breakdown)
    setIsLoadingModalData(true);
    setIsModalOpen(true); // Open modal immediately

    try {
      // Fetch in parallel
      const [attendanceData, breakdownData] = await Promise.all([
        getAttendanceForPeriod(
          payslip.employeeId,
          payslip.periodStartDate,
          payslip.periodEndDate,
        ),
        getCommissionBreakdownForPeriod(
          payslip.employeeId,
          payslip.periodStartDate,
          payslip.periodEndDate,
        ),
      ]);
      setModalAttendance(attendanceData);
      setModalBreakdown(breakdownData);
    } catch (error: any) {
      console.error("Failed to fetch modal details", error);
      setModalDataError(
        error.message || "Could not load breakdown/attendance details.",
      );
    } finally {
      setIsLoadingModalData(false);
    }
  }, []); // Add dependencies if needed, but usually stable functions

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Delay clearing selected payslip to allow modal fade-out animation
    setTimeout(() => {
      setSelectedPayslip(null);
      setModalAttendance([]);
      setModalBreakdown([]);
      setModalDataError(null);
      setIsLoadingModalData(false);
    }, 300);
  };

  // --- Salary Release Handling ---
  const handleReleaseSalary: ReleaseSalaryHandler = useCallback(
    async (payslipId: string) => {
      setReleaseError(null);
      startReleaseTransition(async () => {
        try {
          // The server action now handles payslip update AND account reset
          await releaseSalary(payslipId);
          // Refresh the list after successful release
          await loadPayslips(filterStatus);
          handleCloseModal(); // Close modal on success
        } catch (error: any) {
          console.error("Release salary failed:", error);
          setReleaseError(error.message || "Failed to release salary.");
          // Keep modal open to show the error
        }
      });
    },
    [filterStatus, loadPayslips], // Include loadPayslips in dependency array
  );

  // --- Styling Constants ---
  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-gray-800 align-top";

  // --- Render ---
  return (
    <div className="space-y-4">
      {/* Header and Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Manage Payslips</h2>
        <div className="flex items-center gap-2">
          <label
            htmlFor="status-filter"
            className="text-sm font-medium text-gray-600"
          >
            {" "}
            Filter:{" "}
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
            {/* Add other statuses if they exist */}
          </select>
        </div>
      </div>

      {/* Loading/Error/List Display */}
      {isLoadingList && (
        <div className="flex items-center justify-center py-10 text-gray-500">
          {" "}
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading
          payslips...{" "}
        </div>
      )}
      {listError && !isLoadingList && (
        <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {" "}
          <AlertCircle size={16} /> <span>{listError}</span>{" "}
        </div>
      )}

      {!isLoadingList && !listError && (
        <div className="min-w-full overflow-x-auto rounded border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className={`${thStyleBase} w-[30%] sm:w-[25%]`}>
                  {" "}
                  Employee{" "}
                </th>
                <th
                  scope="col"
                  className={`${thStyleBase} hidden sm:table-cell sm:w-[25%]`}
                >
                  {" "}
                  Period{" "}
                </th>
                <th
                  scope="col"
                  className={`${thStyleBase} hidden sm:table-cell sm:w-[15%]`}
                >
                  {" "}
                  Net Pay{" "}
                </th>
                <th scope="col" className={`${thStyleBase} w-[20%] sm:w-[15%]`}>
                  {" "}
                  Status{" "}
                </th>
                <th
                  scope="col"
                  className={`${thStyleBase} w-[20%] text-right sm:w-[20%]`}
                >
                  {" "}
                  Actions{" "}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {payslips.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-10 text-center italic text-gray-500"
                  >
                    {" "}
                    No payslips found
                    {filterStatus !== "ALL"
                      ? ` for "${filterStatus}" status`
                      : ""}
                    .{" "}
                  </td>
                </tr>
              ) : (
                payslips.map((payslip) => (
                  <tr key={payslip.id} className="hover:bg-gray-50">
                    <td className={`${tdStyleBase} font-medium text-gray-900`}>
                      {payslip.employeeName}
                      <div className="text-xs text-gray-500 sm:hidden">
                        {" "}
                        {formatDateRange(
                          payslip.periodStartDate,
                          payslip.periodEndDate,
                        )}{" "}
                      </div>
                      <div className="text-xs font-semibold text-blue-600 sm:hidden">
                        {" "}
                        {formatCurrency(payslip.netPay)}{" "}
                      </div>
                    </td>
                    <td
                      className={`${tdStyleBase} hidden whitespace-nowrap text-gray-500 sm:table-cell`}
                    >
                      {" "}
                      {formatDateRange(
                        payslip.periodStartDate,
                        payslip.periodEndDate,
                      )}{" "}
                    </td>
                    <td
                      className={`${tdStyleBase} hidden whitespace-nowrap font-semibold text-blue-600 sm:table-cell`}
                    >
                      {" "}
                      {formatCurrency(payslip.netPay)}{" "}
                    </td>
                    <td className={`${tdStyleBase} whitespace-nowrap`}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold leading-5 ${payslip.status === PayslipStatus.PENDING ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"}`}
                      >
                        {payslip.status}
                      </span>
                    </td>
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

      {/* Modal Rendering */}
      {selectedPayslip && (
        <ManagePayslipModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          payslipData={selectedPayslip}
          // Pass fetched historical data
          attendanceRecords={modalAttendance}
          breakdownItems={modalBreakdown}
          // Pass loading/error states for modal data
          isModalDataLoading={isLoadingModalData}
          modalDataError={modalDataError}
          // Pass release handlers
          onReleaseSalary={handleReleaseSalary}
          isReleasing={isReleasing} // Use isReleasing for the button state
          releaseError={releaseError}
        />
      )}
    </div>
  );
}
