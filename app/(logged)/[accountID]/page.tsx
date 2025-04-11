// src/app/dashboard/[accountID]/page.tsx (or your home dashboard file)
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react"; // Keep useEffect for data fetching, socket etc.
import { io, Socket } from "socket.io-client";
import { useParams } from "next/navigation";
import Link from "next/link";

// --- Server Actions ---
import {
  getActiveTransactions,
  getCurrentAccountData, // Make sure this is imported if used
  getSalaryBreakdown,
  getSalesDataLast6Months,
} from "@/lib/ServerAction"; // Adjust path

// --- Component Imports ---
import Calendar from "@/components/ui/Calendar"; // Adjust path
import DialogTitle from "@/components/Dialog/DialogTitle"; // Adjust path
import Button from "@/components/Buttons/Button"; // Adjust path
import Modal from "@/components/Dialog/Modal";
import ExpandedListedServices from "@/components/ui/ExpandedListedServices"; // Adjust path
import PreviewListedServices from "@/components/ui/PreviewListedServices"; // Adjust path
import PreviewUserSalary from "@/components/ui/PreviewUserSalary"; // Adjust path
import ExpandedUserSalary from "@/components/ui/ExpandedUserSalary"; // Adjust path
import PreviewSales from "@/components/ui/PreviewSales"; // Adjust path
import ExpandedSales from "@/components/ui/ExpandedSales"; // Adjust path
import ManageAttendance from "@/components/ui/customize/ManageAttendance"; // Adjust path

// --- Types ---
import { Role } from "@prisma/client";
import {
  TransactionProps,
  AccountData, // Make sure this is imported if used
  SalaryBreakdownItem,
  AvailedServicesProps,
  SalesDataDetailed,
} from "@/lib/Types"; // Adjust path

