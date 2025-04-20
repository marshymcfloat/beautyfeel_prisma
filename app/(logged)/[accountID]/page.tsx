// src/app/dashboard/[accountID]/page.tsx (or similar path)
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format, isValid } from "date-fns";
import { Status, Role } from "@prisma/client";
import {
  AlertCircle,
  ListChecks,
  X,
  ChevronLeft,
  Eye,
  History,
  Loader2,
} from "lucide-react";

import {
  getActiveTransactions,
  getCurrentAccountData,
  getSalesDataLast6Months,
  // --- Actions called by buttons ---
  getCurrentSalaryDetails, // This now includes last released date AND timestamp
  getMyReleasedPayslips,
} from "@/lib/ServerAction"; // Adjust path

// --- UI Component Imports ---
import CalendarUI from "@/components/ui/Calendar";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";
import Modal from "@/components/Dialog/Modal";
import ExpandedListedServices from "@/components/ui/ExpandedListedServices";
import PreviewListedServices from "@/components/ui/PreviewListedServices";
import PreviewUserSalary from "@/components/ui/PreviewUserSalary";
import CurrentSalaryDetailsModal from "@/components/ui/CurrentSalaryDetailsModal";
import PreviewSales from "@/components/ui/PreviewSales";
import ExpandedSales from "@/components/ui/ExpandedSales";
import ManageAttendance from "@/components/ui/customize/ManageAttendance";
import LoadingWidget from "@/components/ui/LoadingWidget";
import PayslipHistoryModal from "@/components/ui/PayslipHistoryModal";

import {
  AccountData,
  SalaryBreakdownItem,
  SalesDataDetailed,
  AttendanceRecord,
  AvailedServicesProps,
  TransactionProps,
  PayslipData,
  CurrentSalaryDetailsData, // The updated type from Types.ts
} from "@/lib/Types"; // Adjust path

// --- Formatting ---
const formatCurrencyWidget = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  )
    value = 0;
  // Format based on smallest unit assumption
  return (value / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
};

