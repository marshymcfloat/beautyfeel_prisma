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
import { Status, Role, Branch as PrismaBranch } from "@prisma/client";
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
import { isValid, isAfter, addDays, startOfDay, isPast } from "date-fns";

import {
  getCurrentAccountData,
  getSalesDataLast6Months,
  getActiveTransactions,
} from "@/lib/ServerAction";

import EmployeeWorkHistory from "@/components/ui/EmployeeWorkHistory";
import CalendarUI from "@/components/ui/Calendar";
import UserServedTodayWidget from "@/components/ui/UserServedTodayWidget";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";
import Modal from "@/components/Dialog/Modal";
import ExpandedListedServices from "@/components/ui/ExpandedListedServices";
import PreviewListedServices from "@/components/ui/PreviewListedServices";
import ManageAttendance from "@/components/ui/customize/ManageAttendance";
import LoadingWidget from "@/components/ui/LoadingWidget";
import ManageTransactionsModal from "@/components/ui/ManageTransactionsModal";
import PreviewSales from "@/components/ui/PreviewSales";
import ExpandedSales from "@/components/ui/ExpandedSales";
import {
  AccountData,
  AvailedServicesProps,
  TransactionProps,
  TransactionPropsForTransactions,
  MobileWidgetKey,
  SalesDataDetailed,
  AvailedServiceUnitProps,
} from "@/lib/Types";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";
import CustomerHistoryWidget from "@/components/ui/CustomerHistoryWidget";
import ClaimGiftCertificate from "@/components/ui/cashier/ClaimGiftCertificate";
import { MobileWidgetIcon } from "@/components/ui/MobileWidget";

const PHT_TIMEZONE = "Asia/Manila";

interface DashboardClientProps {
  initialAccountData: AccountData | null;
  initialTransactions: TransactionPropsForTransactions[];
  initialSalesData: SalesDataDetailed | null;
  initialBranches: PrismaBranch[];
  accountId: string;
}

