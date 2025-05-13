"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Status, Role } from "@prisma/client"; // Your actual Role enum
import {
  AlertCircle,
  Loader2,
  LayoutGrid, // Attendance
  BarChart2, // Sales
  ListChecks, // Claimed Services / Work Queue Link
  Wallet, // Salary
  Users, // Customer History
  Gift, // Claim GC
  Edit3, // Link to Work Queue for WORKER/CASHIER
  FileText, // Link to Transactions for CASHIER
} from "lucide-react";
import { io, Socket } from "socket.io-client";

import {
  getActiveTransactions,
  getCurrentAccountData,
  getSalesDataLast6Months,
  getCurrentSalaryDetails,
  getMyReleasedPayslips,
  requestPayslipRelease,
} from "@/lib/ServerAction";

import CalendarUI from "@/components/ui/Calendar";
import UserServedTodayWidget from "@/components/ui/UserServedTodayWidget";
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
  SalesDataDetailed,
  AvailedServicesProps,
  TransactionProps,
  PayslipData,
  CurrentSalaryDetailsData,
  MobileWidgetKey, // Assuming this is correctly imported from Types.ts
} from "@/lib/Types";

import CustomerHistoryWidget from "@/components/ui/CustomerHistoryWidget";
import ClaimGiftCertificate from "@/components/ui/cashier/ClaimGiftCertificate";
import { MobileWidgetIcon } from "@/components/ui/MobileWidget"; // Ensure MobileWidgetIcon.tsx is fixed for IconComponent type

