// src/components/ui/customize/ManagePayslips.tsx
"use client";

import React, { useState, useCallback, useEffect, useTransition } from "react";
import ManagePayslipModal from "./ManagePaySlipModal";
import Button from "@/components/Buttons/Button";
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  MinusCircle,
  ThumbsUp,
  ThumbsDown,
  UserCheck,
  Eye,
  Settings,
  ListFilter,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"; // Added ToggleLeft, ToggleRight
import { format } from "date-fns";
import {
  PayslipData,
  ReleaseSalaryHandler,
  AttendanceRecord,
  SalaryBreakdownItem,
  BasicAccountInfo,
  PayslipRequestData,
} from "@/lib/Types";
import { PayslipStatus, Role, PayslipRequestStatus } from "@prisma/client";
import {
  getPayslips,
  releaseSalary,
  getAttendanceForPeriod,
  getCommissionBreakdownForPeriod,
  getAllAccountsWithBasicInfo,
  updateAccountCanRequestPayslip,
  getPayslipRequests,
  approvePayslipRequest,
  rejectPayslipRequest,
  toggleAllCanRequestPayslipAction, // <-- Import new action
} from "@/lib/ServerAction";
import { useSession } from "next-auth/react";

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

const formatDateRange = (start: Date | string, end: Date | string): string => {
  try {
    const validStart = typeof start === "string" ? new Date(start) : start;
    const validEnd = typeof end === "string" ? new Date(end) : end;
    if (
      !(validStart instanceof Date) ||
      !(validEnd instanceof Date) ||
      isNaN(validStart.getTime()) ||
      isNaN(validEnd.getTime())
    )
      return "Invalid Period";
    if (
      validStart.getMonth() === validEnd.getMonth() &&
      validStart.getFullYear() === validEnd.getFullYear()
    )
      return `${format(validStart, "MMM dd")} - ${format(validEnd, "dd, yyyy")}`;
    else if (validStart.getFullYear() === validEnd.getFullYear())
      return `${format(validStart, "MMM dd")} - ${format(validEnd, "MMM dd, yyyy")}`;
    else return `${format(validStart, "PP")} - ${format(validEnd, "PP")}`;
  } catch (e) {
    return "Error Formatting";
  }
};