export default function DashboardClient({
  initialAccountData,
  initialTransactions,
  initialSalesData,
  initialBranches,
  accountId,
}: DashboardClientProps) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const accountIdFromUrl = accountId;

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);

  const [allPendingTransactions, setAllPendingTransactions] = useState<
    TransactionPropsForTransactions[]
  >(initialTransactions || []);
  const [accountData, setAccountData] = useState<AccountData | null>(
    initialAccountData,
  );
  const [legacySalesData, setLegacySalesData] =
    useState<SalesDataDetailed | null>(initialSalesData);

  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [isLoadingMonthlySummary, setIsLoadingMonthlySummary] = useState(false);

  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [isSalesDetailsModalOpen, setIsSalesDetailsModalOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [isWorkHistoryModalOpen, setIsWorkHistoryModalOpen] = useState(false);

  const [processingServeActions, setProcessingServeActions] = useState<
    Set<string>
  >(new Set());

  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [activeMobileWidget, setActiveMobileWidget] =
    useState<MobileWidgetKey | null>(null);
  const [isMobileViewModalOpen, setIsMobileViewModalOpen] = useState(false);
  const [isLikelyMobile, setIsLikelyMobile] = useState(false);

  const [allBranchesList, setAllBranchesList] = useState<PrismaBranch[]>(
    initialBranches || [],
  );

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

  // Socket connection effect
  useEffect(() => {
    if (!(sessionStatus === "authenticated" && loggedInUserId)) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setSocketError(null);
      return;
    }
    if (
      socketRef.current?.connected &&
      (socketRef.current.io.opts.query as { accountId?: string })?.accountId ===
        loggedInUserId
    ) {
      setSocket(socketRef.current);
      return;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    const backendUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:9000";
    if (!backendUrl) {
      setSocketError("Config Error: Socket URL missing.");
      setSocket(null);
      return;
    }
    const newSocketInstance = io(backendUrl, {
      query: { accountId: loggedInUserId },
      reconnectionAttempts: 3,
      timeout: 10000,
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
    newSocketInstance.on("connect", () => {
      setSocketError(null);
    });
    newSocketInstance.on("disconnect", (reason) => {
      if (reason !== "io client disconnect" && reason !== "transport close")
        setSocketError(
          `Socket Disconnected: ${reason}. Attempting to reconnect...`,
        );
      else setSocketError(null);
    });
    newSocketInstance.onAny((event, ...args) => {
      if (event.startsWith("connect_") || event.startsWith("reconnect_")) {
        if (!newSocketInstance.active) {
          setSocketError(
            `Socket Connection Error (${event}). Please check server or refresh.`,
          );
        }
      }
    });
    newSocketInstance.on("reconnect", () => {
      setSocketError(null);
    });

    socketRef.current = newSocketInstance;
    setSocket(newSocketInstance);
    return () => {
      newSocketInstance.disconnect();
      if (socketRef.current?.id === newSocketInstance.id)
        socketRef.current = null;
    };
  }, [sessionStatus, loggedInUserId]);

  // Refresh function for client-side updates
  const refreshData = useCallback(async () => {
    if (!accountIdFromUrl || !loggedInUserId) return;

    setIsLoadingAccount(true);
    setIsLoadingTransactions(true);
    setDashboardError(null);

    try {
      const [accountResult, transactionsResult] = await Promise.all([
        getCurrentAccountData(accountIdFromUrl),
        getActiveTransactions(loggedInUserId),
      ]);

      if (accountResult) {
        setAccountData(accountResult);
      } else {
        setDashboardError("Failed to load account details.");
        setAccountData(null);
      }

      if (Array.isArray(transactionsResult)) {
        setAllPendingTransactions(transactionsResult);
      } else {
        setDashboardError("Failed to load transactions.");
        setAllPendingTransactions([]);
      }

      if (isOwner) {
        setIsLoadingMonthlySummary(true);
        try {
          const cacheKey: CacheKey = "salesData_monthly";
          const cachedLegacyData = getCachedData<SalesDataDetailed>(cacheKey);
          if (cachedLegacyData) {
            setLegacySalesData(cachedLegacyData);
          } else {
            const data = await getSalesDataLast6Months();
            if (data) {
              setCachedData(cacheKey, data);
              setLegacySalesData(data);
              if (data.branches && data.branches.length > 0) {
                const mappedBranches = data.branches.map((b) => ({
                  id: b.id,
                  title: b.title,
                  code: b.code,
                  totalSales: b.totalSales || 0,
                })) as PrismaBranch[];
                setAllBranchesList(mappedBranches);
              }
            }
          }
        } catch (error) {
          console.error("Error fetching sales data:", error);
        } finally {
          setIsLoadingMonthlySummary(false);
        }
      }
    } catch (error: any) {
      console.error("Error refreshing data:", error);
      setDashboardError("Failed to refresh dashboard data.");
    } finally {
      setIsLoadingAccount(false);
      setIsLoadingTransactions(false);
    }
  }, [accountIdFromUrl, loggedInUserId, isOwner]);

  const transactionsWithClaimedUnits = useMemo(() => {
    if (!loggedInUserId || !allPendingTransactions) return [];

    const relevantTransactions: TransactionPropsForTransactions[] = [];

    for (const tx of allPendingTransactions) {
      const hasClaimedUnit = tx.availedServices.some((as) =>
        as.units.some(
          (unit) =>
            (unit.status === Status.PENDING &&
              unit.checkedById === loggedInUserId) ||
            (unit.status === Status.DONE && unit.servedById === loggedInUserId),
        ),
      );

      if (hasClaimedUnit) {
        relevantTransactions.push(tx);
      }
    }

    relevantTransactions.sort((a, b) => {
      const bookedForA = a.bookedFor?.getTime() ?? 0;
      const bookedForB = b.bookedFor?.getTime() ?? 0;
      return bookedForA - bookedForB;
    });

    return relevantTransactions;
  }, [allPendingTransactions, loggedInUserId]);

  const totalClaimedUnitsCount = useMemo(() => {
    if (!loggedInUserId || !allPendingTransactions) return 0;

    let count = 0;
    allPendingTransactions.forEach((tx) => {
      tx.availedServices.forEach((as) => {
        as.units.forEach((unit) => {
          if (
            (unit.status === Status.PENDING &&
              unit.checkedById === loggedInUserId) ||
            (unit.status === Status.DONE && unit.servedById === loggedInUserId)
          ) {
            count++;
          }
        });
      });
    });
    return count;
  }, [allPendingTransactions, loggedInUserId]);

  const handleDashboardAvailedServiceUpdate = useCallback(
    (
      updatedAvailedService: AvailedServicesProps & {
        units: AvailedServiceUnitProps[];
      },
    ) => {
      if (!updatedAvailedService?.id) return;
      setAllPendingTransactions((prevTransactions) =>
        prevTransactions.map((tx) => {
          if (tx.id === updatedAvailedService.transactionId) {
            return {
              ...tx,
              availedServices: tx.availedServices.map((as) =>
                as.id === updatedAvailedService.id
                  ? {
                      ...as,
                      ...updatedAvailedService,
                      units: updatedAvailedService.units,
                    }
                  : as,
              ),
            };
          }
          return tx;
        }),
      );
      setProcessingServeActions((prev) => {
        const next = new Set(prev);
        let changed = false;
        if (updatedAvailedService.units) {
          updatedAvailedService.units.forEach((unit) => {
            if (next.has(unit.id)) {
              next.delete(unit.id);
              changed = true;
            }
          });
        }
        return changed ? next : prev;
      });
    },
    [],
  );

  const handleTransactionCompletionDashboard = useCallback(
    (completedTransaction: TransactionPropsForTransactions) => {
      if (!completedTransaction?.id) return;
      setAllPendingTransactions((prev) =>
        prev.filter((tx) => tx.id !== completedTransaction.id),
      );
      setProcessingServeActions((prev) => {
        let changed = false;
        const next = new Set(prev);
        completedTransaction.availedServices?.forEach((as) => {
          as.units?.forEach((unit) => {
            if (next.has(unit.id)) {
              next.delete(unit.id);
              changed = true;
            }
          });
        });
        return changed ? next : prev;
      });
    },
    [],
  );

  useEffect(() => {
    if (socket) {
      socket.on("availedServiceUpdated", handleDashboardAvailedServiceUpdate);
      socket.on("transactionCompleted", handleTransactionCompletionDashboard);

      return () => {
        socket.off(
          "availedServiceUpdated",
          handleDashboardAvailedServiceUpdate,
        );
        socket.off(
          "transactionCompleted",
          handleTransactionCompletionDashboard,
        );
      };
    }
  }, [
    socket,
    handleDashboardAvailedServiceUpdate,
    handleTransactionCompletionDashboard,
  ]);

  const handleParentDataRefreshAfterExpense = useCallback(async () => {
    invalidateCache("salesData_monthly");
    setIsLoadingMonthlySummary(true);
    try {
      const data = await getSalesDataLast6Months();
      if (data) {
        setCachedData("salesData_monthly", data);
        setLegacySalesData(data);
        if (data.branches && data.branches.length > 0) {
          const mappedBranches = data.branches.map((b) => ({
            id: b.id,
            title: b.title,
            code: b.code,
            totalSales: b.totalSales || 0,
          })) as PrismaBranch[];
          setAllBranchesList(mappedBranches);
        }
      }
    } catch (error) {
      console.error("Error refreshing sales data:", error);
    } finally {
      setIsLoadingMonthlySummary(false);
    }
  }, []);

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
  const openWorkHistoryModal = useCallback(() => {
    if (!accountIdFromUrl || !loggedInUserId) {
      setDashboardError("Authentication issue. Cannot display work history.");
      return;
    }
    if (accountIdFromUrl !== loggedInUserId && !isOwner) {
      setDashboardError("Insufficient permissions to view this profile.");
      return;
    }
    setIsWorkHistoryModalOpen(true);
  }, [accountIdFromUrl, loggedInUserId, isOwner]);
  const closeWorkHistoryModal = useCallback(
    () => setIsWorkHistoryModalOpen(false),
    [],
  );
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

  const mobileWidgetsConfig = useMemo(() => {
    const widgets: Array<{
      key: MobileWidgetKey;
      title: string;
      Icon: React.ElementType;
      isLoading: boolean;
      link?: string;
      onDetailsClick?: () => void;
      notificationCount?: number;
      roles: Role[];
    }> = [
      {
        key: "attendance",
        title: "Attendance",
        Icon: LayoutGrid,
        isLoading: false,
        onDetailsClick: () => {
          setActiveMobileWidget("attendance");
          setIsMobileViewModalOpen(true);
        },
        roles: [Role.OWNER, Role.ATTENDANCE_CHECKER],
      },
      {
        key: "sales",
        title: "Sales Overview",
        Icon: BarChart2,
        isLoading: isLoadingMonthlySummary,
        onDetailsClick: openSalesDetailsModal,
        roles: [Role.OWNER],
      },
      {
        key: "workQueueLink",
        title: "Work Queue",
        Icon: Edit3,
        isLoading: isLoadingTransactions,
        link: `/${accountIdFromUrl}/work`,
        roles: [Role.WORKER, Role.CASHIER, Role.OWNER],
      },
      {
        key: "salary",
        title: isViewingOwnDashboard ? "My Work & Salary" : "Work History",
        Icon: Wallet,
        isLoading: isLoadingAccount,
        onDetailsClick: openWorkHistoryModal,
        roles: userRoles.filter((r) => r !== Role.ATTENDANCE_CHECKER),
      },
      {
        key: "claimedServices",
        title: "My Claims",
        Icon: ListChecks,
        notificationCount: totalClaimedUnitsCount,
        isLoading: isLoadingTransactions,
        onDetailsClick: openMyServicesModal,
        roles: isViewingOwnDashboard ? [Role.WORKER, Role.OWNER] : [],
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
        onDetailsClick: () => {
          setActiveMobileWidget("claimGC");
          setIsMobileViewModalOpen(true);
        },
        roles: [Role.OWNER, Role.CASHIER],
      },
      {
        key: "customerHistory",
        title: "Customers",
        Icon: Users,
        isLoading: false,
        onDetailsClick: () => {
          setActiveMobileWidget("customerHistory");
          setIsMobileViewModalOpen(true);
        },
        roles: [Role.OWNER],
      },
    ];
    return widgets.filter((w) =>
      w.roles.some((role) => userRoles.includes(role)),
    );
  }, [
    isViewingOwnDashboard,
    userRoles,
    accountIdFromUrl,
    isLoadingMonthlySummary,
    isLoadingTransactions,
    isLoadingAccount,
    openSalesDetailsModal,
    openMyServicesModal,
    openTransactionsModal,
    openWorkHistoryModal,
    totalClaimedUnitsCount,
  ]);

  const renderMobileWidgetComponent = useCallback(() => {
    if (!activeMobileWidget) return null;

    const componentsToRenderInsideMobilePreview: MobileWidgetKey[] = [
      "attendance",
      "claimGC",
      "customerHistory",
    ];

    if (!componentsToRenderInsideMobilePreview.includes(activeMobileWidget)) {
      return (
        <div className="p-4 text-center text-gray-500">
          Component not available in this view.
        </div>
      );
    }

    switch (activeMobileWidget) {
      case "attendance":
        if (
          !(isOwner || isAttendanceChecker) ||
          !loggedInUserId ||
          !accountIdFromUrl
        ) {
          return (
            <div className="p-4 text-center text-red-600">
              Access Denied or data missing for Attendance.
            </div>
          );
        }
        return (
          <ManageAttendance
            viewedAccountId={accountIdFromUrl}
            checkerId={loggedInUserId}
          />
        );
      case "claimGC":
        if (!(isOwner || isCashier)) {
          return (
            <div className="p-4 text-center text-red-600">
              Access Denied for Claim GC.
            </div>
          );
        }
        return <ClaimGiftCertificate />;
      case "customerHistory":
        if (!isOwner) {
          return (
            <div className="p-4 text-center text-red-600">
              Access Denied for Customer History.
            </div>
          );
        }
        return <CustomerHistoryWidget />;
      default:
        return (
          <div className="p-4 text-center text-gray-500">
            Invalid component selected.
          </div>
        );
    }
  }, [
    activeMobileWidget,
    isOwner,
    isAttendanceChecker,
    loggedInUserId,
    accountIdFromUrl,
    isCashier,
  ]);

  if (sessionStatus === "loading") {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <LoadingWidget text="Loading Dashboard..." />
      </div>
    );
  }

  if (
    sessionStatus === "authenticated" &&
    !isLoadingAccount &&
    accountData === null
  ) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 text-center text-red-700">
        <AlertCircle className="mb-4 h-12 w-12" />
        <h2 className="mb-2 text-xl font-semibold">Dashboard Load Error</h2>
        <p>
          Could not load required data for account: {accountIdFromUrl}.{" "}
          {dashboardError || "An unknown error occurred."}
        </p>
        <Button
          onClick={refreshData}
          disabled={isLoadingAccount}
          className="mr-2 mt-4"
        >
          {isLoadingAccount && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
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
        {(socketError || dashboardError) && (socketError || dashboardError) && (
          <div className="flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-600">
            <AlertCircle size={14} />
            {socketError || dashboardError}
          </div>
        )}
      </div>

      <div className="hidden xl:block">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
          {(isOwner || isAttendanceChecker) &&
            accountIdFromUrl &&
            loggedInUserId && (
              <div className="min-h-[300px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm md:col-span-2 xl:col-span-2">
                <h3 className="mb-3 text-base font-semibold text-customBlack">
                  Daily Attendance
                </h3>
                <ManageAttendance
                  viewedAccountId={accountIdFromUrl}
                  checkerId={loggedInUserId}
                />
              </div>
            )}

          {isOwner && (
            <div className="w-full md:col-span-2 xl:col-span-1">
              <PreviewSales
                monthlyData={legacySalesData?.monthlySales ?? []}
                isLoading={isLoadingMonthlySummary}
                onViewDetails={openSalesDetailsModal}
              />
            </div>
          )}

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
            {(isOwner || isCashier) && loggedInUserId && (
              <button
                onClick={openTransactionsModal}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-customOffWhite p-4 text-center text-sm font-medium text-customDarkPink shadow-custom transition-all duration-150 hover:bg-customDarkPink/70 hover:text-customOffWhite"
              >
                <FileText size={18} /> View Transactions
              </button>
            )}
          </div>

          {(isWorker || isOwner || isCashier) &&
            isViewingOwnDashboard &&
            accountIdFromUrl &&
            loggedInUserId && (
              <div className="flex min-h-[170px] flex-col items-start justify-between space-y-2 rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm md:col-span-1 xl:col-span-1">
                <h3 className="mb-2 w-full text-base font-medium text-customBlack">
                  {isViewingOwnDashboard ? "My Work & Salary" : "Work History"}
                </h3>
                {accountData?.salary !== undefined ? (
                  <div className="flex w-full flex-col items-center">
                    <p className="text-sm text-customBlack/70">
                      Current Total Earnings (Gross)
                    </p>
                    <p className="text-primary-dark text-xl font-extrabold">{`₱${accountData.salary.toLocaleString()}`}</p>
                    <p className="mt-1 text-xs text-customBlack/50">
                      (Estimated until last recorded attendance/service
                      completion)
                    </p>
                  </div>
                ) : (
                  <p className="w-full text-center text-sm text-customBlack/70">
                    Salary data not available.
                  </p>
                )}
                <button
                  onClick={openWorkHistoryModal}
                  className="mt-auto flex w-full items-center justify-center gap-2 rounded-md border border-customGray/50 bg-white px-4 py-2 text-sm font-medium text-customDarkPink hover:bg-customDarkPink/10"
                >
                  <Wallet size={18} /> View Details
                </button>
              </div>
            )}

          {(isWorker || isOwner) && isViewingOwnDashboard && loggedInUserId && (
            <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-0 shadow-custom backdrop-blur-sm sm:p-4 md:col-span-1 xl:col-span-1">
              <PreviewListedServices
                claimedUnitsCount={totalClaimedUnitsCount}
                onOpenModal={openMyServicesModal}
                isLoading={isLoadingTransactions}
                onRefresh={refreshData}
              />
            </div>
          )}

          {(isOwner || isCashier) && (
            <div className="rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm md:col-span-1 xl:col-span-1">
              <ClaimGiftCertificate />
            </div>
          )}

          {isOwner && (
            <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm md:col-span-1 xl:col-span-1">
              <CustomerHistoryWidget />
            </div>
          )}
        </div>
      </div>

      <div className="block xl:hidden">
        {!isMobileViewModalOpen && (
          <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 sm:gap-4">
            <CalendarUI className="flex flex-col rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm" />
            {loggedInUserId && (
              <UserServedTodayWidget loggedInUserId={loggedInUserId} />
            )}
            {mobileWidgetsConfig.map((widget) => {
              const widgetAction = () => {
                const componentsThatRenderInsideMobilePreview: MobileWidgetKey[] =
                  ["attendance", "claimGC", "customerHistory"];

                if (
                  !componentsThatRenderInsideMobilePreview.includes(
                    widget.key,
                  ) &&
                  isMobileViewModalOpen
                ) {
                  closeMobilePreview();
                  setTimeout(() => {
                    if (widget.onDetailsClick) widget.onDetailsClick();
                    else if (widget.link) router.push(widget.link);
                  }, 0);
                  return;
                }

                if (widget.onDetailsClick) widget.onDetailsClick();
                else if (widget.link) router.push(widget.link);
              };

              return (
                <MobileWidgetIcon
                  key={widget.key}
                  IconComponent={widget.Icon}
                  title={widget.title}
                  widgetKey={widget.key}
                  onClick={widgetAction}
                  notificationCount={widget.notificationCount}
                  isActive={
                    isMobileViewModalOpen && activeMobileWidget === widget.key
                  }
                  isLoading={widget.isLoading}
                />
              );
            })}
          </div>
        )}

        <Modal
          isOpen={isMobileViewModalOpen}
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
          <div className="h-full overflow-y-auto">
            {renderMobileWidgetComponent()}
          </div>
        </Modal>
      </div>

      {isViewingOwnDashboard && accountIdFromUrl && (
        <Modal
          isOpen={isWorkHistoryModalOpen}
          onClose={closeWorkHistoryModal}
          title={
            <DialogTitle>
              {accountData?.name
                ? `Work & Salary: ${accountData.name}`
                : "Work & Salary History"}
            </DialogTitle>
          }
          size="4xl"
        >
          <EmployeeWorkHistory
            accountId={accountIdFromUrl}
            isOpen={isWorkHistoryModalOpen}
            onClose={closeWorkHistoryModal}
          />
        </Modal>
      )}

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
              transactionsWithClaimedUnits={transactionsWithClaimedUnits}
              accountId={loggedInUserId}
              socket={socket}
              onClose={closeMyServicesModal}
              onRefresh={refreshData}
              isLoading={isLoadingTransactions}
              processingServeActions={processingServeActions}
              setProcessingServeActions={setProcessingServeActions}
            />
          </Modal>
        )}

      {isOwner && loggedInUserId && (
        <Modal
          isOpen={isSalesDetailsModalOpen}
          onClose={closeSalesDetailsModal}
          title={<DialogTitle>Sales Details</DialogTitle>}
          size="xl"
        >
          <ExpandedSales
            isOpen={isSalesDetailsModalOpen}
            onClose={closeSalesDetailsModal}
            isOwner={isOwner}
            initialBranches={allBranchesList ?? []}
            onParentDataRefresh={handleParentDataRefreshAfterExpense}
            loggedInUserId={loggedInUserId}
            initialPeriodType="monthly"
          />
        </Modal>
      )}

      {(isOwner || isCashier) && loggedInUserId && (
        <Modal
          isOpen={isTransactionsModalOpen}
          onClose={closeTransactionsModal}
          title={<DialogTitle>All Transactions</DialogTitle>}
          size="4xl"
        >
          <ManageTransactionsModal
            isOpen={isTransactionsModalOpen}
            onClose={closeTransactionsModal}
          />
        </Modal>
      )}
    </>
  );
}