export default function AccountDashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const router = useRouter();
  const accountIdFromUrl =
    typeof params.accountID === "string" ? params.accountID : undefined;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [allPendingTransactions, setAllPendingTransactions] = useState<
    TransactionProps[]
  >([]);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [salesData, setSalesData] = useState<SalesDataDetailed | null>(null);
  const [currentDetails, setCurrentDetails] =
    useState<CurrentSalaryDetailsData | null>(null);
  const [payslipHistory, setPayslipHistory] = useState<PayslipData[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [isSalesDetailsModalOpen, setIsSalesDetailsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [processingServeActions, setProcessingServeActions] = useState<
    Set<string>
  >(new Set());
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [activeMobileWidget, setActiveMobileWidget] =
    useState<MobileWidgetKey | null>(null);
  const [isMobileViewModalOpen, setIsMobileViewModalOpen] = useState(false);
  const [isLikelyMobile, setIsLikelyMobile] = useState(false);

  const loggedInUserId = session?.user?.id;
  const userRoles = useMemo(() => session?.user?.role || [], [session]);

  const isOwner = useMemo(() => userRoles.includes(Role.OWNER), [userRoles]);
  const isCashier = useMemo(
    () => userRoles.includes(Role.CASHIER),
    [userRoles],
  );
  const isWorker = useMemo(() => userRoles.includes(Role.WORKER), [userRoles]);
  const isAttendanceChecker = useMemo(
    () => userRoles.includes(Role.ATTENDANCE_CHECKER),
    [userRoles],
  );
  const isViewingOwnDashboard = useMemo(
    () => loggedInUserId === accountIdFromUrl,
    [loggedInUserId, accountIdFromUrl],
  );

  useEffect(() => {
    const checkMobile = () => setIsLikelyMobile(window.innerWidth < 1024);
    if (typeof window !== "undefined") {
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }
  }, []);

  useEffect(() => {
    if (!(sessionStatus === "authenticated" && loggedInUserId)) {
      if (socket) {
        socket.disconnect();
        setSocket(null); // Clear the socket state
      }
      setSocketError(null); // Clear any socket errors
      return; // Exit the effect
    }

    if (
      socket &&
      socket.connected &&
      (socket.io.opts.query as { accountId: string })?.accountId ===
        loggedInUserId
    ) {
      return;
    }

    // If there's an old socket instance (e.g. from a previous user or failed attempt), disconnect it.
    // This is important if loggedInUserId changes.
    if (socket) {
      socket.disconnect();
    }

    const backendUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:9000";
    if (!backendUrl) {
      setSocketError("Config Error: Socket URL missing.");
      setSocket(null); // Ensure socket state is cleared
      return;
    }

    console.log(
      `[Socket Setup] Attempting to connect for user: ${loggedInUserId}`,
    );
    const newSocketInstance = io(backendUrl, {
      query: { accountId: loggedInUserId },
      reconnectionAttempts: 3,
      timeout: 10000,
      transports: ["websocket", "polling"], // Good to have polling as a fallback
      // forceNew: true, // Consider this for debugging if issues persist, but usually not needed
    });

    newSocketInstance.on("connect", () => {
      console.log(
        `[Socket] Connected: ${newSocketInstance.id} for user ${loggedInUserId}`,
      );
      setSocketError(null);
    });

    newSocketInstance.on("disconnect", (reason) => {
      console.log(
        `[Socket] Disconnected: ${newSocketInstance.id}, Reason: ${reason}`,
      );
      // Only set error if it's not a manual client disconnect
      if (reason !== "io client disconnect") {
        setSocketError(
          `Socket Disconnected: ${reason}. Attempting to reconnect...`,
        );
      }
    });

    newSocketInstance.on("connect_error", (err) => {
      console.error(`[Socket] Connection Error for ${loggedInUserId}:`, err);
      setSocketError(`Socket Connection Failed: ${err.message}.`);
    });

    setSocket(newSocketInstance);

    return () => {
      console.log(
        `[Socket Cleanup] Disconnecting socket: ${newSocketInstance.id}`,
      );
      newSocketInstance.disconnect();
      // Optionally setSocket(null) here if you want to be very explicit about clearing state on cleanup,
      // but the next run of the effect (if dependencies change) will handle it.
    };
  }, [sessionStatus, loggedInUserId]); // REMOVED `socket` from dependencies
  const handleDashboardAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      if (!updatedAvailedService?.id) return;
      setAllPendingTransactions((prev) =>
        prev
          .map((tx) =>
            tx.id === updatedAvailedService.transactionId
              ? {
                  ...tx,
                  availedServices: (tx.availedServices ?? []).map((s) =>
                    s.id === updatedAvailedService.id
                      ? { ...s, ...updatedAvailedService }
                      : s,
                  ),
                }
              : tx,
          )
          .filter(
            (tx) =>
              !(tx.availedServices ?? []).every(
                (s) =>
                  s.status === Status.DONE || s.status === Status.CANCELLED,
              ),
          ),
      );
      setProcessingServeActions((prev) => {
        const next = new Set(prev);
        next.delete(updatedAvailedService.id);
        return next;
      });
    },
    [],
  );

  const handleDashboardActionError = useCallback(
    (error: { availedServiceId?: string; message?: string }) => {
      if (!error?.availedServiceId) {
        setDashboardError(
          error.message || "An unknown action error occurred on the dashboard.",
        );
        return;
      }
      setDashboardError(
        `Action Failed for service ${error.availedServiceId}: ${error.message || "Unknown error"}`,
      );
      setProcessingServeActions((prev) => {
        const next = new Set(prev);
        next.delete(error.availedServiceId!);
        return next;
      });
    },
    [],
  );

  const handleTransactionCompletionDashboard = useCallback(
    (completedTransaction: TransactionProps) => {
      if (!completedTransaction?.id) return;
      setAllPendingTransactions((prev) =>
        prev.filter((tx) => tx.id !== completedTransaction.id),
      );
    },
    [],
  );

  useEffect(() => {
    if (!socket) return;
    socket.on("availedServiceUpdated", handleDashboardAvailedServiceUpdate);
    socket.on("serviceMarkServedError", handleDashboardActionError);
    socket.on("serviceUnmarkServedError", handleDashboardActionError);
    socket.on("transactionCompleted", handleTransactionCompletionDashboard);
    return () => {
      socket.off("availedServiceUpdated", handleDashboardAvailedServiceUpdate);
      socket.off("serviceMarkServedError", handleDashboardActionError);
      socket.off("serviceUnmarkServedError", handleDashboardActionError);
      socket.off("transactionCompleted", handleTransactionCompletionDashboard);
    };
  }, [
    socket,
    handleDashboardAvailedServiceUpdate,
    handleDashboardActionError,
    handleTransactionCompletionDashboard,
  ]);

  // FIX 2: fetchInitialData with proper Promise.allSettled handling
  const fetchInitialData = useCallback(async () => {
    if (!accountIdFromUrl || !loggedInUserId) {
      setIsLoadingAccount(false);
      setIsLoadingSales(false);
      setIsLoadingTransactions(false);
      return;
    }
    setIsLoadingAccount(true);
    setIsLoadingSales(isOwner);
    setIsLoadingTransactions(true);
    setDashboardError(null);

    try {
      // Define an array of functions that return promises
      const promiseFetchers: (() => Promise<any>)[] = [
        () => getCurrentAccountData(accountIdFromUrl),
        () => getActiveTransactions(),
      ];

      if (isOwner) {
        promiseFetchers.push(() => getSalesDataLast6Months());
      }

      const results = await Promise.allSettled(promiseFetchers.map((f) => f()));

      // Process Account Data (index 0)
      const accountResult = results[0];
      if (accountResult.status === "fulfilled") {
        setAccountData(accountResult.value as AccountData | null);
      } else {
        console.error("Account Data Error:", accountResult.reason);
        setDashboardError("Failed to load account details.");
      }

      // Process Transactions Data (index 1)
      const transactionsResult = results[1];
      if (
        transactionsResult.status === "fulfilled" &&
        Array.isArray(transactionsResult.value)
      ) {
        setAllPendingTransactions(
          transactionsResult.value as TransactionProps[],
        );
      } else {
        console.error(
          "Transactions Error:",
          transactionsResult.status === "rejected"
            ? transactionsResult.reason
            : "Invalid format",
        );
        setAllPendingTransactions([]);
        setDashboardError("Failed to load pending work.");
      }

      // Process Sales Data if Owner (index 2, if present)
      if (isOwner) {
        const salesResultIfOwner = results[2]; // This will be the third result
        if (salesResultIfOwner && salesResultIfOwner.status === "fulfilled") {
          setSalesData(salesResultIfOwner.value as SalesDataDetailed | null);
        } else if (salesResultIfOwner) {
          // It exists but failed
          console.error("Sales Data Error:", salesResultIfOwner.reason);
          setDashboardError("Failed to load sales data.");
        }
      } else {
        setSalesData(null); // Not owner, so no sales data
      }
    } catch (error: any) {
      // This catch is for errors in setting up Promise.allSettled or other unexpected issues
      // Individual promise rejections are handled by checking `result.status`
      console.error(
        "General Data Fetch Error in Promise.allSettled setup:",
        error,
      );
      setDashboardError(
        `Error loading dashboard: ${error.message || "Unknown error"}`,
      );
    } finally {
      setIsLoadingAccount(false);
      setIsLoadingSales(false);
      setIsLoadingTransactions(false);
    }
  }, [loggedInUserId, accountIdFromUrl, isOwner]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && accountIdFromUrl) {
      fetchInitialData();
    } else {
      setAccountData(null);
      setSalesData(null);
      setAllPendingTransactions([]);
      const stillLoadingSession = sessionStatus === "loading";
      setIsLoadingAccount(stillLoadingSession || !accountIdFromUrl);
      setIsLoadingSales(stillLoadingSession || !accountIdFromUrl || !isOwner);
      setIsLoadingTransactions(stillLoadingSession || !accountIdFromUrl);
    }
  }, [sessionStatus, accountIdFromUrl, fetchInitialData, isOwner]);

  const servicesCheckedByMe = useMemo(() => {
    if (!loggedInUserId || !allPendingTransactions || !isWorker) return [];
    return allPendingTransactions
      .filter((tx) => tx.status === Status.PENDING)
      .flatMap(
        (tx) =>
          tx.availedServices?.map((as) => ({
            ...as,
            transactionStatus: tx.status,
          })) ?? [],
      )
      .filter(
        (s) => s.checkedById === loggedInUserId && s.status === Status.PENDING,
      );
  }, [allPendingTransactions, loggedInUserId, isWorker]);

  const openMyServicesModal = useCallback(
    () => setIsMyServicesModalOpen(true),
    [],
  );
  const closeMyServicesModal = useCallback(
    () => setIsMyServicesModalOpen(false),
    [],
  );
  const openSalesDetailsModal = useCallback(
    () => setIsSalesDetailsModalOpen(true),
    [],
  );
  const closeSalesDetailsModal = useCallback(
    () => setIsSalesDetailsModalOpen(false),
    [],
  );
  const closeCurrentDetailsModal = useCallback(
    () => setIsDetailsModalOpen(false),
    [],
  );
  const closeHistoryModal = useCallback(() => setIsHistoryModalOpen(false), []);
  const closeMobilePreview = useCallback(() => {
    setActiveMobileWidget(null);
    setIsMobileViewModalOpen(false);
  }, []);

  const handleViewCurrentDetails = useCallback(async () => {
    if (!loggedInUserId) return;
    setIsLoadingDetails(true);
    setDetailsError(null);
    setCurrentDetails(null);
    setIsDetailsModalOpen(true);
    try {
      const details = await getCurrentSalaryDetails(loggedInUserId);
      if (details) setCurrentDetails(details);
      else setDetailsError("Failed to load current salary details.");
    } catch (err: any) {
      setDetailsError(err.message || "Could not load current salary details.");
    } finally {
      setIsLoadingDetails(false);
    }
  }, [loggedInUserId]);

  const handleViewHistory = useCallback(async () => {
    if (!loggedInUserId) return;
    setIsLoadingHistory(true);
    setHistoryError(null);
    setPayslipHistory([]);
    setIsHistoryModalOpen(true);
    try {
      const history = await getMyReleasedPayslips(loggedInUserId);
      if (Array.isArray(history)) setPayslipHistory(history);
      else setHistoryError("Failed to load payslip history.");
    } catch (err: any) {
      setHistoryError(err.message || "Could not load payslip history.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [loggedInUserId]);

  const handleRequestCurrentPayslip = useCallback(async (accountId: string) => {
    try {
      const result = await requestPayslipRelease(accountId);
      alert(
        result.message ||
          (result.success
            ? "Payslip release requested."
            : `Request failed: ${result.error || "Unknown"}`),
      );
      return result;
    } catch (error: any) {
      alert(`Request error: ${error.message || "Unknown"}`);
      return { success: false, error: error.message || "Unknown" };
    }
  }, []);

  const isOverallDashboardLoading = useMemo(() => {
    return (
      sessionStatus === "loading" ||
      !accountIdFromUrl ||
      (isLoadingAccount && !accountData) ||
      (isOwner &&
        isLoadingSales &&
        !salesData &&
        sessionStatus === "authenticated") ||
      (isLoadingTransactions && sessionStatus === "authenticated")
    );
  }, [
    sessionStatus,
    accountIdFromUrl,
    isLoadingAccount,
    accountData,
    isLoadingSales,
    salesData,
    isOwner,
    isLoadingTransactions,
  ]);

  const mobileWidgetsConfig = useMemo(() => {
    const widgets: Array<{
      key: MobileWidgetKey;
      title: string;
      Icon: React.ElementType; // Assuming MobileWidgetIcon.tsx is fixed for this
      isLoading: boolean;
      component?: React.ReactNode;
      link?: string;
      onDetailsClick?: () => void;
      notificationCount?: number;
      roles: Role[];
    }> = [
      {
        key: "attendance",
        title: "Attendance",
        Icon: LayoutGrid,
        isLoading: isOverallDashboardLoading,
        component:
          loggedInUserId && accountIdFromUrl ? (
            <ManageAttendance
              viewedAccountId={accountIdFromUrl}
              checkerId={loggedInUserId}
            />
          ) : (
            <LoadingWidget text="Loading..." />
          ),
        roles: [Role.OWNER, Role.ATTENDANCE_CHECKER],
      },
      {
        key: "sales",
        title: "Sales Overview",
        Icon: BarChart2,
        isLoading: isLoadingSales,
        component: (
          <PreviewSales
            monthlyData={salesData?.monthlySales ?? []}
            isLoading={isLoadingSales}
            onViewDetails={openSalesDetailsModal}
          />
        ),
        onDetailsClick: openSalesDetailsModal,
        roles: [Role.OWNER],
      },
      {
        key: "workQueueLink",
        title: "Work Queue",
        Icon: Edit3,
        isLoading: false,
        link: `/${accountIdFromUrl}/work`,
        roles: [Role.WORKER, Role.CASHIER],
      },
      {
        key: "claimedServices",
        title: "My Claims",
        Icon: ListChecks,
        notificationCount: servicesCheckedByMe.length,
        isLoading: isLoadingTransactions,
        component: (
          <PreviewListedServices
            checkedServices={servicesCheckedByMe}
            onOpenModal={openMyServicesModal}
            isLoading={isLoadingTransactions}
          />
        ),
        onDetailsClick: openMyServicesModal,
        roles: [Role.WORKER],
      },
      {
        key: "salary",
        title: "My Salary",
        Icon: Wallet,
        isLoading: isLoadingAccount,
        component: (
          <PreviewUserSalary
            salary={accountData?.salary ?? 0}
            onOpenDetails={handleViewCurrentDetails}
            onOpenHistory={handleViewHistory}
            isLoading={isLoadingAccount}
          />
        ),
        roles: userRoles.filter(
          (role) => role !== Role.OWNER && isViewingOwnDashboard,
        ),
      },

      {
        key: "claimGC",
        title: "Claim GC",
        Icon: Gift,
        isLoading: false,
        component: <ClaimGiftCertificate />,
        roles: [Role.OWNER, Role.CASHIER],
      },
      {
        key: "customerHistory",
        title: "Customers",
        Icon: Users,
        isLoading: isOverallDashboardLoading,
        component: <CustomerHistoryWidget />,
        roles: [Role.OWNER, Role.CASHIER],
      },
    ];
    return widgets.filter((w) =>
      w.roles.some((role) => userRoles.includes(role)),
    );
  }, [
    isOverallDashboardLoading,
    loggedInUserId,
    accountIdFromUrl,
    isLoadingSales,
    salesData,
    openSalesDetailsModal,
    servicesCheckedByMe,
    isLoadingTransactions,
    openMyServicesModal,
    isLoadingAccount,
    accountData,
    handleViewCurrentDetails,
    handleViewHistory,
    userRoles,
    isWorker,
    isCashier,
    isOwner,
    isViewingOwnDashboard,
  ]);

  const onMobileWidgetIconClick = useCallback(
    (widgetKey: MobileWidgetKey) => {
      const config = mobileWidgetsConfig.find((w) => w.key === widgetKey);
      if (config?.link && accountIdFromUrl) {
        router.push(config.link);
        return;
      }
      setActiveMobileWidget((prevActiveWidget) => {
        if (prevActiveWidget === widgetKey && isMobileViewModalOpen) {
          if (config?.onDetailsClick) {
            setIsMobileViewModalOpen(false);
            config.onDetailsClick();
            return null;
          } else {
            setIsMobileViewModalOpen(false);
            return null;
          }
        } else {
          setIsMobileViewModalOpen(!!config?.component);
          return widgetKey;
        }
      });
    },
    [isMobileViewModalOpen, mobileWidgetsConfig, router, accountIdFromUrl],
  );

  if (sessionStatus === "loading") {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <LoadingWidget text="Authenticating..." />
      </div>
    );
  }
  if (sessionStatus !== "authenticated" || !accountIdFromUrl) {
    router.replace("/auth/signin");
    return null;
  }
  if (sessionStatus === "authenticated" && !isLoadingAccount && !accountData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 text-center text-red-700">
        <AlertCircle className="mb-4 h-12 w-12" />
        <h2 className="mb-2 text-xl font-semibold">Account Data Error</h2>
        <p>
          Could not load data for account ID: {accountIdFromUrl}.{" "}
          {dashboardError}
        </p>
        <Button
          onClick={fetchInitialData}
          disabled={isLoadingAccount || isLoadingTransactions}
          className="mr-2 mt-4"
        >
          {isLoadingAccount ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}{" "}
          Try Again
        </Button>
        {loggedInUserId === accountIdFromUrl ? (
          <Button
            onClick={() => router.push("/api/auth/signout")}
            invert
            className="mt-4"
          >
            Sign Out
          </Button>
        ) : (
          <Link href={`/${loggedInUserId}`} className="mt-4">
            <Button invert>My Dashboard</Button>
          </Link>
        )}
      </div>
    );
  }
  if (isOverallDashboardLoading && sessionStatus === "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <LoadingWidget text="Loading Dashboard..." />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="truncate text-xl font-semibold text-customBlack sm:text-2xl md:text-3xl">
          Welcome, {session?.user?.name ?? "User"}!
          {accountData &&
            loggedInUserId !== accountData.id &&
            (isOwner || isAttendanceChecker) && (
              <span className="ml-2 text-base font-normal text-gray-500">
                (Viewing {accountData.name}'s Profile)
              </span>
            )}
        </h1>
        {(socketError || dashboardError) && !isOverallDashboardLoading && (
          <div className="flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-600">
            <AlertCircle size={14} /> {socketError || dashboardError}
          </div>
        )}
      </div>

      <div className="hidden xl:block">
        {isOwner ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 xl:gap-8">
            <div className="space-y-6 xl:col-span-2">
              {(isOwner || isAttendanceChecker) && ( // Kept broad for now, can be refined if ManageAttendance differs for Owner
                <div className="min-h-[300px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
                  <h3 className="mb-3 text-base font-semibold text-customBlack">
                    Daily Attendance
                  </h3>
                  {loggedInUserId && accountIdFromUrl ? (
                    <ManageAttendance
                      viewedAccountId={accountIdFromUrl}
                      checkerId={loggedInUserId}
                    />
                  ) : (
                    <LoadingWidget text="Loading Attendance..." />
                  )}
                </div>
              )}
              {/* Sales Preview - OWNER only */}
              <div className="w-full">
                <PreviewSales
                  monthlyData={salesData?.monthlySales ?? []}
                  isLoading={isLoadingSales}
                  onViewDetails={openSalesDetailsModal}
                />
              </div>
            </div>
            <div className="flex flex-col space-y-6 xl:col-span-1">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between md:gap-6">
                <CalendarUI />
                {loggedInUserId && (
                  <UserServedTodayWidget loggedInUserId={loggedInUserId} />
                )}
              </div>

              <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
                <ClaimGiftCertificate />
              </div>
              {loggedInUserId && (
                <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
                  <CustomerHistoryWidget />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:gap-8">
            <div className="space-y-6">
              {isAttendanceChecker && (
                <div className="min-h-[300px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
                  <h3 className="mb-3 text-base font-semibold text-customBlack">
                    Daily Attendance
                  </h3>
                  {loggedInUserId && accountIdFromUrl ? (
                    <ManageAttendance
                      viewedAccountId={accountIdFromUrl}
                      checkerId={loggedInUserId}
                    />
                  ) : (
                    <LoadingWidget text="Loading Attendance..." />
                  )}
                </div>
              )}

              {isWorker && isViewingOwnDashboard && (
                <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-0 shadow-custom backdrop-blur-sm sm:p-4">
                  <PreviewListedServices
                    checkedServices={servicesCheckedByMe}
                    onOpenModal={openMyServicesModal}
                    isLoading={isLoadingTransactions}
                  />
                </div>
              )}

              {isOwner && loggedInUserId && (
                <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
                  <CustomerHistoryWidget />
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between md:gap-6">
                <CalendarUI />
                {loggedInUserId && (
                  <UserServedTodayWidget loggedInUserId={loggedInUserId} />
                )}
              </div>

              {isViewingOwnDashboard &&
                !isOwner &&
                accountData && ( // All non-owners (Cashier, Worker, AC) see their salary
                  <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-0 shadow-custom backdrop-blur-sm sm:p-4">
                    <PreviewUserSalary
                      salary={accountData.salary ?? 0}
                      onOpenDetails={handleViewCurrentDetails}
                      onOpenHistory={handleViewHistory}
                      isLoading={isLoadingAccount}
                    />
                  </div>
                )}

              {isCashier && ( // Owner also sees this but in their own layout section
                <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
                  <ClaimGiftCertificate />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="block xl:hidden">
        {(!activeMobileWidget || !isMobileViewModalOpen) && (
          <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 sm:gap-4">
            {mobileWidgetsConfig.map((widget) => (
              <MobileWidgetIcon
                key={widget.key}
                IconComponent={widget.Icon}
                title={widget.title}
                widgetKey={widget.key}
                onClick={onMobileWidgetIconClick}
                notificationCount={widget.notificationCount}
                isActive={
                  activeMobileWidget === widget.key && isMobileViewModalOpen
                }
                isLoading={widget.isLoading}
              />
            ))}
          </div>
        )}
        <Modal
          isOpen={isMobileViewModalOpen && !!activeMobileWidget}
          onClose={closeMobilePreview}
          title={
            <DialogTitle>
              {mobileWidgetsConfig.find((w) => w.key === activeMobileWidget)
                ?.title || "Details"}
            </DialogTitle>
          }
          containerClassName="m-auto max-h-[85vh] w-full max-w-md overflow-hidden rounded-lg bg-customOffWhite shadow-xl flex flex-col"
          contentClassName="p-0 flex-grow"
        >
          <div className="h-full overflow-y-auto bg-white p-3 sm:p-4">
            {
              mobileWidgetsConfig.find((w) => w.key === activeMobileWidget)
                ?.component
            }
            {mobileWidgetsConfig.find((w) => w.key === activeMobileWidget)
              ?.onDetailsClick && (
              <div className="mt-6 flex justify-center border-t border-customGray/20 pb-4 pt-4">
                <Button
                  onClick={() => {
                    const config = mobileWidgetsConfig.find(
                      (w) => w.key === activeMobileWidget,
                    );
                    if (config?.onDetailsClick) {
                      closeMobilePreview();
                      config.onDetailsClick();
                    }
                  }}
                  variant="primary"
                  className="w-full max-w-xs"
                >
                  View Full Details
                </Button>
              </div>
            )}
          </div>
        </Modal>
      </div>

      {isWorker && isViewingOwnDashboard && (
        <Modal
          isOpen={isMyServicesModalOpen}
          onClose={closeMyServicesModal}
          title={<DialogTitle>Manage Claimed Services</DialogTitle>}
          size="lg"
        >
          {loggedInUserId && socket && !isLoadingTransactions ? (
            <ExpandedListedServices
              services={servicesCheckedByMe}
              accountId={loggedInUserId}
              socket={socket}
              onClose={closeMyServicesModal}
              processingServeActions={processingServeActions}
              setProcessingServeActions={setProcessingServeActions}
            />
          ) : (
            <LoadingWidget text="Loading services..." />
          )}
        </Modal>
      )}
      {isViewingOwnDashboard &&
        !isOwner &&
        loggedInUserId &&
        isDetailsModalOpen && (
          <CurrentSalaryDetailsModal
            isOpen={isDetailsModalOpen}
            onClose={closeCurrentDetailsModal}
            isLoading={isLoadingDetails}
            error={detailsError}
            currentBreakdownItems={currentDetails?.breakdownItems ?? []}
            currentAttendanceRecords={currentDetails?.attendanceRecords ?? []}
            accountData={currentDetails?.accountData ?? null}
            currentPeriodStartDate={
              currentDetails?.currentPeriodStartDate ?? null
            }
            currentPeriodEndDate={currentDetails?.currentPeriodEndDate ?? null}
            lastReleasedPayslipEndDate={
              currentDetails?.lastReleasedPayslipEndDate ?? null
            }
            lastReleasedTimestamp={
              currentDetails?.lastReleasedTimestamp ?? null
            }
            onRequestCurrentPayslip={handleRequestCurrentPayslip}
          />
        )}
      {isOwner && isSalesDetailsModalOpen && loggedInUserId && (
        <Modal
          isOpen={isSalesDetailsModalOpen}
          onClose={closeSalesDetailsModal}
          title={<DialogTitle>Sales Details (Last 6 Months)</DialogTitle>}
          size="xl"
        >
          <ExpandedSales
            monthlyData={salesData?.monthlySales ?? []}
            paymentTotals={
              salesData?.paymentMethodTotals ?? {
                cash: 0,
                ewallet: 0,
                bank: 0,
                unknown: 0,
              }
            }
            grandTotal={salesData?.grandTotal ?? 0}
            overallTotalExpenses={salesData?.overallTotalExpenses ?? 0}
            isLoading={isLoadingSales}
            onClose={closeSalesDetailsModal}
            isOwner={isOwner}
            branches={salesData?.branches ?? []}
            onDataRefresh={fetchInitialData}
            loggedInUserId={loggedInUserId}
          />
        </Modal>
      )}
      {isViewingOwnDashboard &&
        !isOwner &&
        loggedInUserId &&
        isHistoryModalOpen && (
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