export default function ManagePayslips() {
  const { data: session } = useSession();
  const adminId = session?.user?.id;

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
  const [modalAttendance, setModalAttendance] = useState<AttendanceRecord[]>(
    [],
  );
  const [modalBreakdown, setModalBreakdown] = useState<SalaryBreakdownItem[]>(
    [],
  );
  const [isLoadingModalData, setIsLoadingModalData] = useState(false);
  const [modalDataError, setModalDataError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<BasicAccountInfo[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [isUpdatingPermission, startPermissionTransition] = useTransition();
  const [permissionUpdateError, setPermissionUpdateError] = useState<
    string | null
  >(null);
  const [permissionUpdateSuccess, setPermissionUpdateSuccess] = useState<
    string | null
  >(null);
  const [updatingAccountId, setUpdatingAccountId] = useState<string | null>(
    null,
  );
  const [isTogglingAll, startToggleAllTransition] = useTransition(); // New transition for toggle all

  const [requests, setRequests] = useState<PayslipRequestData[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [isProcessingRequest, startRequestProcessingTransition] =
    useTransition();
  const [requestProcessingError, setRequestProcessingError] = useState<
    string | null
  >(null);
  const [requestProcessingSuccess, setRequestProcessingSuccess] = useState<
    string | null
  >(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(
    null,
  );

  const loadPayslips = useCallback(async (statusFilter: string) => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const data = await getPayslips(statusFilter);
      setPayslips(data);
    } catch (error: any) {
      setListError(error.message || "Could not load payslips.");
      setPayslips([]);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    setAccountsError(null);
    try {
      const data = await getAllAccountsWithBasicInfo();
      setAccounts(data);
    } catch (error: any) {
      setAccountsError(error.message || "Could not load accounts.");
      setAccounts([]);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  const loadPayslipRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    setRequestsError(null);
    setRequestProcessingError(null);
    setRequestProcessingSuccess(null);
    try {
      const data = await getPayslipRequests(PayslipRequestStatus.PENDING);
      setRequests(data);
    } catch (error: any) {
      setRequestsError(error.message || "Could not load pending requests.");
      setRequests([]);
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    loadPayslips(filterStatus);
    loadAccounts();
    loadPayslipRequests();
  }, [filterStatus, loadPayslips, loadAccounts, loadPayslipRequests]);

  const handleOpenModal = useCallback(async (payslip: PayslipData) => {
    setSelectedPayslip(payslip);
    setReleaseError(null);
    setModalDataError(null);
    setModalAttendance([]);
    setModalBreakdown([]);
    setIsLoadingModalData(true);
    setIsModalOpen(true);
    try {
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
      setModalDataError(error.message || "Could not load details.");
    } finally {
      setIsLoadingModalData(false);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedPayslip(null);
      setModalAttendance([]);
      setModalBreakdown([]);
      setModalDataError(null);
      setIsLoadingModalData(false);
      setReleaseError(null);
    }, 300);
  }, []);

  const handleReleaseSalary: ReleaseSalaryHandler = useCallback(
    async (payslipId: string) => {
      if (!adminId) {
        setReleaseError("Admin ID not found.");
        return;
      }
      setReleaseError(null);
      startReleaseTransition(async () => {
        try {
          await releaseSalary(payslipId, adminId);
          await loadPayslips(filterStatus);
          handleCloseModal();
        } catch (error: any) {
          setReleaseError(error.message || "Failed to release salary.");
        }
      });
    },
    [loadPayslips, filterStatus, handleCloseModal, adminId],
  );

  const handleToggleCanRequestPayslip = useCallback(
    async (account: BasicAccountInfo) => {
      setPermissionUpdateError(null);
      setPermissionUpdateSuccess(null);
      setUpdatingAccountId(account.id);

      // Optimistic update
      const originalAccounts = [...accounts];
      const newPermissionValue = !account.canRequestPayslip;
      setAccounts((prevAccounts) =>
        prevAccounts.map((acc) =>
          acc.id === account.id
            ? { ...acc, canRequestPayslip: newPermissionValue }
            : acc,
        ),
      );

      startPermissionTransition(async () => {
        try {
          const result = await updateAccountCanRequestPayslip(
            account.id,
            newPermissionValue,
          );
          if (result.success) {
            setPermissionUpdateSuccess(result.message || "Permission updated.");
            // Optionally re-fetch if server might have other changes, or trust optimistic state for a bit
            // await loadAccounts(); // Re-fetch for server truth
          } else {
            setPermissionUpdateError(
              result.error || result.message || "Failed to update.",
            );
            setAccounts(originalAccounts); // Revert on error
          }
        } catch (error: any) {
          setPermissionUpdateError(error.message || "Unexpected error.");
          setAccounts(originalAccounts); // Revert on error
        } finally {
          setUpdatingAccountId(null);
          setTimeout(() => {
            setPermissionUpdateSuccess(null);
            setPermissionUpdateError(null);
          }, 3000);
        }
      });
    },
    [accounts, startPermissionTransition],
  ); // Removed loadAccounts to rely on optimistic for smoother UI

  const handleToggleAllPermissions = useCallback(
    async (newStatus: boolean) => {
      setPermissionUpdateError(null);
      setPermissionUpdateSuccess(null);

      // Optimistic Update
      const originalAccounts = [...accounts];
      setAccounts((prevAccounts) =>
        prevAccounts.map((acc) => ({ ...acc, canRequestPayslip: newStatus })),
      );

      startToggleAllTransition(async () => {
        try {
          // Get IDs of all currently listed accounts (could be filtered view later)
          const accountIdsToUpdate = accounts.map((acc) => acc.id);
          const result = await toggleAllCanRequestPayslipAction(
            newStatus,
            accountIdsToUpdate,
          );
          if (result.success) {
            setPermissionUpdateSuccess(
              result.message ||
                `All permissions set to ${newStatus ? "Enabled" : "Disabled"}.`,
            );
            // await loadAccounts(); // Re-fetch for server truth or trust optimistic
          } else {
            setPermissionUpdateError(
              result.error || "Failed to update all permissions.",
            );
            setAccounts(originalAccounts); // Revert on error
          }
        } catch (error: any) {
          setPermissionUpdateError(
            error.message || "An unexpected error occurred.",
          );
          setAccounts(originalAccounts); // Revert on error
        } finally {
          setTimeout(() => {
            setPermissionUpdateSuccess(null);
            setPermissionUpdateError(null);
          }, 3000);
        }
      });
    },
    [accounts, startToggleAllTransition],
  ); // Removed loadAccounts for optimistic

  const isSpecificAccountUpdating = (accountId: string) =>
    isUpdatingPermission && updatingAccountId === accountId;

  const handleApproveRequest = useCallback(
    async (requestId: string) => {
      if (!adminId) {
        setRequestProcessingError("Admin ID not found.");
        return;
      }
      setRequestProcessingError(null);
      setRequestProcessingSuccess(null);
      setProcessingRequestId(requestId);
      startRequestProcessingTransition(async () => {
        try {
          const result = await approvePayslipRequest(requestId, adminId);
          if (result.success) {
            setRequestProcessingSuccess(result.message || "Request approved.");
            await loadPayslipRequests();
            await loadPayslips(PayslipStatus.PENDING);
            if (filterStatus !== PayslipStatus.PENDING)
              setFilterStatus(PayslipStatus.PENDING);
          } else {
            throw new Error(result.error || "Failed to approve request.");
          }
        } catch (error: any) {
          setRequestProcessingError(error.message || "Could not approve.");
        } finally {
          setProcessingRequestId(null);
          setTimeout(() => {
            setRequestProcessingSuccess(null);
            setRequestProcessingError(null);
          }, 3000);
        }
      });
    },
    [
      adminId,
      loadPayslipRequests,
      loadPayslips,
      filterStatus,
      startRequestProcessingTransition,
    ],
  );

  const handleRejectRequest = useCallback(
    async (requestId: string) => {
      if (!adminId) {
        setRequestProcessingError("Admin ID not found.");
        return;
      }
      const reason = prompt("Optional: Enter reason for rejection:");
      setRequestProcessingError(null);
      setRequestProcessingSuccess(null);
      setProcessingRequestId(requestId);
      startRequestProcessingTransition(async () => {
        try {
          const result = await rejectPayslipRequest(
            requestId,
            adminId,
            reason || undefined,
          );
          if (result.success) {
            setRequestProcessingSuccess(result.message || "Request rejected.");
            await loadPayslipRequests();
          } else {
            throw new Error(result.error || "Failed to reject request.");
          }
        } catch (error: any) {
          setRequestProcessingError(error.message || "Could not reject.");
        } finally {
          setProcessingRequestId(null);
          setTimeout(() => {
            setRequestProcessingSuccess(null);
            setRequestProcessingError(null);
          }, 3000);
        }
      });
    },
    [adminId, loadPayslipRequests, startRequestProcessingTransition],
  );

  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-gray-700 align-top";
  const errorMsgStyle = "flex items-center gap-2 rounded border p-2 text-sm";

  return (
    <div className="space-y-8 p-1 md:p-4">
      <section className="space-y-3">
        <h2 className="text-md font-semibold text-gray-800 sm:text-lg">
          Pending Payslip Requests
        </h2>
        {requestProcessingSuccess && (
          <div
            className={`${errorMsgStyle} border-green-300 bg-green-50 text-green-700`}
          >
            <CheckCircle size={16} /> <span>{requestProcessingSuccess}</span>
          </div>
        )}
        {requestProcessingError && (
          <div
            className={`${errorMsgStyle} border-red-300 bg-red-50 text-red-700`}
          >
            <AlertCircle size={16} /> <span>{requestProcessingError}</span>
          </div>
        )}
        {isLoadingRequests && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading
            requests...
          </div>
        )}
        {requestsError && !isLoadingRequests && (
          <div
            className={`${errorMsgStyle} border-red-200 bg-red-50 text-red-700`}
          >
            <AlertCircle size={16} /> <span>{requestsError}</span>
          </div>
        )}

        {!isLoadingRequests && !requestsError && (
          <div className="min-w-full overflow-x-auto rounded border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className={`${thStyleBase} w-[40%] sm:w-[30%]`}
                  >
                    Employee
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} hidden w-[30%] md:table-cell`}
                  >
                    Requested Period
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} hidden w-[20%] sm:table-cell`}
                  >
                    Requested At
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} w-[60%] text-right sm:w-[20%]`}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {requests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center italic text-gray-500"
                    >
                      No pending payslip requests.
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td
                        className={`${tdStyleBase} font-medium text-gray-900`}
                      >
                        {req.employeeName}
                        <div className="text-xs text-gray-500 md:hidden">
                          {formatDateRange(
                            req.periodStartDate,
                            req.periodEndDate,
                          )}
                        </div>
                        <div className="text-xs text-gray-400 sm:hidden">
                          {format(new Date(req.requestTimestamp), "MMM d, p")}
                        </div>
                      </td>
                      <td
                        className={`${tdStyleBase} hidden whitespace-nowrap text-gray-500 md:table-cell`}
                      >
                        {formatDateRange(
                          req.periodStartDate,
                          req.periodEndDate,
                        )}
                      </td>
                      <td
                        className={`${tdStyleBase} hidden whitespace-nowrap text-gray-500 sm:table-cell`}
                      >
                        {format(new Date(req.requestTimestamp), "PPp")}
                      </td>
                      <td
                        className={`${tdStyleBase} space-x-1 whitespace-nowrap text-right sm:space-x-2`}
                      >
                        <Button
                          size="xs"
                          sm-size="sm"
                          variant="primary"
                          onClick={() => handleApproveRequest(req.id)}
                          disabled={
                            isProcessingRequest &&
                            processingRequestId === req.id
                          }
                          icon={
                            isProcessingRequest &&
                            processingRequestId === req.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <ThumbsUp size={14} />
                            )
                          }
                          className="px-2 py-1 sm:px-3"
                        >
                          <span className="hidden sm:inline">Approve</span>
                          <span className="sm:hidden">OK</span>
                        </Button>
                        <Button
                          size="xs"
                          sm-size="sm"
                          onClick={() => handleRejectRequest(req.id)}
                          disabled={
                            isProcessingRequest &&
                            processingRequestId === req.id
                          }
                          icon={
                            isProcessingRequest &&
                            processingRequestId === req.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <ThumbsDown size={14} />
                            )
                          }
                          className="px-2 py-1 sm:px-3"
                        >
                          Reject
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-gray-300 pt-6 sm:pt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-md font-semibold text-gray-800 sm:text-lg">
            Generated Payslips
          </h2>
          <div className="flex items-center gap-2">
            <label
              htmlFor="status-filter"
              className="text-xs font-medium text-gray-600 sm:text-sm"
            >
              <ListFilter size={14} className="mr-1 inline-block" />
              Filter:
            </label>
            <select
              id="status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded border-gray-300 text-xs shadow-sm focus:border-customDarkPink focus:ring-customDarkPink sm:text-sm"
              disabled={isLoadingList}
            >
              <option value="ALL">All</option>
              <option value="PENDING">Pending</option>
              <option value="RELEASED">Released</option>
            </select>
          </div>
        </div>
        {isLoadingList && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading
            payslips...
          </div>
        )}
        {listError && !isLoadingList && (
          <div
            className={`${errorMsgStyle} border-red-200 bg-red-50 text-red-700`}
          >
            <AlertCircle size={16} /> <span>{listError}</span>
          </div>
        )}
        {!isLoadingList && !listError && (
          <div className="min-w-full overflow-x-auto rounded border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className={`${thStyleBase} w-[40%] sm:w-[25%]`}
                  >
                    Employee
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} hidden sm:w-[25%] md:table-cell`}
                  >
                    Period
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} hidden sm:table-cell sm:w-[15%]`}
                  >
                    Net Pay
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} w-[25%] sm:w-[15%]`}
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} w-[35%] text-right sm:w-[20%]`}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {payslips.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center italic text-gray-500"
                    >
                      No payslips found{" "}
                      {filterStatus !== "ALL"
                        ? `for "${filterStatus}" status`
                        : ""}
                      .
                    </td>
                  </tr>
                ) : (
                  payslips.map((payslip) => (
                    <tr key={payslip.id} className="hover:bg-gray-50">
                      <td
                        className={`${tdStyleBase} font-medium text-gray-900`}
                      >
                        {payslip.employeeName}
                        <div className="text-xs text-gray-500 md:hidden">
                          {formatDateRange(
                            payslip.periodStartDate,
                            payslip.periodEndDate,
                          )}
                        </div>
                        <div className="text-xs font-semibold text-blue-600 sm:hidden">
                          {formatCurrency(payslip.netPay)}
                        </div>
                      </td>
                      <td
                        className={`${tdStyleBase} hidden whitespace-nowrap text-gray-500 md:table-cell`}
                      >
                        {formatDateRange(
                          payslip.periodStartDate,
                          payslip.periodEndDate,
                        )}
                      </td>
                      <td
                        className={`${tdStyleBase} hidden whitespace-nowrap font-semibold text-blue-600 sm:table-cell`}
                      >
                        {formatCurrency(payslip.netPay)}
                      </td>
                      <td className={`${tdStyleBase} whitespace-nowrap`}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold leading-5 sm:text-xs ${payslip.status === PayslipStatus.PENDING ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"}`}
                        >
                          {payslip.status}
                        </span>
                        {payslip.status === PayslipStatus.RELEASED &&
                          payslip.releasedDate && (
                            <div className="mt-0.5 text-[10px] text-gray-400">
                              {format(
                                new Date(payslip.releasedDate),
                                "MMM d, HH:mm",
                              )}
                            </div>
                          )}
                      </td>
                      <td
                        className={`${tdStyleBase} whitespace-nowrap text-right`}
                      >
                        <Button
                          size="xs"
                          sm-size="sm"
                          variant="secondary"
                          onClick={() => handleOpenModal(payslip)}
                          disabled={
                            isReleasing && selectedPayslip?.id === payslip.id
                          }
                          icon={
                            isReleasing &&
                            selectedPayslip?.id === payslip.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : payslip.status === PayslipStatus.PENDING ? (
                              <Settings size={14} />
                            ) : (
                              <Eye size={14} />
                            )
                          }
                          className="px-2 py-1 sm:px-3"
                        >
                          {payslip.status === PayslipStatus.PENDING
                            ? "Manage"
                            : "View"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-gray-300 pt-6 sm:pt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-md font-semibold text-gray-800 sm:text-lg">
            Employee Payslip Permissions
          </h2>
          <div className="flex space-x-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => handleToggleAllPermissions(true)}
              disabled={
                isTogglingAll ||
                accounts.length === 0 ||
                accounts.every((acc) => acc.canRequestPayslip)
              }
              icon={<ToggleRight size={14} className="text-green-500" />}
              className="border-green-400 text-green-600 hover:bg-green-50"
            >
              Enable All
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => handleToggleAllPermissions(false)}
              disabled={
                isTogglingAll ||
                accounts.length === 0 ||
                accounts.every((acc) => !acc.canRequestPayslip)
              }
              icon={<ToggleLeft size={14} className="text-red-500" />}
              className="border-red-400 text-red-600 hover:bg-red-50"
            >
              Disable All
            </Button>
          </div>
        </div>

        {permissionUpdateSuccess && (
          <div
            className={`${errorMsgStyle} border-green-300 bg-green-50 text-green-700`}
          >
            <CheckCircle size={16} /> <span>{permissionUpdateSuccess}</span>
          </div>
        )}
        {permissionUpdateError && (
          <div
            className={`${errorMsgStyle} border-red-300 bg-red-50 text-red-700`}
          >
            <AlertCircle size={16} /> <span>{permissionUpdateError}</span>
          </div>
        )}

        {isLoadingAccounts && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading
            employees...
          </div>
        )}
        {accountsError && !isLoadingAccounts && (
          <div
            className={`${errorMsgStyle} border-red-200 bg-red-50 text-red-700`}
          >
            <AlertCircle size={16} /> <span>{accountsError}</span>
          </div>
        )}

        {!isLoadingAccounts && !accountsError && (
          <div className="max-h-[400px] min-w-full overflow-x-auto overflow-y-auto rounded border border-gray-200 bg-white shadow-sm sm:max-h-[500px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr>
                  <th scope="col" className={`${thStyleBase} w-[40%] sm:w-1/2`}>
                    Employee Name
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} hidden sm:table-cell sm:w-1/4`}
                  >
                    Roles
                  </th>
                  <th
                    scope="col"
                    className={`${thStyleBase} w-[60%] text-right sm:w-1/4`}
                  >
                    Allow Request?
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {accounts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-8 text-center italic text-gray-500"
                    >
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-gray-50">
                      <td
                        className={`${tdStyleBase} font-medium text-gray-900`}
                      >
                        {account.name}
                        <div className="text-xs text-gray-500 sm:hidden">
                          {(account.role || []).join(", ") || (
                            <span className="italic text-gray-400">
                              No roles
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className={`${tdStyleBase} hidden text-gray-500 sm:table-cell`}
                      >
                        {(account.role || []).map((r) => (
                          <span
                            key={r}
                            className="mr-1 inline-block rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800"
                          >
                            {r}
                          </span>
                        ))}
                        {(!account.role || account.role.length === 0) && (
                          <span className="text-xs italic text-gray-400">
                            No roles
                          </span>
                        )}
                      </td>
                      <td className={`${tdStyleBase} text-right`}>
                        <Button
                          size="xs"
                          sm-size="sm"
                          variant="outline"
                          onClick={() => handleToggleCanRequestPayslip(account)}
                          disabled={
                            isSpecificAccountUpdating(account.id) ||
                            isTogglingAll
                          }
                          icon={
                            isSpecificAccountUpdating(account.id) ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : account.canRequestPayslip ? (
                              <CheckCircle
                                size={14}
                                className="text-green-600"
                              />
                            ) : (
                              <MinusCircle size={14} className="text-red-600" />
                            )
                          }
                          className={`min-w-[80px] justify-center px-2 py-1 sm:min-w-[100px] sm:px-3 ${account.canRequestPayslip ? "border-green-300 hover:bg-green-50" : "border-red-300 hover:bg-red-50"}`}
                        >
                          {isSpecificAccountUpdating(account.id)
                            ? "..."
                            : account.canRequestPayslip
                              ? "Yes"
                              : "No"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedPayslip && isModalOpen && (
        <ManagePayslipModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          payslipData={selectedPayslip}
          attendanceRecords={modalAttendance}
          breakdownItems={modalBreakdown}
          isModalDataLoading={isLoadingModalData}
          modalDataError={modalDataError}
          onReleaseSalary={handleReleaseSalary}
          isReleasing={isReleasing}
          releaseError={releaseError}
        />
      )}
    </div>
  );
}