// --- Main Component ---
export default function Home() {
  const { accountID } = useParams();
  const accountId = typeof accountID === "string" ? accountID : undefined;

  // --- State Definitions ---
  const [socket, setSocket] = useState<Socket | null>(null);
  const [allPendingTransactions, setAllPendingTransactions] = useState<
    TransactionProps[]
  >([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [processingActions, setProcessingActions] = useState<Set<string>>(
    new Set(),
  );
  // --- MODAL STATES ---
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [isSalaryDetailsModalOpen, setIsSalaryDetailsModalOpen] =
    useState(false);
  const [isSalesDetailsModalOpen, setIsSalesDetailsModalOpen] = useState(false);
  // --- END MODAL STATES ---
  const [accountData, setAccountData] = useState<AccountData | null>(null); // Use AccountData type
  const [salaryBreakdown, setSalaryBreakdown] = useState<SalaryBreakdownItem[]>(
    [],
  );
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [salesData, setSalesData] = useState<SalesDataDetailed | null>(null);
  const [isLoadingSales, setIsLoadingSales] = useState(true);

  const isPageLoading =
    isLoadingTransactions || isLoadingAccount || isLoadingSales;

  // --- Hooks (Socket, Data Fetching, etc.) ---
  // --- Socket Connection ---
  useEffect(() => {
    // Don't connect if accountId isn't available yet
    if (!accountId) {
      console.log("Home: Skipping socket connection, no accountId.");
      return;
    }
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    if (!backendUrl) {
      console.error("Home: FATAL ERROR: NEXT_PUBLIC_BACKEND_URL not set.");
      return;
    }
    console.log(`Home: Connecting socket to ${backendUrl}`);
    const newSocket = io(backendUrl, {
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    setSocket(newSocket);
    newSocket.on("connect", () =>
      console.log("Home: Socket connected:", newSocket.id),
    );
    newSocket.on("disconnect", (reason) =>
      console.log("Home: Socket disconnected:", reason),
    );
    newSocket.on("connect_error", (err) =>
      console.error("Home: Socket connection error:", err.message),
    );

    return () => {
      console.log("Home: Disconnecting socket.");
      newSocket.disconnect();
      setSocket(null);
    };
  }, [accountId]); // Dependency: Only reconnect if accountId changes

  // --- Fetch Initial Data ---
  useEffect(() => {
    async function fetchInitialData() {
      if (!accountId) {
        console.warn("Home: Skipping initial data fetch, no accountId.");
        setIsLoadingTransactions(false);
        setIsLoadingAccount(false);
        setIsLoadingSales(false);
        return;
      }
      console.log("Home: Fetching initial data...");
      setIsLoadingTransactions(true);
      setIsLoadingAccount(true);
      setIsLoadingSales(true);
      try {
        const results = await Promise.allSettled([
          getActiveTransactions(),
          getCurrentAccountData(accountId), // Ensure this action exists and is imported
          getSalesDataLast6Months(),
        ]);
        // Process Transactions
        if (results[0].status === "fulfilled") {
          const transactionsData = results[0].value;
          setAllPendingTransactions(
            transactionsData.map((tx) => ({
              ...tx,
              createdAt: new Date(tx.createdAt),
              bookedFor: new Date(tx.bookedFor),
              availedServices: tx.availedServices.map((as) => ({
                ...as,
                customerName: tx.customer?.name ?? "Unknown",
                service: {
                  id: as.service?.id ?? "?",
                  title: as.service?.title ?? "?",
                },
              })),
            })),
          );
        } else {
          console.error(
            "Home: Error fetching transactions:",
            results[0].reason,
          );
          setAllPendingTransactions([]);
        }
        // Process Account Data
        if (results[1].status === "fulfilled") {
          setAccountData(results[1].value as AccountData); // Cast to AccountData
        } else {
          console.error(
            "Home: Error fetching account data:",
            results[1].reason,
          );
          setAccountData(null);
        }
        // Process Sales Data
        if (results[2].status === "fulfilled") {
          setSalesData(results[2].value);
        } else {
          console.error("Home: Error fetching sales data:", results[2].reason);
          setSalesData(null);
        }
      } catch (error) {
        console.error(
          "Home: Unexpected error during initial data fetch:",
          error,
        );
        setAllPendingTransactions([]);
        setAccountData(null);
        setSalesData(null);
      } finally {
        setIsLoadingTransactions(false);
        setIsLoadingAccount(false);
        setIsLoadingSales(false);
        console.log("Home: Initial data fetch attempt finished.");
      }
    }
    fetchInitialData();
  }, [accountId]); // Re-fetch if accountId changes

  // --- Fetch Salary Breakdown ---
  const fetchBreakdown = useCallback(async () => {
    if (!accountId || isLoadingBreakdown) return;
    setIsLoadingBreakdown(true);
    try {
      const data = await getSalaryBreakdown(accountId);
      setSalaryBreakdown(data);
    } catch (error) {
      // Ensure action exists
      console.error("Home: Error fetching salary breakdown:", error);
      setSalaryBreakdown([]);
    } finally {
      setIsLoadingBreakdown(false);
    }
  }, [accountId, isLoadingBreakdown]);

  // --- Socket Handlers ---
  const handleSocketUpdates = useCallback((data: any, eventType: string) => {
    console.log(`Home: Socket event [${eventType}] ID: ${data.id}`);
    if (eventType === "transactionCompleted") {
      setAllPendingTransactions((prev) => prev.filter((t) => t.id !== data.id));
    } else if (eventType === "availedServiceUpdated") {
      setProcessingActions((prev) => {
        const next = new Set(prev);
        next.delete(data.id);
        return next;
      });
      setAllPendingTransactions((prev) =>
        prev.map((tx) =>
          tx.id === data.transactionId
            ? {
                ...tx,
                availedServices: tx.availedServices.map((s) =>
                  s.id === data.id
                    ? {
                        ...data,
                        customerName: tx.customer?.name ?? "?",
                        service: {
                          id: data.service?.id ?? "?",
                          title: data.service?.title ?? "?",
                        },
                      }
                    : s,
                ),
              }
            : tx,
        ),
      );
    }
  }, []); // Dependencies usually empty if using functional updates

  const handleSocketError = useCallback((error: any) => {
    console.error(`Home: Socket Error:`, error.message, error);
    if (error.availedServiceId) {
      setProcessingActions((prev) => {
        const next = new Set(prev);
        next.delete(error.availedServiceId);
        return next;
      });
    }
    // Optionally show user feedback via state/toast
  }, []);

  useEffect(() => {
    if (!socket) return;
    console.log("Home: Attaching socket listeners.");
    // Define handlers locally to ensure correct references in cleanup
    const serviceUpdateHandler = (d: any) =>
      handleSocketUpdates(d, "availedServiceUpdated");
    const transactionCompleteHandler = (d: any) =>
      handleSocketUpdates(d, "transactionCompleted");

    socket.on("availedServiceUpdated", serviceUpdateHandler);
    socket.on("transactionCompleted", transactionCompleteHandler);
    socket.on("serviceCheckError", handleSocketError);
    socket.on("serviceUncheckError", handleSocketError);
    socket.on("serviceMarkServedError", handleSocketError);
    socket.on("serviceUnmarkServedError", handleSocketError);

    return () => {
      console.log("Home: Removing socket listeners.");
      socket.off("availedServiceUpdated", serviceUpdateHandler);
      socket.off("transactionCompleted", transactionCompleteHandler);
      socket.off("serviceCheckError", handleSocketError);
      socket.off("serviceUncheckError", handleSocketError);
      socket.off("serviceMarkServedError", handleSocketError);
      socket.off("serviceUnmarkServedError", handleSocketError);
    };
  }, [socket, handleSocketUpdates, handleSocketError]); // Re-attach if socket or handlers change

  // --- Filtered Data ---
  const servicesCheckedByMe = useMemo(() => {
    if (!accountId || !allPendingTransactions) return [];
    return allPendingTransactions
      .flatMap((tx) => tx.availedServices)
      .filter((s) => s.checkedById === accountId);
  }, [allPendingTransactions, accountId]);

  // --- Modal Control Functions ---
  const openMyServicesModal = () => setIsMyServicesModalOpen(true);
  const closeMyServicesModal = () => setIsMyServicesModalOpen(false);
  const openSalaryDetailsModal = () => {
    setIsSalaryDetailsModalOpen(true);
    fetchBreakdown();
  };
  const closeSalaryDetailsModal = () => setIsSalaryDetailsModalOpen(false);
  const openSalesDetailsModal = () => setIsSalesDetailsModalOpen(true);
  const closeSalesDetailsModal = () => setIsSalesDetailsModalOpen(false);

  // --- Body Scroll Lock Effect Removed, handled by Modal component ---

  // --- Reusable Loading Widget ---
  const LoadingWidget = ({
    text = "Loading...",
    height = "h-[150px]",
  }: {
    text?: string;
    height?: string;
  }) => (
    <div
      className={`flex ${height} w-full items-center justify-center rounded-lg border border-customGray/20 bg-customOffWhite/80 p-4 text-sm text-customBlack/70 shadow-sm backdrop-blur-sm`}
    >
      <svg
        className="-ml-1 mr-3 h-5 w-5 animate-spin text-customDarkPink"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      {text}
    </div>
  );

  // --- Invalid State Render ---
  if (!accountId && !isLoadingAccount) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        {" "}
        {/* Ensure h-full if parent expects it */}
        <div className="text-center text-red-600">
          <h2 className="mb-2 text-xl font-semibold">Error</h2>
          <p>Invalid or missing Account ID. Cannot load dashboard.</p>
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    // Fragment because layout provides the main structure
    <>
      {/* --- Dashboard Header --- */}
      <div className="mb-6 flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="truncate text-xl font-semibold text-customBlack sm:text-2xl md:text-3xl">
          {isPageLoading
            ? "Loading Dashboard..."
            : `Welcome, ${accountData?.name ?? "User"}!`}
        </h1>
        <Link
          href={accountId ? `/dashboard/${accountId}/work-queue` : "#"}
          passHref
          className={!accountId ? "pointer-events-none" : ""}
        >
          <Button
            size="sm"
            disabled={isPageLoading || !accountId}
            className="w-full bg-customDarkPink text-white hover:bg-customDarkPink/90 sm:w-auto"
          >
            Work Queue ({isPageLoading ? "..." : allPendingTransactions.length})
          </Button>
        </Link>
      </div>

      {/* --- Main Content Grid --- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-8">
        {/* --- Primary Column --- */}
        <div className="space-y-6 xl:col-span-2">
          {/* Attendance Widget Wrapper */}
          <div className="min-h-[300px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
            {" "}
            {/* Added min-h */}
            {accountId ? (
              <ManageAttendance currentUserId={accountId} />
            ) : (
              <LoadingWidget text="Loading Attendance..." height="h-full" />
            )}
          </div>
          {/* Sales Preview Chart Wrapper */}
          <div className="w-full">
            <PreviewSales
              monthlyData={salesData?.monthlySales ?? []}
              isLoading={isLoadingSales}
              onViewDetails={openSalesDetailsModal}
            />
          </div>
        </div>

        {/* --- Secondary Column --- */}
        <div className="flex flex-col space-y-6 xl:col-span-1">
          {/* Calendar Widget Wrapper */}
          <div className="w-full">
            {" "}
            <Calendar />{" "}
          </div>
          {/* Claimed Services Preview Wrapper */}
          <div className="min-h-[150px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 shadow-custom backdrop-blur-sm">
            {" "}
            {/* Added min-h */}
            <h3 className="mb-3 text-base font-semibold text-customBlack">
              Your Claimed Services
            </h3>
            {isLoadingTransactions ? (
              <LoadingWidget text="Loading services..." height="h-[150px]" />
            ) : (
              <PreviewListedServices
                checkedServices={servicesCheckedByMe}
                onOpenModal={openMyServicesModal}
              />
            )}
          </div>
          {/* Salary Preview Wrapper */}
          {isLoadingAccount ? (
            <LoadingWidget text="Loading salary info..." height="h-[170px]" />
          ) : accountData?.role.includes(Role.OWNER) ? (
            <div className="rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 text-center text-sm text-customBlack/70 shadow-custom backdrop-blur-sm">
              Salary view not applicable.
            </div>
          ) : accountData ? (
            <PreviewUserSalary
              salary={accountData.salary}
              onOpenDetails={openSalaryDetailsModal}
              isLoading={false}
            />
          ) : (
            <div className="rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 text-center text-sm text-red-500 shadow-custom backdrop-blur-sm">
              Could not load salary info.
            </div>
          )}
        </div>
      </div>

      {/* --- Use the NEW Modal Component --- */}
      <Modal
        isOpen={isMyServicesModalOpen}
        onClose={closeMyServicesModal}
        title={<DialogTitle>Claimed Services</DialogTitle>}
      >
        {accountId && (
          <ExpandedListedServices
            services={servicesCheckedByMe}
            accountId={accountId}
            socket={socket}
            onClose={closeMyServicesModal}
            processingServeActions={processingActions}
            setProcessingServeActions={setProcessingActions}
          />
        )}
      </Modal>

      <Modal
        isOpen={isSalaryDetailsModalOpen}
        onClose={closeSalaryDetailsModal}
        title={<DialogTitle>Salary Details</DialogTitle>}
      >
        {accountData && (
          <ExpandedUserSalary
            breakdownItems={salaryBreakdown}
            onClose={closeSalaryDetailsModal}
            isLoading={isLoadingBreakdown}
            currentTotalSalary={accountData.salary}
          />
        )}
      </Modal>

      <Modal
        isOpen={isSalesDetailsModalOpen}
        onClose={closeSalesDetailsModal}
        title={<DialogTitle>Sales Details</DialogTitle>}
      >
        {salesData && (
          <ExpandedSales
            monthlyData={salesData.monthlySales}
            paymentTotals={salesData.paymentMethodTotals}
            grandTotal={salesData.grandTotal}
            isLoading={isLoadingSales}
            onClose={closeSalesDetailsModal}
          />
        )}
      </Modal>
    </>
  );
}
