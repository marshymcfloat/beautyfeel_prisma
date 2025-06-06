"use client";

import React, { useState, useCallback, useEffect, useTransition } from "react";
import ManagePayslipModal from "./ManagePaySlipModal";
import Button from "@/components/Buttons/Button";
import {
  Loader2,
  AlertCircle,
  MinusCircle,
  CheckCircle,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Settings,
  ListFilter,
  ToggleLeft,
  ToggleRight,
  RotateCcw as RefreshIcon,
} from "lucide-react";

import {
  format,
  startOfDay,
  addDays,
  isBefore,
  isValid,
  isEqual,
} from "date-fns";
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
  toggleAllCanRequestPayslipAction,
} from "@/lib/ServerAction";
import { useSession } from "next-auth/react";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

const PAYSLIPS_LIST_CACHE_KEY: CacheKey = "payslips_ManagePayslips";
const ACCOUNTS_LIST_CACHE_KEY: CacheKey = "accounts_ManagePayslips";
const REQUESTS_LIST_CACHE_KEY: CacheKey = "requests_ManagePayslips";

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
    ) {
      console.warn("formatDateRange: Invalid date inputs", { start, end });
      return "Invalid Period";
    }

    if (
      validStart.getMonth() === validEnd.getMonth() &&
      validStart.getFullYear() === validEnd.getFullYear()
    )
      return `${format(validStart, "MMM dd")} - ${format(validEnd, "dd, yyyy")}`;
    else if (validStart.getFullYear() === validEnd.getFullYear())
      return `${format(validStart, "MMM dd")} - ${format(validEnd, "MMM dd, yyyy")}`;
    else return `${format(validStart, "PP")} - ${format(validEnd, "PP")}`;
  } catch (e) {
    console.error("formatDateRange error:", e, { start, end });
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
  const [isTogglingAll, startToggleAllTransition] = useTransition();

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

  const loadPayslips = useCallback(
    async (statusFilterParam: string, forceRefresh = false) => {
      setIsLoadingList(true);
      setListError(null);
      const cacheParams = { statusFilter: statusFilterParam };

      if (!forceRefresh) {
        const cached = getCachedData<PayslipData[]>(
          PAYSLIPS_LIST_CACHE_KEY,
          cacheParams,
        );
        if (cached) {
          setPayslips(cached);
          setIsLoadingList(false);
          return;
        }
      }
      try {
        const data = await getPayslips({
          status: statusFilterParam === "ALL" ? null : statusFilterParam,
        });
        setPayslips(data);
        setCachedData(PAYSLIPS_LIST_CACHE_KEY, data, cacheParams);
      } catch (error: any) {
        setListError(error.message || "Could not load payslips.");
        setPayslips([]);
      } finally {
        setIsLoadingList(false);
      }
    },
    [],
  );

  const loadAccounts = useCallback(async (forceRefresh = false) => {
    setIsLoadingAccounts(true);
    setAccountsError(null);
    if (!forceRefresh) {
      const cached = getCachedData<BasicAccountInfo[]>(ACCOUNTS_LIST_CACHE_KEY);
      if (cached) {
        setAccounts(cached);
        setIsLoadingAccounts(false);
        return;
      }
    }
    try {
      const data = await getAllAccountsWithBasicInfo();
      setAccounts(data);
      setCachedData(ACCOUNTS_LIST_CACHE_KEY, data);
    } catch (error: any) {
      setAccountsError(error.message || "Could not load accounts.");
      setAccounts([]);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  const loadPayslipRequests = useCallback(async (forceRefresh = false) => {
    setIsLoadingRequests(true);
    setRequestsError(null);
    setRequestProcessingError(null);
    setRequestProcessingSuccess(null);
    const cacheParams = { status: PayslipRequestStatus.PENDING };

    if (!forceRefresh) {
      const cached = getCachedData<PayslipRequestData[]>(
        REQUESTS_LIST_CACHE_KEY,
        cacheParams,
      );
      if (cached) {
        setRequests(cached);
        setIsLoadingRequests(false);
        return;
      }
    }
    try {
      const data = await getPayslipRequests(PayslipRequestStatus.PENDING);
      setRequests(data);
      setCachedData(REQUESTS_LIST_CACHE_KEY, data, cacheParams);
    } catch (error: any) {
      setRequestsError(error.message || "Could not load pending requests.");
      setRequests([]);
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadPayslipRequests();
  }, [loadAccounts, loadPayslipRequests]);

  useEffect(() => {
    loadPayslips(filterStatus);
  }, [filterStatus, loadPayslips]);

  const handleRefreshAllData = () => {
    invalidateCache([
      PAYSLIPS_LIST_CACHE_KEY,
      ACCOUNTS_LIST_CACHE_KEY,
      REQUESTS_LIST_CACHE_KEY,
    ]);
    loadPayslips(filterStatus, true);
    loadAccounts(true);
    loadPayslipRequests(true);
  };

  const handleOpenModal = useCallback(async (payslipSummary: PayslipData) => {
    const summaryPeriodStartDate = new Date(payslipSummary.periodStartDate);
    const summaryPeriodEndDate = new Date(payslipSummary.periodEndDate);

    if (!isValid(summaryPeriodStartDate) || !isValid(summaryPeriodEndDate)) {
      console.error(
        "handleOpenModal: Invalid period dates in payslipSummary",
        payslipSummary,
      );
      setModalDataError("Invalid payslip period dates.");
      setIsModalOpen(true);
      setSelectedPayslip(payslipSummary);
      setIsLoadingModalData(false);
      return;
    }

    setIsLoadingModalData(true);
    setIsModalOpen(true);
    setSelectedPayslip(payslipSummary);
    setReleaseError(null);
    setModalDataError(null);
    setModalAttendance([]);
    setModalBreakdown([]);

    try {
      let trueAttendanceStartDate = summaryPeriodStartDate;

      const allUserReleasedPayslips = await getPayslips({
        status: PayslipStatus.RELEASED,
        employeeId: payslipSummary.employeeId,
      });

      const previousPayslipsBeforeThisOne = allUserReleasedPayslips
        .filter((p) => {
          const pEndDate = new Date(p.periodEndDate);
          return (
            isValid(pEndDate) && isBefore(pEndDate, summaryPeriodStartDate)
          );
        })
        .sort(
          (a, b) =>
            new Date(b.periodEndDate).getTime() -
            new Date(a.periodEndDate).getTime(),
        );

      if (previousPayslipsBeforeThisOne.length > 0) {
        const lastTrulyFinishedPeriodEndDate = new Date(
          previousPayslipsBeforeThisOne[0].periodEndDate,
        );
        if (isValid(lastTrulyFinishedPeriodEndDate)) {
          trueAttendanceStartDate = startOfDay(
            addDays(lastTrulyFinishedPeriodEndDate, 1),
          );
        }
      }
      console.log(
        `[ManagePayslips handleOpenModal] Payslip ${payslipSummary.id} (Nominal Period: ${format(summaryPeriodStartDate, "PP")} - ${format(summaryPeriodEndDate, "PP")}). True attendance start for this payslip: ${format(trueAttendanceStartDate, "PP")}`,
      );

      const rawAttendanceData = await getAttendanceForPeriod(
        payslipSummary.employeeId,
        summaryPeriodStartDate,
        summaryPeriodEndDate,
      );

      const filteredAttendanceData = rawAttendanceData.filter((attRec) => {
        const attDate = startOfDay(new Date(attRec.date));
        return (
          isValid(attDate) &&
          !isBefore(attDate, trueAttendanceStartDate) &&
          (isBefore(attDate, summaryPeriodEndDate) ||
            isEqual(attDate, summaryPeriodEndDate))
        );
      });
      setModalAttendance(filteredAttendanceData);

      const breakdownData = await getCommissionBreakdownForPeriod(
        payslipSummary.employeeId,
        summaryPeriodStartDate,
        summaryPeriodEndDate,
      );
      setModalBreakdown(breakdownData);
    } catch (error: any) {
      console.error(
        "[ManagePayslips handleOpenModal] Error loading modal data:",
        error,
      );
      setModalDataError(error.message || "Could not load details for modal.");
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
          invalidateCache(PAYSLIPS_LIST_CACHE_KEY);
          await loadPayslips(filterStatus, true);
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
            invalidateCache(ACCOUNTS_LIST_CACHE_KEY);
          } else {
            setPermissionUpdateError(
              result.error || result.message || "Failed to update permission.",
            );
            setAccounts(originalAccounts);
          }
        } catch (error: any) {
          setPermissionUpdateError(
            error.message ||
              "An unexpected error occurred during permission update.",
          );
          setAccounts(originalAccounts);
        } finally {
          setUpdatingAccountId(null);
          setTimeout(() => {
            setPermissionUpdateSuccess(null);
            setPermissionUpdateError(null);
          }, 3000);
        }
      });
    },
    [accounts],
  );

  const handleToggleAllPermissions = useCallback(
    async (newStatus: boolean) => {
      setPermissionUpdateError(null);
      setPermissionUpdateSuccess(null);
      const originalAccounts = [...accounts];
      setAccounts((prevAccounts) =>
        prevAccounts.map((acc) => ({ ...acc, canRequestPayslip: newStatus })),
      );

      startToggleAllTransition(async () => {
        try {
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
            invalidateCache(ACCOUNTS_LIST_CACHE_KEY);
          } else {
            setPermissionUpdateError(
              result.error || "Failed to update all permissions.",
            );
            setAccounts(originalAccounts);
          }
        } catch (error: any) {
          setPermissionUpdateError(
            error.message ||
              "An unexpected error occurred while toggling all permissions.",
          );
          setAccounts(originalAccounts);
        } finally {
          setTimeout(() => {
            setPermissionUpdateSuccess(null);
            setPermissionUpdateError(null);
          }, 3000);
        }
      });
    },
    [accounts],
  );

  const isSpecificAccountUpdating = (accountId: string) =>
    isUpdatingPermission && updatingAccountId === accountId;

  const handleApproveRequest = useCallback(
    async (requestId: string) => {
      if (!adminId) {
        setRequestProcessingError("Admin ID not found for approval.");
        return;
      }
      setRequestProcessingError(null);
      setRequestProcessingSuccess(null);
      setProcessingRequestId(requestId);
      startRequestProcessingTransition(async () => {
        try {
          const result = await approvePayslipRequest(requestId, adminId);
          if (result.success) {
            setRequestProcessingSuccess(
              result.message || "Request approved and payslip generated.",
            );
            invalidateCache([REQUESTS_LIST_CACHE_KEY, PAYSLIPS_LIST_CACHE_KEY]);
            await loadPayslipRequests(true);
            await loadPayslips(PayslipStatus.PENDING, true);
          } else {
            throw new Error(
              result.error || "Failed to approve request and generate payslip.",
            );
          }
        } catch (error: any) {
          setRequestProcessingError(
            error.message || "Could not approve request.",
          );
        } finally {
          setProcessingRequestId(null);
          setTimeout(() => {
            setRequestProcessingSuccess(null);
            setRequestProcessingError(null);
          }, 3000);
        }
      });
    },
    [adminId, loadPayslipRequests, loadPayslips],
  );

  const handleRejectRequest = useCallback(
    async (requestId: string) => {
      if (!adminId) {
        setRequestProcessingError("Admin ID not found for rejection.");
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
            setRequestProcessingSuccess(
              result.message || "Request rejected successfully.",
            );
            invalidateCache(REQUESTS_LIST_CACHE_KEY);
            await loadPayslipRequests(true);
          } else {
            throw new Error(result.error || "Failed to reject request.");
          }
        } catch (error: any) {
          setRequestProcessingError(
            error.message || "Could not reject request.",
          );
        } finally {
          setProcessingRequestId(null);
          setTimeout(() => {
            setRequestProcessingSuccess(null);
            setRequestProcessingError(null);
          }, 3000);
        }
      });
    },
    [adminId, loadPayslipRequests],
  );

  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-gray-700 align-top";
  const errorMsgStyle = "flex items-center gap-2 rounded border p-2 text-sm";

  const anyLoading = isLoadingList || isLoadingAccounts || isLoadingRequests;
  const anyPendingAction =
    isReleasing || isProcessingRequest || isUpdatingPermission || isTogglingAll;

  return (
    <div className="space-y-8 p-1 md:p-4">
      {}
      <div className="flex flex-col items-start justify-between gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-center">
        <h1 className="text-xl font-semibold text-gray-900">Manage Payslips</h1>
        <Button
          onClick={handleRefreshAllData}
          size="sm"
          variant="outline"
          className="flex w-full items-center justify-center gap-1.5 sm:w-auto"
          disabled={anyLoading || anyPendingAction}
          title="Refresh All Data"
        >
          <RefreshIcon size={16} />
          Refresh All
        </Button>
      </div>

      {}
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

      {}
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
              disabled={isLoadingList || isReleasing}
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

      {}
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
                isLoadingAccounts ||
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
                isLoadingAccounts ||
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
