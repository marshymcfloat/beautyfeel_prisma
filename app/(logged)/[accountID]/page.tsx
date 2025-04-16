// src/app/dashboard/[accountID]/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react"; // Removed unused useTransition here
import { io, Socket } from "socket.io-client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { startOfMonth, endOfMonth, format, isValid } from "date-fns";
import { Status, Role } from "@prisma/client"; // Assuming Status enum is needed
import { AlertCircle, ListChecks, X, ChevronLeft } from "lucide-react";

// --- Server Action Imports ---
import {
  getActiveTransactions,
  getCurrentAccountData,
  getSalaryBreakdown,
  getSalesDataLast6Months,
  getAttendanceForPeriod,
  getPayslipStatusForPeriod,
  requestPayslipGeneration,
} from "@/lib/ServerAction"; // Adjust path

// --- UI Component Imports ---
import CalendarUI from "@/components/ui/Calendar";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";
import Modal from "@/components/Dialog/Modal";
import ExpandedListedServices from "@/components/ui/ExpandedListedServices";
import PreviewListedServices from "@/components/ui/PreviewListedServices";
import PreviewUserSalary from "@/components/ui/PreviewUserSalary";
// Ensure this is the correct path and component name
import ExpandedUserSalary from "@/components/ui/ExpandedUserSalary";
import PreviewSales from "@/components/ui/PreviewSales";
import ExpandedSales from "@/components/ui/ExpandedSales";
import ManageAttendance from "@/components/ui/customize/ManageAttendance";
import LoadingWidget from "@/components/ui/LoadingWidget"; // Adjust path

// --- Type Imports ---
import {
  AccountData,
  SalaryBreakdownItem,
  SalesDataDetailed,
  AttendanceRecord,
  AvailedServicesProps,
  TransactionProps,
  PayslipStatusOption,
} from "@/lib/Types"; // Adjust path

