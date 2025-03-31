"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useParams, useRouter } from "next/navigation";

import Link from "next/link";
import Calendar from "@/components/ui/Calendar";
import ExpandedListedServices from "@/components/ui/ExpandedListedServices"; // Adjust path if needed
import PreviewListedServices from "@/components/ui/PreviewListedServices"; // Adjust path if needed
import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button"; // Adjust path if needed
import { getActiveTransactions } from "@/lib/ServerAction"; // Assuming this exists

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
  // State for ALL pending transactions fetched
  const [allPendingTransactions, setAllPendingTransactions] = useState<
    TransactionProps[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  // State for tracking processing actions (e.g., marking served)
  const [processingActions, setProcessingActions] = useState<Set<string>>(
    new Set(),
  );
  // State to control the modal for managing *user's* checked services
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);

  // --- Socket Connection ---
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

  useEffect(() => {
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
  }, [accountId]);
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

  // --- Loading UI ---
  const loadingComponent = (
    <div className="flex h-[150px] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 p-4 text-gray-500 shadow-md dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
      Loading Services...
    </div>
  );

  // --- Render ---
  return (
    <>
      <main className="flex h-screen w-screen items-end">
        <div className="ml-auto h-[98vh] w-[80%] rounded-tl-3xl bg-customLightBlue bg-opacity-30 p-6 shadow-PageShadow">
          {" "}
          {/* Added padding */}
          {/* --- Dashboard Content --- */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Dashboard
            </h1>
            {/* Button to navigate to the Work Queue (Intercepted Route) */}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Calendar Component Area */}
            <div className="lg:col-span-2">
              <Calendar />
              {/* Other components */}
            </div>

            {/* Service List Area */}
            <div className="lg:col-span-1">
              {isLoading ? (
                loadingComponent
              ) : (
                <PreviewListedServices
                  // Pass only the services CHECKED BY THE CURRENT USER
                  checkedServices={servicesCheckedByMe}
                  onOpenModal={openMyServicesModal} // Open the modal for managing these items
                />
              )}
              {/* Other components for this column */}
            </div>
          </div>
          {/* Add other dashboard sections here */}
        </div>
      </main>

      {/* --- Modal for Managing User's Checked Services --- */}
      {isMyServicesModalOpen && (
        <DialogBackground onClick={closeMyServicesModal}>
          <DialogForm
            onClose={closeMyServicesModal}
            titleComponent={
              <DialogTitle>Manage Your Claimed Services</DialogTitle>
            }
          >
            {/* Render the component to manage the CHECKED services */}
            {typeof accountId === "string" ? (
              <ExpandedListedServices
                services={servicesCheckedByMe} // Pass only checked items
                accountId={accountId} // Pass current user's ID
                socket={socket} // Pass socket instance
                onClose={closeMyServicesModal} // Function to close modal
                processingServeActions={processingActions} // Pass processing state
                setProcessingServeActions={setProcessingActions} // Pass setter for processing state
              />
            ) : (
              <div className="p-4 text-center text-red-500">
                Error: Invalid User Account ID.
              </div>
            )}
          </DialogForm>
        </DialogBackground>
      )}
    </>
  );
}
