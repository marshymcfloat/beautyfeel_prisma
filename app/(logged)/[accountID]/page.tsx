"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useParams, useRouter } from "next/navigation";

// --- Server Actions ---
import {
  getActiveTransactions,
  getCurrentAccountData,
  getSalaryBreakdown,
  getSalesDataLast6Months, // Import the new sales action
} from "@/lib/ServerAction";

// --- Component Imports ---
import Link from "next/link";
import Calendar from "@/components/ui/Calendar";
import ExpandedListedServices from "@/components/ui/ExpandedListedServices"; // Correct component for managing services
import PreviewListedServices from "@/components/ui/PreviewListedServices";
import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";
import PreviewUserSalary from "@/components/ui/PreviewUserSalary";
import ExpandedUserSalary from "@/components/ui/ExpandedUserSalary";
import PreviewSales from "@/components/ui/PreviewSales";
import ExpandedSales from "@/components/ui/ExpandedSales";
// --- Types ---
import { Role } from "@prisma/client";

import {
  TransactionProps,
  AccountData,
  SalaryBreakdownItem,
  AvailedServicesProps,
  SalesDataDetailed,
} from "@/lib/Types";

export default function Home() {
  const { accountID } = useParams();
  const router = useRouter();
  const accountId = Array.isArray(accountID) ? accountID[0] : accountID;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [allPendingTransactions, setAllPendingTransactions] = useState<
    TransactionProps[]
  >([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [processingActions, setProcessingActions] = useState<Set<string>>(
    new Set(),
  );
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [accountData, setAccountData] = useState<AccountData | null>(null); // Corrected type
  const [salaryBreakdown, setSalaryBreakdown] = useState<SalaryBreakdownItem[]>(
    [],
  );
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [isSalaryDetailsModalOpen, setIsSalaryDetailsModalOpen] =
    useState(false);
  // NEW Sales State
  const [salesData, setSalesData] = useState<SalesDataDetailed | null>(null);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [isSalesDetailsModalOpen, setIsSalesDetailsModalOpen] = useState(false);

  // --- Socket Connection ---
  useEffect(() => {
    if (typeof accountId !== "string" || !accountId) {
      console.error("Account ID is missing or invalid for socket connection.");
      return;
    }

    // --- CORRECTED SECTION ---
    // 1. Use the CORRECT environment variable name (must start with NEXT_PUBLIC_)
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

    // 2. Add a check to ensure the variable is set
    if (!backendUrl) {
      console.error(
        "FATAL ERROR: NEXT_PUBLIC_BACKEND_URL environment variable is not set in Vercel/frontend environment!",
      );
      alert(
        "Configuration Error: Cannot connect to backend server. URL not found. Please check environment configuration.",
      );
      return; // Stop execution if the URL is missing
    }

    console.log(`Connecting socket to backend at: ${backendUrl}`);
    const newSocket = io(backendUrl); // Use the correct variable
    // --- END CORRECTED SECTION ---

    setSocket(newSocket);

    console.log("Socket attempting connection...");
    newSocket.on("connect", () =>
      console.log("Socket connected:", newSocket.id),
    );
    newSocket.on("disconnect", (reason) =>
      console.log("Socket disconnected:", reason),
    );
    newSocket.on("connect_error", (err) => {
      // Log more details if possible
      console.error("Socket connection error:", err.message, err);
      alert(
        `Failed to connect to realtime server: ${err.message}. Check console.`,
      );
    });

    // Cleanup function
    return () => {
      if (newSocket) {
        // Reference newSocket directly for cleanup
        console.log("Socket disconnecting...");
        newSocket.disconnect();
      }
      setSocket(null); // Clear socket state
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]); // Dependency array remains the same

  // --- Fetch Initial Data (Transactions, Account, Sales) ---
  useEffect(() => {
    async function fetchInitialData() {
      if (typeof accountId !== "string" || !accountId) {
        console.error("Account ID missing.");
        setIsLoadingTransactions(false);
        setIsLoadingAccount(false);
        setIsLoadingSales(false);
        return;
      }
      setIsLoadingTransactions(true);
      setIsLoadingAccount(true);
      setIsLoadingSales(true);
      try {
        const [transactionsData, accData, fetchedSalesData] = await Promise.all(
          [
            getActiveTransactions(),
            getCurrentAccountData(accountId),
            getSalesDataLast6Months(), // Fetch sales data
          ],
        );

        // Process Transactions
        const processedTransactions = transactionsData.map((tx) => ({
          ...tx,
          createdAt: new Date(tx.createdAt),
          bookedFor: new Date(tx.bookedFor),
          availedServices: tx.availedServices.map((as) => ({
            ...as,
            customerName: tx.customer?.name ?? "Unknown Customer",
            service: {
              id: as.service.id,
              title: as.service.title,
            },
          })),
        }));
        setAllPendingTransactions(processedTransactions);
        console.log("Fetched Transactions:", processedTransactions.length);

        // Set Account Data
        setAccountData(accData);
        console.log("Fetched Account Data:", accData);

        // Set Sales Data
        setSalesData(fetchedSalesData);
        console.log("Fetched Sales Data:", fetchedSalesData);
      } catch (error) {
        console.error("Error fetching initial dashboard data:", error);
        alert("Failed to load initial dashboard data.");
        setAllPendingTransactions([]);
        setAccountData(null);
        setSalesData(null);
      } finally {
        setIsLoadingTransactions(false);
        setIsLoadingAccount(false);
        setIsLoadingSales(false);
      }
    }
    fetchInitialData();
  }, [accountId]); // Re-fetch if accountId changes

  // --- Fetch Salary Breakdown ---
  const fetchBreakdown = useCallback(async () => {
    if (typeof accountId !== "string" || !accountId || isLoadingBreakdown) {
      console.log("Skipping breakdown fetch (missing ID or already loading)");
      return;
    }
    setIsLoadingBreakdown(true);
    try {
      console.log("Fetching salary breakdown...");
      const breakdownData = await getSalaryBreakdown(accountId);
      setSalaryBreakdown(breakdownData);
      console.log("Fetched Salary Breakdown:", breakdownData.length);
    } catch (error) {
      console.error("Error fetching salary breakdown:", error);
      alert("Failed to load salary breakdown details.");
      setSalaryBreakdown([]);
    } finally {
      setIsLoadingBreakdown(false);
    }
  }, [accountId, isLoadingBreakdown]); // Add dependencies

  // --- Centralized Socket Event Handler ---
  const handleSocketUpdates = useCallback(
    (
      data: AvailedServicesProps | TransactionProps,
      eventType: "availedServiceUpdated" | "transactionCompleted",
    ) => {
      console.log(`Dashboard received socket event [${eventType}]:`, data);

      if (eventType === "transactionCompleted") {
        const completedTx = data as TransactionProps;
        setAllPendingTransactions((prev) =>
          prev.filter((t) => t.id !== completedTx.id),
        );
        // OPTIONAL: Re-fetch sales/salary data for immediate update, or wait for next page load/manual refresh
        // getSalesDataLast6Months().then(setSalesData);
        // getCurrentAccountData(accountId).then(setAccountData);
      } else if (eventType === "availedServiceUpdated") {
        const updatedService = data as AvailedServicesProps;

        // Clear processing state for this item
        setProcessingActions((prev) => {
          const next = new Set(prev);
          if (next.has(updatedService.id)) {
            next.delete(updatedService.id);
            console.log(`Cleared processing state for ${updatedService.id}`);
          }
          return next;
        });

        // Update the specific availedService within the transaction list
        setAllPendingTransactions((prevTransactions) => {
          return prevTransactions.map((transaction) => {
            if (transaction.id === updatedService.transactionId) {
              // Ensure the updated service includes derived data if needed elsewhere
              const serviceWithPossibleCustomer = {
                ...updatedService,
                customerName: transaction.customer?.name ?? "Unknown Customer",
                service: {
                  id: updatedService.service.id,
                  title: updatedService.service.title,
                },
              };
              return {
                ...transaction,
                availedServices: transaction.availedServices.map((service) =>
                  service.id === updatedService.id
                    ? serviceWithPossibleCustomer
                    : service,
                ),
              };
            }
            return transaction;
          });
        });
      }
    },
    [
      /* accountId */
    ], // Add accountId if using it inside for re-fetching data
  );

  // --- Generic Socket Error Handler ---
  const handleSocketError = useCallback(
    (error: {
      availedServiceId: string;
      message: string;
      errorType?: string;
    }) => {
      console.error(`Socket Error (${error.errorType || "Generic"}):`, error);
      alert(
        `Error for service item ${error.availedServiceId}: ${error.message}`,
      );
      setProcessingActions((prev) => {
        const next = new Set(prev);
        if (next.has(error.availedServiceId)) {
          next.delete(error.availedServiceId);
          console.log(
            `Cleared processing state for ${error.availedServiceId} due to error`,
          );
        }
        return next;
      });
    },
    [],
  );

  // --- Socket Event Listeners ---
  useEffect(() => {
    if (!socket) return;
    const serviceUpdateHandler = (updatedService: AvailedServicesProps) =>
      handleSocketUpdates(updatedService, "availedServiceUpdated");
    const transactionCompleteHandler = (completedTx: TransactionProps) =>
      handleSocketUpdates(completedTx, "transactionCompleted");

    socket.on("availedServiceUpdated", serviceUpdateHandler);
    socket.on("transactionCompleted", transactionCompleteHandler);
    socket.on("serviceCheckError", (e) =>
      handleSocketError({ ...e, errorType: "Check" }),
    );
    socket.on("serviceUncheckError", (e) =>
      handleSocketError({ ...e, errorType: "Uncheck" }),
    );
    socket.on("serviceMarkServedError", (e) =>
      handleSocketError({ ...e, errorType: "MarkServed" }),
    );
    socket.on("serviceUnmarkServedError", (e) =>
      handleSocketError({ ...e, errorType: "UnmarkServed" }),
    );

    return () => {
      socket.off("availedServiceUpdated", serviceUpdateHandler);
      socket.off("transactionCompleted", transactionCompleteHandler);
      socket.off("serviceCheckError");
      socket.off("serviceUncheckError");
      socket.off("serviceMarkServedError");
      socket.off("serviceUnmarkServedError");
    };
  }, [socket, handleSocketUpdates, handleSocketError]);

  // --- Filtered Data for Components ---
  const servicesCheckedByMe = useMemo((): AvailedServicesProps[] => {
    if (!accountId || !allPendingTransactions) return [];
    return allPendingTransactions
      .flatMap((tx) => tx.availedServices.map((service) => ({ ...service })))
      .filter((service) => service.checkedById === accountId);
  }, [allPendingTransactions, accountId]);

  // --- Modal Controls ---
  const openMyServicesModal = () => setIsMyServicesModalOpen(true);
  const closeMyServicesModal = () => setIsMyServicesModalOpen(false);
  const openSalaryDetailsModal = () => {
    setIsSalaryDetailsModalOpen(true);
    fetchBreakdown();
  };
  const closeSalaryDetailsModal = () => setIsSalaryDetailsModalOpen(false);
  const openSalesDetailsModal = () => setIsSalesDetailsModalOpen(true);
  const closeSalesDetailsModal = () => setIsSalesDetailsModalOpen(false);

  // --- Loading UI Snippet ---
  const LoadingIndicator = ({ text = "Loading..." }: { text?: string }) => (
    <div className="flex h-[150px] items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 text-customBlack/70 shadow-md">
      {text}
    </div>
  );

  // --- Render ---
  if (typeof accountId !== "string" || !accountId) {
    return (
      <div className="p-6 text-center text-red-500">
        Invalid Account ID provided.
      </div>
    );
  }

  return (
    <>
      <main className="flex h-screen w-screen items-end">
        <div className="ml-auto h-[98vh] w-[80%] overflow-y-auto rounded-tl-3xl bg-customLightBlue bg-opacity-30 p-6 shadow-PageShadow lg:p-8">
          {/* --- Dashboard Header --- */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-bold text-customBlack sm:text-2xl">
              Dashboard {accountData ? `- Welcome, ${accountData.name}!` : ""}
            </h1>
            <Link href={`/dashboard/${accountId}/work-queue`} passHref>
              <Button size="sm">
                View Work Queue (
                {isLoadingTransactions ? "..." : allPendingTransactions.length})
              </Button>
            </Link>
          </div>
          {/* --- Main Content Grid --- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            {/* --- Left Column --- */}
            <div className="space-y-6 lg:col-span-2">
              <div className="flex flex-wrap gap-6">
                <Calendar />
                {/* --- Sales Preview Chart --- */}
                <div className="min-w-[300px] flex-1">
                  {/* Use correct component name */}
                  <PreviewSales
                    monthlyData={salesData?.monthlySales ?? []}
                    isLoading={isLoadingSales}
                    onViewDetails={openSalesDetailsModal} // Ensure this matches modal control
                  />
                </div>
              </div>
              {/* Placeholder for Future Main Content */}
              <div className="mt-8 rounded-lg bg-customOffWhite p-6 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-customBlack">
                  Upcoming Appointments / Analytics
                </h2>
                <p className="text-customBlack/70">
                  (Main dashboard content area placeholder)
                </p>
                <div className="mt-4 h-40 rounded bg-customGray/50"></div>
              </div>
            </div>
            {/* --- Right Column --- */}
            <div className="flex flex-col space-y-6 lg:col-span-1">
              {/* Claimed Services Preview */}
              {isLoadingTransactions ? (
                <LoadingIndicator text="Loading claimed services..." />
              ) : (
                <PreviewListedServices
                  checkedServices={servicesCheckedByMe}
                  onOpenModal={openMyServicesModal}
                />
              )}

              {/* Salary Preview */}
              {isLoadingAccount ? (
                <LoadingIndicator text="Loading salary info..." />
              ) : (
                accountData &&
                !accountData.role.includes(Role.OWNER) && (
                  <PreviewUserSalary // Use correct component name
                    salary={accountData.salary}
                    onOpenDetails={openSalaryDetailsModal} // Correct handler
                    isLoading={false}
                  />
                )
              )}
              {/* Owner message */}
              {!isLoadingAccount &&
                accountData &&
                accountData.role.includes(Role.OWNER) && (
                  <div className="rounded-lg border border-customGray/30 bg-customOffWhite p-4 text-center text-sm text-customBlack/70 shadow-md">
                    Salary view not applicable for Owners.
                  </div>
                )}
            </div>{" "}
            {/* End Right Column */}
          </div>{" "}
          {/* End Main Grid */}
        </div>{" "}
        {/* End Main Content Area */}
      </main>

      {/* --- Modals --- */}
      {/* My Services Modal */}
      {isMyServicesModalOpen && (
        <DialogBackground onClick={closeMyServicesModal}>
          <DialogForm
            onClose={closeMyServicesModal}
            titleComponent={
              <DialogTitle>Manage Your Claimed Services</DialogTitle>
            }
          >
            {/* Use correct component name */}
            {typeof accountId === "string" && (
              <ExpandedListedServices
                services={servicesCheckedByMe}
                accountId={accountId}
                socket={socket}
                onClose={closeMyServicesModal}
                processingServeActions={processingActions}
                setProcessingServeActions={setProcessingActions}
              />
            )}
          </DialogForm>
        </DialogBackground>
      )}

      {/* Salary Details Modal */}
      {isSalaryDetailsModalOpen && accountData && (
        <DialogBackground onClick={closeSalaryDetailsModal}>
          <DialogForm
            onClose={closeSalaryDetailsModal}
            titleComponent={<DialogTitle>Salary Details</DialogTitle>}
          >
            {/* Use correct component name */}
            <ExpandedUserSalary
              breakdownItems={salaryBreakdown}
              onClose={closeSalaryDetailsModal}
              isLoading={isLoadingBreakdown}
              currentTotalSalary={accountData.salary}
            />
          </DialogForm>
        </DialogBackground>
      )}

      {/* --- Sales Details Modal --- */}
      {isSalesDetailsModalOpen && salesData && (
        <DialogBackground onClick={closeSalesDetailsModal}>
          <DialogForm
            onClose={closeSalesDetailsModal}
            titleComponent={
              <DialogTitle>Sales Details (Last 6 Months)</DialogTitle>
            }
          >
            {/* Use correct component name */}
            <ExpandedSales
              monthlyData={salesData.monthlySales}
              paymentTotals={salesData.paymentMethodTotals}
              grandTotal={salesData.grandTotal}
              isLoading={isLoadingSales} // Pass main sales loading state
              onClose={closeSalesDetailsModal}
            />
          </DialogForm>
        </DialogBackground>
      )}
    </>
  );
}