// --- Main Dashboard Component ---
export default function Home() {
  const params = useParams();
  const router = useRouter();
  const accountId =
    typeof params.accountID === "string" ? params.accountID : undefined;

  // --- State Definitions ---
  const [socket, setSocket] = useState<Socket | null>(null);
  const [allPendingTransactions, setAllPendingTransactions] = useState<
    TransactionProps[]
  >([]);
  const [processingServeActions, setProcessingServeActions] = useState<
    Set<string>
  >(new Set());
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [isSalaryDetailsModalOpen, setIsSalaryDetailsModalOpen] =
    useState(false);
  const [isSalesDetailsModalOpen, setIsSalesDetailsModalOpen] = useState(false);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [salaryBreakdown, setSalaryBreakdown] = useState<SalaryBreakdownItem[]>(
    [],
  );
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [salesData, setSalesData] = useState<SalesDataDetailed | null>(null);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState(() => {
    const today = new Date();
    return { start: startOfMonth(today), end: endOfMonth(today) };
  });
  // State for Payslip status check
  const [payslipStatus, setPayslipStatus] = useState<PayslipStatusOption>(null);
  const [isPayslipStatusLoading, setIsPayslipStatusLoading] = useState(false);

  // --- Socket Connection Effect (Stable) ---
  useEffect(() => {
    if (!accountId) return;
    const backendUrl = "https://beautyfeel-prisma.onrender.com";
    if (!backendUrl) {
      console.error("Socket URL missing.");
      setSocketError("Config Error.");
      return;
    }
    const newSocket = io(backendUrl, {
      query: { accountId },
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    setSocket(newSocket);
    setSocketError(null);
    const handleConnect = () => console.log("Socket connected:", newSocket.id);
    const handleDisconnect = (reason: Socket.DisconnectReason) =>
      console.log("Socket disconnected:", reason);
    const handleConnectError = (err: Error) => {
      console.error("Socket connection error:", err);
      setSocketError("Connection Failed.");
    };
    newSocket.on("connect", handleConnect);
    newSocket.on("disconnect", handleDisconnect);
    newSocket.on("connect_error", handleConnectError);
    return () => {
      newSocket.off("connect", handleConnect);
      newSocket.off("disconnect", handleDisconnect);
      newSocket.off("connect_error", handleConnectError);
      newSocket.disconnect();
      setSocket(null);
    };
  }, [accountId]);

  // --- Data Fetching Logic (Stable) ---
  const fetchAllData = useCallback(async () => {
    if (!accountId) {
      setIsLoadingTransactions(false);
      setIsLoadingAccount(false);
      setIsLoadingSales(false);
      return;
    }
    setIsLoadingAccount(true);
    setIsLoadingSales(true);
    setIsLoadingTransactions(true);
    try {
      const [accountResult, salesResult, transactionsResult] =
        await Promise.allSettled([
          getCurrentAccountData(accountId),
          getSalesDataLast6Months(),
          getActiveTransactions(),
        ]);
      if (accountResult.status === "fulfilled" && accountResult.value)
        setAccountData(accountResult.value);
      else {
        console.error(
          "Failed fetch account:",
          accountResult.status === "rejected"
            ? accountResult.reason
            : "No data",
        );
        setAccountData(null);
      }
      if (salesResult.status === "fulfilled" && salesResult.value)
        setSalesData(salesResult.value);
      else {
        console.error(
          "Failed fetch sales:",
          salesResult.status === "rejected" ? salesResult.reason : "No data",
        );
        setSalesData(null);
      }
      if (
        transactionsResult.status === "fulfilled" &&
        Array.isArray(transactionsResult.value)
      ) {
        // Assume transaction processing logic is correct
        setAllPendingTransactions(transactionsResult.value);
      } else {
        console.error(
          "Failed fetch transactions:",
          transactionsResult.status === "rejected"
            ? transactionsResult.reason
            : "Invalid format",
        );
        setAllPendingTransactions([]);
      }
    } catch (error) {
      console.error("Unexpected fetch error:", error);
      setAccountData(null);
      setSalesData(null);
      setAllPendingTransactions([]);
    } finally {
      setIsLoadingAccount(false);
      setIsLoadingSales(false);
      setIsLoadingTransactions(false);
    }
  }, [accountId]);

  // --- Initial Data Fetch (Stable) ---
  useEffect(() => {
    if (accountId) fetchAllData();
  }, [accountId, fetchAllData]);

  // --- Socket Event Handling Effect (Stable) ---
  useEffect(() => {
    if (!socket) return;
    // Define handlers using useCallback or ensure dependencies are listed if needed
    const handleAvailedServiceUpdate = (
      updatedServiceData: AvailedServicesProps,
    ) => {
      if (!updatedServiceData?.id) return;
      setProcessingServeActions((prev) => {
        if (!prev.has(updatedServiceData.id)) return prev;
        const next = new Set(prev);
        next.delete(updatedServiceData.id);
        return next;
      });
      setAllPendingTransactions((prevTransactions) =>
        prevTransactions.map((tx) => {
          if (tx.id !== updatedServiceData.transactionId) return tx;
          const updatedServices = (tx.availedServices ?? []).map((s) =>
            s.id === updatedServiceData.id
              ? { ...s, ...updatedServiceData }
              : s,
          );
          return { ...tx, availedServices: updatedServices };
        }),
      );
    };
    const handleTransactionComplete = (data: { id: string }) => {
      if (!data?.id) return;
      setAllPendingTransactions((prev) => prev.filter((t) => t.id !== data.id));
    };
    const handleActionError = (
      error: { availedServiceId?: string; message?: string },
      eventName: string,
    ) => {
      console.error(`Socket Error [${eventName}]:`, error);
      if (error?.availedServiceId) {
        setProcessingServeActions((prev) => {
          if (!prev.has(error.availedServiceId!)) return prev;
          const next = new Set(prev);
          next.delete(error.availedServiceId!);
          return next;
        });
      } /* Add toast error */
    };
    // Attach/Detach Listeners
    socket.on("availedServiceUpdated", handleAvailedServiceUpdate);
    socket.on("transactionCompleted", handleTransactionComplete);
    socket.on("serviceMarkServedError", (err) =>
      handleActionError(err, "serviceMarkServedError"),
    );
    socket.on("serviceUnmarkServedError", (err) =>
      handleActionError(err, "serviceUnmarkServedError"),
    );
    socket.on("serviceCheckError", (err) =>
      handleActionError(err, "serviceCheckError"),
    );
    socket.on("serviceUncheckError", (err) =>
      handleActionError(err, "serviceUncheckError"),
    );
    return () => {
      socket.off("availedServiceUpdated", handleAvailedServiceUpdate);
      socket.off("transactionCompleted", handleTransactionComplete);
      socket.off("serviceMarkServedError");
      socket.off("serviceUnmarkServedError");
      socket.off("serviceCheckError");
      socket.off("serviceUncheckError");
    };
  }, [socket]); // Only depends on socket instance

  // --- Modal Data Fetching Callbacks (Stable) ---
  const fetchBreakdown = useCallback(async () => {
    if (
      !accountId ||
      !currentPeriod.start ||
      !currentPeriod.end ||
      isLoadingBreakdown
    )
      return;
    setIsLoadingBreakdown(true);
    setSalaryBreakdown([]);
    try {
      const data = await getSalaryBreakdown(
        accountId,
        currentPeriod.start,
        currentPeriod.end,
      );
      setSalaryBreakdown(data || []);
    } catch (error) {
      console.error("fetchBreakdown Error:", error);
      setSalaryBreakdown([]);
    } finally {
      setIsLoadingBreakdown(false);
    }
  }, [accountId, currentPeriod.start, currentPeriod.end, isLoadingBreakdown]);

  const fetchAttendance = useCallback(async () => {
    if (
      !accountId ||
      !currentPeriod.start ||
      !currentPeriod.end ||
      isLoadingAttendance
    )
      return;
    setIsLoadingAttendance(true);
    setAttendanceError(null);
    setAttendanceRecords([]);
    try {
      const data = await getAttendanceForPeriod(
        accountId,
        currentPeriod.start,
        currentPeriod.end,
      );
      setAttendanceRecords(data || []);
    } catch (error: any) {
      console.error("fetchAttendance Error:", error);
      setAttendanceRecords([]);
      setAttendanceError(error.message || "Err");
    } finally {
      setIsLoadingAttendance(false);
    }
  }, [accountId, currentPeriod.start, currentPeriod.end, isLoadingAttendance]);

  const fetchPayslipStatus = useCallback(async () => {
    if (
      !accountId ||
      !currentPeriod.start ||
      !currentPeriod.end ||
      !isValid(currentPeriod.start) ||
      !isValid(currentPeriod.end)
    )
      return;
    setIsPayslipStatusLoading(true);
    setPayslipStatus(null);
    try {
      const status = await getPayslipStatusForPeriod(
        accountId,
        currentPeriod.start,
        currentPeriod.end,
      );
      setPayslipStatus(status);
    } catch (error) {
      console.error("Failed fetch payslip status:", error);
      setPayslipStatus(null);
    } finally {
      setIsPayslipStatusLoading(false);
    }
  }, [accountId, currentPeriod.start, currentPeriod.end]);

  // --- Memoized Derived State (Stable) ---
  const servicesCheckedByMe = useMemo(() => {
    if (!accountId || !allPendingTransactions) return [];
    // Ensure Status enum is correctly imported/used if needed here
    return allPendingTransactions
      .filter((tx) => tx.status === Status.PENDING)
      .flatMap((tx) => tx.availedServices ?? [])
      .filter((s) => s.checkedById === accountId);
  }, [allPendingTransactions, accountId]);

  // --- Modal Control Functions (Stable) ---
  const openMyServicesModal = () => setIsMyServicesModalOpen(true);
  const closeMyServicesModal = () => setIsMyServicesModalOpen(false);
  const openSalaryDetailsModal = useCallback(() => {
    if (accountData) {
      setIsSalaryDetailsModalOpen(true);
      fetchBreakdown();
      fetchAttendance();
      fetchPayslipStatus();
    } else {
      console.warn("Cannot open salary modal: Account data missing.");
    }
  }, [accountData, fetchBreakdown, fetchAttendance, fetchPayslipStatus]);
  const closeSalaryDetailsModal = () => setIsSalaryDetailsModalOpen(false);
  const openSalesDetailsModal = () => setIsSalesDetailsModalOpen(true);
  const closeSalesDetailsModal = () => setIsSalesDetailsModalOpen(false);

  if (isLoadingAccount && !accountData)
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingWidget text="Loading Dashboard..." height="h-auto" />
      </div>
    );
  if (!isLoadingAccount && !accountId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-md rounded-lg border border-red-300 bg-white p-6 text-center shadow-md sm:p-8">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-xl font-semibold text-red-700">
            Access Denied
          </h2>
          <p className="mb-6 text-sm text-gray-600">
            We couldn't identify your account, or you do not have permission to
            view this page. Please try logging in again.
          </p>
          <Link href="/login" passHref>
            {" "}
            {/* Make sure '/login' is your actual login route */}
            <Button
              // Use your Button component's styling
              className="w-full bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
              // Add appropriate props like size or invert if needed
              // size="md"
            >
              Go to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isLoadingTxWidget = isLoadingTransactions;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="truncate text-xl font-semibold text-customBlack sm:text-2xl md:text-3xl">
          Welcome, {accountData?.name ?? "User"}!
        </h1>
        {socketError && (
          <div className="text-xs text-red-600">{socketError}</div>
        )}
        <Link
          href={accountId ? `/dashboard/${accountId}/work-queue` : "#"}
          passHref
          className={!accountId ? "pointer-events-none opacity-50" : ""}
          aria-disabled={!accountId}
        >
          <Button
            size="sm"
            disabled={isLoadingTxWidget || !accountId}
            className="w-full shrink-0 bg-customDarkPink text-white hover:bg-customDarkPink/90 sm:w-auto"
          >
            Work Queue (
            {isLoadingTxWidget ? "..." : allPendingTransactions.length})
          </Button>
        </Link>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-8">
        {/* Left Col */}
        <div className="space-y-6 xl:col-span-2">
          <div className="min-h-[300px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
            <h3 className="mb-3 text-base font-semibold">Daily Attendance</h3>
            {accountId ? (
              <ManageAttendance currentUserId={accountId} />
            ) : (
              <LoadingWidget text="Loading..." />
            )}
          </div>
          <div className="w-full">
            <PreviewSales
              monthlyData={salesData?.monthlySales ?? []}
              isLoading={isLoadingSales}
              onViewDetails={openSalesDetailsModal}
            />
          </div>
        </div>
        {/* Right Col */}
        <div className="flex flex-col space-y-6 xl:col-span-1">
          <div className="w-full">
            <CalendarUI />
          </div>
          <div className="min-h-[150px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
            <h3 className="mb-3 text-base font-semibold">
              Your Claimed Services
            </h3>
            <PreviewListedServices
              checkedServices={servicesCheckedByMe}
              onOpenModal={openMyServicesModal}
              isLoading={isLoadingTxWidget}
            />
          </div>
          {isLoadingAccount ? (
            <LoadingWidget height="h-[170px]" />
          ) : accountData?.role.includes(Role.OWNER) ? (
            <div className="flex min-h-[170px] items-center justify-center rounded-lg border p-4 text-sm text-gray-500">
              Owner view.
            </div>
          ) : accountData ? (
            <PreviewUserSalary
              salary={accountData.salary}
              onOpenDetails={openSalaryDetailsModal}
              isLoading={false}
            />
          ) : (
            <div className="flex min-h-[170px] items-center justify-center rounded-lg border border-red-300 p-4 text-sm text-red-600">
              Salary info error.
            </div>
          )}
        </div>
      </div>

      {/* --- Modals --- */}
      {/* My Services Modal */}
      <Modal
        isOpen={isMyServicesModalOpen}
        onClose={closeMyServicesModal}
        title={<DialogTitle>Manage Claimed Services</DialogTitle>}
        size="lg"
      >
        {accountId && socket ? (
          <ExpandedListedServices
            services={servicesCheckedByMe}
            accountId={accountId}
            socket={socket}
            onClose={closeMyServicesModal}
            processingServeActions={processingServeActions}
            setProcessingServeActions={setProcessingServeActions}
          />
        ) : (
          <LoadingWidget />
        )}
      </Modal>

      {/* Salary Details Modal */}
      <Modal
        isOpen={isSalaryDetailsModalOpen}
        onClose={closeSalaryDetailsModal}
        title={
          <DialogTitle>
            Salary & Attendance (
            {isValid(currentPeriod.start)
              ? format(currentPeriod.start, "MMMM yyyy")
              : "..."}
            )
          </DialogTitle>
        }
        size="xl"
      >
        {accountData ? (
          <ExpandedUserSalary
            breakdownItems={salaryBreakdown}
            attendanceRecords={attendanceRecords}
            accountData={accountData}
            onClose={closeSalaryDetailsModal}
            isLoading={isLoadingBreakdown || isLoadingAttendance} // Main loading
            periodStartDate={currentPeriod.start}
            periodEndDate={currentPeriod.end}
            attendanceError={attendanceError}
            // Payslip Props
            onRequestPayslip={requestPayslipGeneration}
            initialPayslipStatus={payslipStatus}
            isPayslipStatusLoading={isPayslipStatusLoading} // Status loading
          />
        ) : (
          <div className="p-6 text-center">
            {isLoadingAccount ? (
              <LoadingWidget text="Loading..." />
            ) : (
              <div className="text-red-600">Account details unavailable.</div>
            )}
          </div>
        )}
      </Modal>

      {/* Sales Details Modal */}
      <Modal
        isOpen={isSalesDetailsModalOpen}
        onClose={closeSalesDetailsModal}
        title={<DialogTitle>Sales Details (Last 6 Months)</DialogTitle>}
        size="xl"
      >
        {isLoadingSales ? (
          <LoadingWidget />
        ) : salesData ? (
          <ExpandedSales
            monthlyData={salesData.monthlySales}
            paymentTotals={salesData.paymentMethodTotals}
            grandTotal={salesData.grandTotal}
            isLoading={false}
            onClose={closeSalesDetailsModal}
          />
        ) : (
          <div className="p-6 text-center text-red-500">
            Failed to load sales data.
          </div>
        )}
      </Modal>
    </>
  );
}
