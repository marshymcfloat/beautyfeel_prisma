"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useParams, useRouter } from "next/navigation";

import { getSalaryBreakdown, getCurrentAccountData } from "@/lib/ServerAction";
import Link from "next/link";
import Calendar from "@/components/ui/Calendar";
import ExpandedListedServices from "@/components/ui/ExpandedListedServices"; // Adjust path if needed
import PreviewListedServices from "@/components/ui/PreviewListedServices"; // Adjust path if needed
import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button"; // Adjust path if needed
import { getActiveTransactions } from "@/lib/ServerAction"; // Assuming this exists
import ExpandedUserSalary from "@/components/ui/ExpandedUserSalary";
import PreviewUserSalary from "@/components/ui/PreviewUserSalary";
import { Role } from "@prisma/client";
import { AccountData, SalaryBreakdownItem } from "@/lib/Types";
// --- Use the SAME Type Definitions from previous refactoring ---
type CustomerProp = {
  email: string | null;
  id: string;
  name: string;
};

type ServiceProps = {
  title: string; // Using 'title'
  id: string;
};

type AccountInfo = {
  id: string;
  name: string;
} | null;

type AvailedServicesProps = {
  id: string;
  price: number;
  quantity: number;
  serviceId: string;
  transactionId: string;
  service: ServiceProps; // Uses ServiceProps with 'title'
  checkedById: string | null;
  checkedBy: AccountInfo;
  servedById: string | null;
  servedBy: AccountInfo;
  customerName?: string;
  transaction?: TransactionProps;
};

type TransactionProps = {
  id: string;
  createdAt: Date;
  bookedFor: Date;
  customer: CustomerProp;
  customerId: string;
  voucherId: string | null;
  discount: number;
  paymentMethod: string;
  availedServices: AvailedServicesProps[];
  grandTotal: number;
  status: "PENDING" | "DONE" | "CANCELLED";
};
// --- Main Component ---