export default function Home() {
  const params = useParams();
  const router = useRouter();
  const accountId =
    typeof params.accountID === "string" ? params.accountID : undefined;

  // Socket State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);

  // Data State
  const [allPendingTransactions, setAllPendingTransactions] = useState<
    TransactionProps[]
  >([]);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [salesData, setSalesData] = useState<SalesDataDetailed | null>(null);

  // Loading State
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [isLoadingSales, setIsLoadingSales] = useState(true);

  // Modal State
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [isSalesDetailsModalOpen, setIsSalesDetailsModalOpen] = useState(false);

  // --- State for CURRENT Salary Details Modal ---
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [currentDetails, setCurrentDetails] =
    useState<CurrentSalaryDetailsData | null>(null);

  // --- State for Payslip History Modal ---
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [payslipHistory, setPayslipHistory] = useState<PayslipData[]>([]);

  // State for tracking socket actions
  const [processingServeActions, setProcessingServeActions] = useState<
    Set<string>
  >(new Set());

  // --- Socket Connection Effect ---
  useEffect(() => {
    if (!accountId) return;
    const backendUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      "https://beautyfeel-prisma.onrender.com";
    if (!backendUrl) {
      console.error("Socket URL missing (NEXT_PUBLIC_SOCKET_URL).");
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

  // --- Initial Data Fetch ---
  const fetchInitialData = useCallback(async () => {
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
      const accountResult = await getCurrentAccountData(accountId);
      setAccountData(accountResult);
      const [salesResult, transactionsResult] = await Promise.allSettled([
        getSalesDataLast6Months(),
        getActiveTransactions(),
      ]);
      if (salesResult.status === "fulfilled" && salesResult.value)
        setSalesData(salesResult.value);
      else
        console.error(
          "Failed fetch sales:",
          salesResult.status === "rejected" ? salesResult.reason : "No data",
        );
      if (
        transactionsResult.status === "fulfilled" &&
        Array.isArray(transactionsResult.value)
      )
        setAllPendingTransactions(transactionsResult.value);
      else {
        console.error(
          "Failed fetch transactions:",
          transactionsResult.status === "rejected"
            ? transactionsResult.reason
            : "Invalid format",
        );
        setAllPendingTransactions([]);
      }
    } catch (error) {
      console.error("Unexpected initial fetch error:", error);
      setAccountData(null);
      setSalesData(null);
      setAllPendingTransactions([]);
    } finally {
      setIsLoadingAccount(false);
      setIsLoadingSales(false);
      setIsLoadingTransactions(false);
    }
  }, [accountId]);
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // --- Socket Event Handling ---
  useEffect(() => {
    if (!socket) return;
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
      }
    };
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
      socket.off("availedServiceUpdated");
      socket.off("transactionCompleted");
      socket.off("serviceMarkServedError");
      socket.off("serviceUnmarkServedError");
      socket.off("serviceCheckError");
      socket.off("serviceUncheckError");
    };
  }, [socket]);

  // --- Memoized Derived State ---
  const servicesCheckedByMe = useMemo(() => {
    if (!accountId || !allPendingTransactions) return [];
    return allPendingTransactions
      .filter((tx) => tx.status === Status.PENDING)
      .flatMap((tx) => tx.availedServices ?? [])
      .filter((s) => s.checkedById === accountId);
  }, [allPendingTransactions, accountId]);

  // --- Modal Control & Data Fetching Callbacks ---
  const openMyServicesModal = () => setIsMyServicesModalOpen(true);
  const closeMyServicesModal = () => setIsMyServicesModalOpen(false);
  const openSalesDetailsModal = () => setIsSalesDetailsModalOpen(true);
  const closeSalesDetailsModal = () => setIsSalesDetailsModalOpen(false);

  const handleViewCurrentDetails = useCallback(async () => {
    if (!accountId) return;
    setIsLoadingDetails(true);
    setDetailsError(null);
    setCurrentDetails(null);
    setIsDetailsModalOpen(true);
    try {
      const details: CurrentSalaryDetailsData =
        await getCurrentSalaryDetails(accountId);
      setCurrentDetails(details);
    } catch (err: any) {
      console.error("Failed fetch current details:", err);
      setDetailsError("Could not load current salary details.");
    } finally {
      setIsLoadingDetails(false);
    }
  }, [accountId]);
  const closeCurrentDetailsModal = () => setIsDetailsModalOpen(false);

  const handleViewHistory = useCallback(async () => {
    if (!accountId) return;
    setIsLoadingHistory(true);
    setHistoryError(null);
    setPayslipHistory([]);
    setIsHistoryModalOpen(true);
    try {
      const history = await getMyReleasedPayslips(accountId);
      setPayslipHistory(history);
    } catch (err: any) {
      console.error("Failed fetch payslip history:", err);
      setHistoryError("Could not load payslip history.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [accountId]);
  const closeHistoryModal = () => setIsHistoryModalOpen(false);

  // --- Loading/Error States ---
  if (isLoadingAccount && !accountData) {
    return (
      <div className="flex h-screen items-center justify-center">
        {" "}
        <LoadingWidget text="Loading Dashboard..." height="h-auto" />{" "}
      </div>
    );
  }
  if (!isLoadingAccount && !accountId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-md rounded-lg border border-red-300 bg-white p-6 text-center shadow-md sm:p-8">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-xl font-semibold text-red-700">
            {" "}
            Access Denied{" "}
          </h2>
          <p className="mb-6 text-sm text-gray-600">
            {" "}
            We couldn't identify your account, or you do not have permission to
            view this page. Please try logging in again.{" "}
          </p>
          <Link href="/login" passHref>
            {" "}
            <Button className="w-full bg-red-600 text-white hover:bg-red-700 focus:ring-red-500">
              {" "}
              Go to Login{" "}
            </Button>{" "}
          </Link>
        </div>
      </div>
    );
  }

  const isLoadingTxWidget = isLoadingTransactions;

  // --- Render ---
  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="truncate text-xl font-semibold text-customBlack sm:text-2xl md:text-3xl">
          {" "}
          Welcome, {accountData?.name ?? "User"}!{" "}
        </h1>
        {socketError && (
          <div className="text-xs text-red-600">{socketError}</div>
        )}
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
            {" "}
            <PreviewSales
              monthlyData={salesData?.monthlySales ?? []}
              isLoading={isLoadingSales}
              onViewDetails={openSalesDetailsModal}
            />{" "}
          </div>
        </div>

        {/* Right Col */}
        <div className="flex flex-col space-y-6 xl:col-span-1">
          <div className="w-full">
            {" "}
            <CalendarUI />{" "}
          </div>
          <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
            <h3 className="mb-3 text-base font-semibold">
              {" "}
              Your Claimed Services{" "}
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
              {" "}
              Owner view.{" "}
            </div>
          ) : accountData ? (
            <PreviewUserSalary
              salary={accountData.salary}
              onOpenDetails={handleViewCurrentDetails}
              onOpenHistory={handleViewHistory}
              isLoading={false}
            />
          ) : (
            <div className="flex min-h-[170px] items-center justify-center rounded-lg border border-red-300 p-4 text-sm text-red-600">
              {" "}
              Salary info error.{" "}
            </div>
          )}
        </div>
      </div>

      {/* --- Modals --- */}
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

      {/* Render modal only when details are ready to avoid passing nulls unnecessarily */}
      {isDetailsModalOpen && currentDetails && (
        <CurrentSalaryDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={closeCurrentDetailsModal}
          isLoading={isLoadingDetails} // Pass loading state for internal spinner
          error={detailsError} // Pass error for internal display
          currentBreakdownItems={currentDetails.breakdownItems}
          currentAttendanceRecords={currentDetails.attendanceRecords}
          accountData={currentDetails.accountData}
          currentPeriodStartDate={currentDetails.periodStartDate}
          currentPeriodEndDate={currentDetails.periodEndDate}
          lastReleasedPayslipEndDate={currentDetails.lastReleasedPayslipEndDate}
          lastReleasedTimestamp={currentDetails.lastReleasedTimestamp}
        />
      )}
      {/* Handle case where modal is open but details are still loading or failed */}
      {isDetailsModalOpen && !currentDetails && (
        <CurrentSalaryDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={closeCurrentDetailsModal}
          isLoading={isLoadingDetails}
          error={detailsError}
          currentBreakdownItems={[]} // Pass empty arrays while loading/error
          currentAttendanceRecords={[]}
          accountData={null}
          currentPeriodStartDate={null}
          currentPeriodEndDate={null}
          lastReleasedPayslipEndDate={null}
          lastReleasedTimestamp={null}
        />
      )}

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
            {" "}
            Failed to load sales data.{" "}
          </div>
        )}
      </Modal>

      {isHistoryModalOpen && (
        <PayslipHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={closeHistoryModal}
          isLoading={isLoadingHistory}
          error={historyError}
          payslips={payslipHistory}
        />
      )}
    </>
  );
}
