"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Status, Role } from "@prisma/client";
import {
  AlertCircle,
  Loader2,
  LayoutGrid,
  BarChart2,
  ListChecks,
  Wallet,
  Users,
  Gift,
  Edit3,
  FileText,
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
import ManageTransactionsModal from "@/components/ui/ManageTransactionsModal";

import {
  AccountData,
  SalesDataDetailed,
  AvailedServicesProps,
  TransactionProps,
  PayslipData,
  CurrentSalaryDetailsData,
  MobileWidgetKey,
} from "@/lib/Types";

import CustomerHistoryWidget from "@/components/ui/CustomerHistoryWidget";
import ClaimGiftCertificate from "@/components/ui/cashier/ClaimGiftCertificate";
import { MobileWidgetIcon } from "@/components/ui/MobileWidget";

export default function AccountDashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const router = useRouter();
  const accountIdFromUrl =
    typeof params.accountID === "string" ? params.accountID : undefined;

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
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
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);

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
      if (socketRef.current) {
        console.log(
          "[Socket Cleanup] Disconnecting due to auth status change:",
          socketRef.current.id,
        );
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      setSocketError(null);
      return;
    }

    if (
      socketRef.current &&
      socketRef.current.connected &&
      (socketRef.current.io.opts.query as { accountId: string })?.accountId ===
        loggedInUserId
    ) {
      setSocket(socketRef.current);
      return;
    }

    if (socketRef.current) {
      console.log(
        "[Socket Cleanup] Disconnecting old/stale socket from ref:",
        socketRef.current.id,
      );
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const backendUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "https://localhost:9000";
    if (!backendUrl) {
      setSocketError("Config Error: Socket URL missing.");
      setSocket(null);
      return;
    }

    console.log(
      `[Socket Setup] Attempting to connect for user: ${loggedInUserId}`,
    );
    const newSocketInstance = io(backendUrl, {
      query: { accountId: loggedInUserId },
      reconnectionAttempts: 3,
      timeout: 10000,
      transports: ["websocket", "polling"],
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
      if (reason !== "io client disconnect") {
        setSocketError(`Socket Disconnected: ${reason}.`);
      }
    });

    newSocketInstance.on("connect_error", (err) => {
      console.error(`[Socket] Connection Error for ${loggedInUserId}:`, err);
      setSocketError(`Socket Connection Failed: ${err.message}.`);
    });

    socketRef.current = newSocketInstance;
    setSocket(newSocketInstance);

    return () => {
      console.log(
        `[Socket Cleanup] useEffect cleanup. Disconnecting: ${newSocketInstance.id}`,
      );
      newSocketInstance.disconnect();
      if (socketRef.current && socketRef.current.id === newSocketInstance.id) {
        socketRef.current = null;
      }
    };
  }, [sessionStatus, loggedInUserId]);

  const handleDashboardAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      if (!updatedAvailedService?.id) return;
      setAllPendingTransactions((prev) =>
        prev.map((tx) =>
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
      console.log(
        `[Socket TXN Complete] Received completion for TXN ${completedTransaction.id}`,
      );
      setAllPendingTransactions((prev) =>
        prev.filter((tx) => tx.id !== completedTransaction.id),
      );
      setProcessingServeActions((prev) => {
        let changed = false;
        const next = new Set(prev);
        completedTransaction.availedServices?.forEach((as) => {
          if (next.has(as.id)) {
            next.delete(as.id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
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
      const accountResult = await getCurrentAccountData(accountIdFromUrl);
      if (accountResult) {
        setAccountData(accountResult as AccountData);
        setIsLoadingAccount(false);
      } else {
        console.error("Account Data Error: No data returned.");
        setDashboardError((prev) => prev || "Failed to load account details.");
        setIsLoadingAccount(false);
      }

      const otherFetchers: (() => Promise<any>)[] = [
        () => getActiveTransactions(),
      ];
      if (isOwner) {
        otherFetchers.push(() => getSalesDataLast6Months());
      }

      const otherResults = await Promise.allSettled(
        otherFetchers.map((f) => f()),
      );

      const transactionsResult =
        otherFetchers.length > 0 ? otherResults[0] : null;
      if (
        transactionsResult &&
        transactionsResult.status === "fulfilled" &&
        Array.isArray(transactionsResult.value)
      ) {
        setAllPendingTransactions(
          transactionsResult.value as TransactionProps[],
        );
      } else if (transactionsResult) {
        console.error(
          "Transactions Error:",
          transactionsResult.status === "rejected"
            ? transactionsResult.reason
            : "Invalid format",
        );
        setAllPendingTransactions([]);
      }
      setIsLoadingTransactions(false);

      if (isOwner) {
        const salesResultIfOwner =
          otherFetchers.length > 1 ? otherResults[1] : null;
        if (salesResultIfOwner && salesResultIfOwner.status === "fulfilled") {
          setSalesData(salesResultIfOwner.value as SalesDataDetailed | null);
        } else if (salesResultIfOwner) {
          console.error("Sales Data Error:", salesResultIfOwner.reason);
        }
        setIsLoadingSales(false);
      } else {
        setSalesData(null);
        setIsLoadingSales(false);
      }
    } catch (error: any) {
      console.error(
        "General Data Fetch Error in Promise.allSettled setup:",
        error,
      );
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
      setDashboardError(null);
    }
  }, [sessionStatus, accountIdFromUrl, fetchInitialData, isOwner]);

  const servicesCheckedByMe = useMemo(() => {
    if (!loggedInUserId || !allPendingTransactions) return [];

    const relevantServices: AvailedServicesProps[] = [];

    for (const tx of allPendingTransactions) {
      if (tx.status === Status.PENDING || tx.status === Status.CANCELLED) {
        if (tx.availedServices) {
          for (const as of tx.availedServices) {
            const isPendingAndCheckedByMe =
              as.status === Status.PENDING && as.checkedById === loggedInUserId;

            const isDoneAndServedByMe =
              as.status === Status.DONE && as.servedById === loggedInUserId;

            if (isPendingAndCheckedByMe || isDoneAndServedByMe) {
              relevantServices.push({
                ...as,
              });
            }
          }
        }
      }
    }

    relevantServices.sort((a, b) => {
      const txA = allPendingTransactions.find((t) => t.id === a.transactionId);
      const txB = allPendingTransactions.find((t) => t.id === b.transactionId);
      const bookedForA = txA?.bookedFor?.getTime() ?? 0;
      const bookedForB = txB?.bookedFor?.getTime() ?? 0;
      return bookedForA - bookedForB;
    });

    return relevantServices;
  }, [allPendingTransactions, loggedInUserId]);

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

  const openTransactionsModal = useCallback(
    () => setIsTransactionsModalOpen(true),
    [],
  );
  const closeTransactionsModal = useCallback(
    () => setIsTransactionsModalOpen(false),
    [],
  );

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

  const handleRequestCurrentPayslip = useCallback(
    async (accountId: string) => {
      try {
        const result = await requestPayslipRelease(accountId);
        alert(
          result.message ||
            (result.success
              ? "Payslip release requested."
              : `Request failed: ${result.error || "Unknown"}`),
        );
        if (result.success) {
          handleViewCurrentDetails();
        }
        return result;
      } catch (error: any) {
        alert(`Request error: ${error.message || "Unknown"}`);
        return { success: false, error: error.message || "Unknown" };
      }
    },
    [handleViewCurrentDetails],
  );

  const isOverallDashboardLoading = useMemo(() => {
    return (
      sessionStatus === "loading" ||
      !accountIdFromUrl ||
      (isLoadingAccount && !accountData && sessionStatus === "authenticated")
    );
  }, [sessionStatus, accountIdFromUrl, isLoadingAccount, accountData]);

  const mobileWidgetsConfig = useMemo(() => {
    const widgets: Array<{
      key: MobileWidgetKey;
      title: string;
      Icon: React.ElementType;
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
        roles: [Role.OWNER, Role.ATTENDANCE_CHECKER],
      },
      {
        key: "sales",
        title: "Sales Overview",
        Icon: BarChart2,
        isLoading: isLoadingSales,
        onDetailsClick: openSalesDetailsModal,
        roles: [Role.OWNER],
      },
      {
        key: "workQueueLink",
        title: "Work Queue",
        Icon: Edit3,
        isLoading: false,
        link: `/${accountIdFromUrl}/work`,
        roles: [Role.WORKER, Role.CASHIER, Role.OWNER],
      },
      {
        key: "claimedServices",
        title: "My Claims",
        Icon: ListChecks,
        notificationCount: servicesCheckedByMe.length,
        isLoading: isLoadingTransactions,
        onDetailsClick: openMyServicesModal,
        roles: isViewingOwnDashboard ? [Role.WORKER, Role.OWNER] : [],
      },
      {
        key: "salary",
        title: "My Salary",
        Icon: Wallet,
        isLoading: isLoadingAccount,
        roles: isViewingOwnDashboard
          ? userRoles.filter((r) => r !== Role.OWNER)
          : [],
      },
      {
        key: "transactionsLink",
        title: "Transactions",
        Icon: FileText,
        isLoading: false,
        onDetailsClick: openTransactionsModal,
        roles: [Role.CASHIER, Role.OWNER],
      },
      {
        key: "claimGC",
        title: "Claim GC",
        Icon: Gift,
        isLoading: false,
        roles: [Role.OWNER, Role.CASHIER],
      },
      {
        key: "customerHistory",
        title: "Customers",
        Icon: Users,
        isLoading: isOverallDashboardLoading,
        roles: [Role.OWNER],
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
    openSalesDetailsModal,
    servicesCheckedByMe.length,
    isLoadingTransactions,
    openMyServicesModal,
    isLoadingAccount,
    userRoles,
    isViewingOwnDashboard,
    openTransactionsModal,
  ]);

  const onMobileWidgetIconClick = useCallback(
    (widgetKey: MobileWidgetKey) => {
      const config = mobileWidgetsConfig.find((w) => w.key === widgetKey);
      if (!config) return;

      if (config.link && accountIdFromUrl) {
        router.push(config.link);
        return;
      }

      if (config.onDetailsClick) {
        config.onDetailsClick();

        setIsMobileViewModalOpen(false);
        setActiveMobileWidget(null);
        return;
      }

      const componentRenderKeys: MobileWidgetKey[] = [
        "attendance",
        "claimGC",
        "customerHistory",
        "salary",
      ];
      if (componentRenderKeys.includes(widgetKey)) {
        setActiveMobileWidget(widgetKey);
        setIsMobileViewModalOpen(true);
      } else {
        console.warn(
          `Clicked widget key "${widgetKey}" has no defined action (link, dedicated modal handler, or mobile component render).`,
        );
      }
    },
    [
      mobileWidgetsConfig,
      router,
      accountIdFromUrl,

      openTransactionsModal,
      openSalesDetailsModal,
      openMyServicesModal,
      handleViewCurrentDetails,
      handleViewHistory,
    ],
  );

  const renderMobileWidgetComponent = useCallback(() => {
    if (!activeMobileWidget) return null;

    const widgetConfig = mobileWidgetsConfig.find(
      (w) => w.key === activeMobileWidget,
    );

    if (widgetConfig?.isLoading) {
      return <LoadingWidget text={`Loading ${widgetConfig.title}...`} />;
    }

    switch (activeMobileWidget) {
      case "attendance":
        return (isOwner || isAttendanceChecker) &&
          loggedInUserId &&
          accountIdFromUrl ? (
          <ManageAttendance
            viewedAccountId={accountIdFromUrl}
            checkerId={loggedInUserId}
          />
        ) : (
          <div className="p-4 text-center text-red-600">
            Access Denied or data missing.
          </div>
        );

      case "salary":
        if (
          isViewingOwnDashboard &&
          !isOwner &&
          loggedInUserId &&
          accountData
        ) {
          return (
            <PreviewUserSalary
              salary={accountData.salary ?? 0}
              onOpenDetails={handleViewCurrentDetails}
              onOpenHistory={handleViewHistory}
              isLoading={isLoadingAccount}
              onRefresh={fetchInitialData}
            />
          );
        } else {
          return (
            <div className="p-4 text-center text-red-600">
              Access Denied or data missing.
            </div>
          );
        }

      case "claimGC":
        return isOwner || isCashier ? (
          <ClaimGiftCertificate />
        ) : (
          <div className="p-4 text-center text-red-600">Access Denied.</div>
        );
      case "customerHistory":
        return isOwner ? (
          <CustomerHistoryWidget />
        ) : (
          <div className="p-4 text-center text-red-600">Access Denied.</div>
        );

      default:
        return (
          <div className="p-4 text-center text-gray-500">
            Widget component not available for mobile preview.
          </div>
        );
    }
  }, [
    activeMobileWidget,
    mobileWidgetsConfig,
    isOwner,
    isAttendanceChecker,
    loggedInUserId,
    accountIdFromUrl,
    isViewingOwnDashboard,
    isCashier,
    accountData,
    isLoadingAccount,
    handleViewCurrentDetails,
    handleViewHistory,
    fetchInitialData,
  ]);

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

  if (sessionStatus === "authenticated" && isOverallDashboardLoading) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <LoadingWidget text="Loading Dashboard..." />
      </div>
    );
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
          disabled={isLoadingAccount || isLoadingTransactions || isLoadingSales}
          className="mr-2 mt-4"
        >
          {isLoadingAccount || isLoadingTransactions || isLoadingSales ? (
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

  return (
    <>
      <div className="mb-6 flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="truncate text-xl font-semibold text-customBlack sm:text-2xl md:text-3xl">
          Welcome, {accountData?.name ?? session?.user?.name ?? "User"}!
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
          {(isOwner || isAttendanceChecker) &&
          accountIdFromUrl &&
          loggedInUserId ? (
            <div className="min-h-[300px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm md:col-span-2 xl:col-span-2">
              <h3 className="mb-3 text-base font-semibold text-customBlack">
                Daily Attendance
              </h3>
              <ManageAttendance
                viewedAccountId={accountIdFromUrl}
                checkerId={loggedInUserId}
              />
            </div>
          ) : null}

          {isOwner ? (
            <div className="w-full md:col-span-2 xl:col-span-1">
              <PreviewSales
                monthlyData={salesData?.monthlySales ?? []}
                isLoading={isLoadingSales}
                onViewDetails={openSalesDetailsModal}
              />
            </div>
          ) : null}

          <div
            className={`flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between md:col-span-2 md:gap-6 xl:col-span-1 xl:flex-row xl:flex-wrap xl:gap-4 ${isOwner || isAttendanceChecker ? "xl:col-start-3 xl:row-start-1" : "xl:col-start-1 xl:row-start-1"}`}
          >
            <CalendarUI className="aspect-square w-full sm:w-auto xl:flex-1" />
            {loggedInUserId && (
              <UserServedTodayWidget
                loggedInUserId={loggedInUserId}
                className="aspect-square w-full sm:w-auto xl:flex-1"
              />
            )}

            {(isOwner || isCashier) && loggedInUserId ? (
              <button
                onClick={openTransactionsModal}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-customOffWhite p-4 text-center text-sm font-medium text-customDarkPink shadow-custom transition-all duration-150 hover:bg-customDarkPink/70 hover:text-customOffWhite"
              >
                <FileText size={18} />
                View Transactions
              </button>
            ) : null}
          </div>

          {/* FIX: Allow OWNER or WORKER to see their claimed services preview */}
          {(isWorker || isOwner) && isViewingOwnDashboard ? (
            <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite p-0 shadow-custom backdrop-blur-sm sm:p-4 md:col-span-1 xl:col-span-1">
              <PreviewListedServices
                checkedServices={servicesCheckedByMe}
                onOpenModal={openMyServicesModal}
                isLoading={isLoadingTransactions}
                onRefresh={fetchInitialData}
              />
            </div>
          ) : null}

          {/* Keep salary preview logic the same */}
          {!isOwner && isViewingOwnDashboard && accountData ? (
            <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-0 shadow-custom backdrop-blur-sm sm:p-4 md:col-span-1 xl:col-span-1">
              <PreviewUserSalary
                salary={accountData.salary ?? 0}
                onOpenDetails={handleViewCurrentDetails}
                onOpenHistory={handleViewHistory}
                isLoading={isLoadingAccount}
                onRefresh={fetchInitialData}
              />
            </div>
          ) : null}

          {(isWorker || isCashier || isOwner) && accountIdFromUrl ? (
            <Link
              href={`/${accountIdFromUrl}/work`}
              className="flex items-center justify-center gap-2 rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 text-center text-sm font-medium text-customDarkPink shadow-custom backdrop-blur-sm hover:bg-customDarkPink/10 md:col-span-1 xl:col-span-1"
            >
              <Edit3 size={18} /> Go to Work Queue
            </Link>
          ) : null}

          {isOwner || isCashier ? (
            <div className="rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm md:col-span-1 xl:col-span-1">
              <ClaimGiftCertificate />
            </div>
          ) : null}

          {isOwner ? (
            <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm md:col-span-1 xl:col-span-1">
              <CustomerHistoryWidget />
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile View */}
      <div className="block xl:hidden">
        {(!activeMobileWidget || !isMobileViewModalOpen) && (
          <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 sm:gap-4">
            {/* Calendar and Served Today remain directly rendered */}
            <CalendarUI />
            {loggedInUserId && (
              <UserServedTodayWidget loggedInUserId={loggedInUserId} />
            )}
            {/* Mobile Widget Icons */}
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

        {/* General Modal for Mobile Widget Components */}
        {/* This modal is only for widgets whose content is rendered directly inside it */}
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
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            {renderMobileWidgetComponent()}
          </div>
        </Modal>
      </div>

      {/* Dedicated Modals (can be triggered from desktop or mobile widget click) */}

      {/* FIX: Allow OWNER or WORKER to open the Expanded Listed Services modal */}
      {loggedInUserId &&
        socket &&
        (isWorker || isOwner) &&
        isViewingOwnDashboard && (
          <Modal
            isOpen={isMyServicesModalOpen}
            onClose={closeMyServicesModal}
            title={<DialogTitle>Manage Claimed Services</DialogTitle>}
            size="lg"
          >
            <ExpandedListedServices
              services={servicesCheckedByMe}
              accountId={loggedInUserId}
              socket={socket}
              onClose={closeMyServicesModal}
              onRefresh={fetchInitialData}
              isLoading={isLoadingTransactions}
              processingServeActions={processingServeActions}
              setProcessingServeActions={setProcessingServeActions}
            />
          </Modal>
        )}

      {isViewingOwnDashboard && !isOwner && loggedInUserId && (
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
          lastReleasedTimestamp={currentDetails?.lastReleasedTimestamp ?? null}
          onRequestCurrentPayslip={handleRequestCurrentPayslip as any}
        />
      )}

      {isOwner && loggedInUserId && salesData && (
        <Modal
          isOpen={isSalesDetailsModalOpen}
          onClose={closeSalesDetailsModal}
          title={<DialogTitle>Sales Details (Last 6 Months)</DialogTitle>}
          size="xl"
        >
          <ExpandedSales
            monthlyData={salesData.monthlySales ?? []}
            paymentTotals={
              salesData.paymentMethodTotals ?? {
                cash: 0,
                ewallet: 0,
                bank: 0,
                unknown: 0,
              }
            }
            grandTotal={salesData.grandTotal ?? 0}
            overallTotalExpenses={salesData.overallTotalExpenses ?? 0}
            isLoading={isLoadingSales}
            onClose={closeSalesDetailsModal}
            isOwner={isOwner}
            branches={salesData.branches ?? []}
            onDataRefresh={fetchInitialData}
            loggedInUserId={loggedInUserId!}
          />
        </Modal>
      )}

      {isViewingOwnDashboard && !isOwner && loggedInUserId && (
        <PayslipHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={closeHistoryModal}
          isLoading={isLoadingHistory}
          error={historyError}
          payslips={payslipHistory}
        />
      )}

      {(isOwner || isCashier) && (
        <ManageTransactionsModal
          isOpen={isTransactionsModalOpen}
          onClose={closeTransactionsModal}
        />
      )}
    </>
  );
}