export default function Home() {
  const { accountID } = useParams(); // Get accountId from route params
  const router = useRouter(); // For navigation if needed
  const accountId = Array.isArray(accountID) ? accountID[0] : accountID; // Ensure accountId is string

  const [socket, setSocket] = useState<Socket | null>(null);
  const [allPendingTransactions, setAllPendingTransactions] = useState<
    TransactionProps[]
  >([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true); // Renamed isLoading
  const [processingActions, setProcessingActions] = useState<Set<string>>(
    new Set(),
  );
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [accountData, setAccountData] = useState<AccountData>(null);
  const [salaryBreakdown, setSalaryBreakdown] = useState<SalaryBreakdownItem[]>(
    [],
  );
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [isSalaryDetailsModalOpen, setIsSalaryDetailsModalOpen] =
    useState(false);

  useEffect(() => {
    if (typeof accountId !== "string" || !accountId) {
      console.error("Account ID is missing or invalid for socket connection.");
      // Maybe redirect to login or show an error
      // router.push('/login');
      return;
    }

    // Connect to the Socket.IO server
    const newSocket = io("http://localhost:4000", {
      // Optional: Pass query params if needed for authentication/identification
      // query: { accountId }
    });
    setSocket(newSocket);
    console.log("Socket connecting...");

    newSocket.on("connect", () =>
      console.log("Socket connected:", newSocket.id),
    );
    newSocket.on("disconnect", () => console.log("Socket disconnected"));
    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      alert(
        `Failed to connect to realtime server: ${err.message}. Features requiring updates may not work.`,
      );
    });

    // Cleanup on unmount
    return () => {
      console.log("Socket disconnecting...");
      newSocket.disconnect();
      setSocket(null);
    };
  }, [accountId]); // Reconnect if accountId changes

  /*   useEffect(() => {
    async function fetchData() {
      if (typeof accountId !== "string" || !accountId) {
        console.error("Account ID missing, cannot fetch transactions.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        console.log("Fetching active transactions...");
        const data = await getActiveTransactions();
        const processedData = data.map((tx) => ({
          ...tx,
          createdAt: new Date(tx.createdAt),
          bookedFor: new Date(tx.bookedFor),
          availedServices: tx.availedServices.map((as) => ({
            ...as,
            customerName: tx.customer?.name ?? "Unknown Customer",
            // --- FIX 1: Use only service.title ---
            service: {
              id: as.service.id,
              title: as.service.title, // Use the 'title' property consistently
            },
          })),
        }));
        setAllPendingTransactions(processedData);
        console.log("Fetched Transactions:", processedData);
      } catch (error) {
        console.error("Error fetching transactions:", error);
        alert("Failed to fetch initial list of transactions.");
        setAllPendingTransactions([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [accountId]); */
  // --- Centralized Socket Event Handler ---

  // --- Fetch Initial Data (Transactions + Account Data) ---
  useEffect(() => {
    async function fetchInitialData() {
      if (typeof accountId !== "string" || !accountId) {
        console.error("Account ID missing.");
        setIsLoadingTransactions(false);
        setIsLoadingAccount(false);
        return;
      }
      // Fetch both concurrently
      setIsLoadingTransactions(true);
      setIsLoadingAccount(true);
      try {
        // Use Promise.all to fetch concurrently
        const [transactionsData, accData] = await Promise.all([
          getActiveTransactions(),
          getCurrentAccountData(accountId), // Fetch account data
        ]);

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
        console.log("Fetched Transactions:", processedTransactions);

        // Set Account Data
        setAccountData(accData);
        console.log("Fetched Account Data:", accData);
      } catch (error) {
        console.error("Error fetching initial dashboard data:", error);
        alert("Failed to load initial dashboard data.");
        setAllPendingTransactions([]);
        setAccountData(null);
      } finally {
        setIsLoadingTransactions(false);
        setIsLoadingAccount(false);
      }
    }
    fetchInitialData();
  }, [accountId]); // Re-fetch if accountId changes

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
      console.log("Fetched Salary Breakdown:", breakdownData);
    } catch (error) {
      console.error("Error fetching salary breakdown:", error);
      alert("Failed to load salary breakdown details.");
      setSalaryBreakdown([]); // Clear on error
    } finally {
      setIsLoadingBreakdown(false);
    }
  }, [accountId, isLoadingBreakdown]); // Add dependencies

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
      } else if (eventType === "availedServiceUpdated") {
        const updatedService = data as AvailedServicesProps;

        setProcessingActions((prev) => {
          const next = new Set(prev);
          if (next.has(updatedService.id)) {
            next.delete(updatedService.id);
            console.log(`Cleared processing state for ${updatedService.id}`);
          }
          return next;
        });

        setAllPendingTransactions((prevTransactions) => {
          return prevTransactions.map((transaction) => {
            if (transaction.id === updatedService.transactionId) {
              const serviceWithPossibleCustomer = {
                ...updatedService,
                customerName: transaction.customer?.name ?? "Unknown Customer",
                // --- FIX 2: Use only service.title ---
                service: {
                  id: updatedService.service.id,
                  title: updatedService.service.title, // Use the 'title' property consistently
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
    [],
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
      // Stop processing indicator on error for the specific item
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
  ); // No dependencies

  // --- Socket Event Listeners ---
  useEffect(() => {
    if (!socket) return;

    // Success listeners
    const serviceUpdateHandler = (updatedService: AvailedServicesProps) =>
      handleSocketUpdates(updatedService, "availedServiceUpdated");
    const transactionCompleteHandler = (completedTx: TransactionProps) =>
      handleSocketUpdates(completedTx, "transactionCompleted");

    socket.on("availedServiceUpdated", serviceUpdateHandler);
    socket.on("transactionCompleted", transactionCompleteHandler);

    // Error listeners
    // Pass the error type for better console logging if desired
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

    // Cleanup listeners
    return () => {
      socket.off("availedServiceUpdated", serviceUpdateHandler);
      socket.off("transactionCompleted", transactionCompleteHandler);
      socket.off("serviceCheckError");
      socket.off("serviceUncheckError");
      socket.off("serviceMarkServedError");
      socket.off("serviceUnmarkServedError");
    };
  }, [socket, handleSocketUpdates, handleSocketError]); // Add handlers as dependencies

  // --- Filtered Data for Components ---
  // Get only the availed services that are checked by the current user
  const servicesCheckedByMe = useMemo((): AvailedServicesProps[] => {
    if (!accountId || !allPendingTransactions) return [];

    return allPendingTransactions
      .flatMap((tx) =>
        tx.availedServices.map((service) => ({
          // Spread existing service data (which includes customerName and updated service.title)
          ...service,
          // Optionally add transaction ref if needed by ExpandedListedServices
          // transaction: tx
        })),
      ) // Flatten into a single array of availed services
      .filter((service) => service.checkedById === accountId); // Filter by current user's check
  }, [allPendingTransactions, accountId]);

  // --- Modal Controls ---
  const openMyServicesModal = () => setIsMyServicesModalOpen(true);
  const closeMyServicesModal = () => setIsMyServicesModalOpen(false);

  const openSalaryDetailsModal = () => {
    setIsSalaryDetailsModalOpen(true);
    // Fetch breakdown data when opening the modal
    fetchBreakdown();
  };
  const closeSalaryDetailsModal = () => {
    setIsSalaryDetailsModalOpen(false);
    // Optional: Clear breakdown data when closing modal to save memory if needed
    // setSalaryBreakdown([]);
  };
  // --- Loading UI ---
  const loadingComponent = (
    <div className="flex h-[150px] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 p-4 text-gray-500 shadow-md dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
      Loading Services...
    </div>
  );

  // --- Render ---

  return (
    <>
      {/* Main container excluding the fixed left sidebar */}
      <main className="flex h-screen w-screen items-end">
        {/* Apply background, padding, shadow to the main content area */}
        <div className="ml-auto h-[98vh] w-[80%] overflow-y-auto rounded-tl-3xl bg-customLightBlue bg-opacity-30 p-6 shadow-PageShadow lg:p-8">
          {/* --- Dashboard Header --- */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-bold text-customBlack sm:text-2xl">
              Dashboard {accountData ? `- Welcome, ${accountData.name}!` : ""}
            </h1>
          </div>
          {/* --- Main Content Grid --- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            {/* --- Left Column --- */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <Calendar />
              </div>
            </div>
            {/* --- Right Column --- */}
            <div className="flex flex-col space-y-6 lg:col-span-1">
              {/* Claimed Services Preview */}
              {isLoadingTransactions ? (
                // Replace LoadingWidget with inline div
                <div className="flex h-[150px] items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 text-customBlack/70 shadow-md">
                  Loading claimed services...
                </div>
              ) : (
                <PreviewListedServices
                  checkedServices={servicesCheckedByMe}
                  onOpenModal={openMyServicesModal}
                />
              )}

              {/* Salary Preview */}
              {isLoadingAccount ? (
                // Replace LoadingWidget with inline div
                <div className="flex h-[150px] items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 text-customBlack/70 shadow-md">
                  Loading salary info...
                </div>
              ) : (
                accountData &&
                !accountData.role.includes(Role.OWNER) && (
                  <PreviewUserSalary
                    salary={accountData.salary}
                    onOpenDetails={openSalaryDetailsModal}
                    isLoading={false}
                  />
                )
              )}
              {/* Owner message (optional) */}
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
            {/* Removed explicit error state check, rely only on accountId type check */}
            {typeof accountId === "string" && ( // Keep this check
              <ExpandedListedServices
                services={servicesCheckedByMe}
                accountId={accountId}
                socket={socket}
                onClose={closeMyServicesModal}
                processingServeActions={processingActions}
                setProcessingServeActions={setProcessingActions}
              />
            )}
            {/* If accountId is somehow not a string, nothing renders here */}
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
            <ExpandedUserSalary
              breakdownItems={salaryBreakdown}
              onClose={closeSalaryDetailsModal}
              isLoading={isLoadingBreakdown}
              currentTotalSalary={accountData.salary}
            />
          </DialogForm>
        </DialogBackground>
      )}
    </>
  );
}
