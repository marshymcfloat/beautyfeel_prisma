"use client";

import Button from "@/components/Buttons/Button"; // Adjust path if needed
import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { getActiveTransactions } from "@/lib/ServerAction";
import { useState, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// --- Type Definitions (Keep as they are) ---
type CustomerProp = {
  email: string | null;
  id: string;
  name: string;
};

type ServiceProps = {
  title: string;
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
  service: ServiceProps;
  checkedById: string | null;
  checkedBy: AccountInfo;
  servedById: string | null; // Keep for display/styling info if needed
  servedBy: AccountInfo; // Keep for display/styling info if needed
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

// --- Component ---

export default function WorkInterceptedModal() {
  const { accountID: accountId } = useParams();
  const router = useRouter();
  const [fetchedTransactions, setFetchedTransactions] = useState<
    TransactionProps[] | null
  >(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  // --- STATE FOR PROCESSING CHECK/UNCHECK ACTIONS ---
  const [processingCheckActions, setProcessingCheckActions] = useState<
    Set<string>
  >(
    new Set(), // availedServiceId -> isProcessing Check/Uncheck
  );

  // --- Socket Connection (Keep as is) ---
  useEffect(() => {
    if (typeof accountId !== "string") {
      console.error("Account ID is missing or invalid.");
      router.back(); // Go back if no accountID
      return;
    }
    const newSocket = io("http://localhost:4000");
    setSocket(newSocket);
    console.log("Socket connecting...");
    newSocket.on("connect", () =>
      console.log("Socket connected:", newSocket.id),
    );
    newSocket.on("disconnect", () => console.log("Socket disconnected"));
    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      alert(`Failed to connect to server: ${err.message}`);
    });
    return () => {
      console.log("Socket disconnecting...");
      newSocket.disconnect();
      setSocket(null);
    };
  }, [accountId, router]); // Added router to dependencies

  // --- Update State based on Socket Events ---
  // This needs to handle updates originating from ANY source (checking, serving, completion)
  const handleAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      console.log("Received availedServiceUpdated:", updatedAvailedService);

      // Stop processing indicator *for check/uncheck actions* if this update matches
      setProcessingCheckActions((prev) => {
        const newSet = new Set(prev);
        newSet.delete(updatedAvailedService.id);
        return newSet;
      });

      // Update the main transaction list
      setFetchedTransactions((prev) => {
        if (!prev) return null;
        return prev.map((transaction) => {
          if (transaction.id === updatedAvailedService.transactionId) {
            return {
              ...transaction,
              availedServices: transaction.availedServices.map((service) =>
                service.id === updatedAvailedService.id
                  ? updatedAvailedService
                  : service,
              ),
            };
          }
          return transaction;
        });
      });

      // Update the currently selected transaction view, if it matches
      setSelectedTransaction((prev) => {
        if (!prev || prev.id !== updatedAvailedService.transactionId)
          return prev;
        return {
          ...prev,
          availedServices: prev.availedServices.map((service) =>
            service.id === updatedAvailedService.id
              ? updatedAvailedService
              : service,
          ),
        };
      });
    },
    [],
  );

  // Keep transaction completion handler
  const handleTransactionCompletion = useCallback(
    (completedTransaction: TransactionProps) => {
      console.log("Received transactionCompleted:", completedTransaction);
      alert(
        `Transaction ${completedTransaction.id} for ${completedTransaction.customer.name} is completed!`,
      );
      setFetchedTransactions(
        (prev) => prev?.filter((t) => t.id !== completedTransaction.id) ?? null,
      );
      setSelectedTransaction((prev) =>
        prev?.id === completedTransaction.id ? null : prev,
      );
    },
    [],
  );

  // --- Socket Event Listeners ---
  useEffect(() => {
    if (!socket) return;

    socket.on("availedServiceUpdated", handleAvailedServiceUpdate);
    socket.on("transactionCompleted", handleTransactionCompletion);

    // --- Error Listeners for Check/Uncheck Actions ---
    const handleCheckError = (error: {
      availedServiceId: string;
      message: string;
    }) => {
      console.error("Service Check/Uncheck Error:", error);
      alert(
        `Error for service item ${error.availedServiceId}: ${error.message}`,
      );
      setProcessingCheckActions((prev) => {
        const newSet = new Set(prev);
        newSet.delete(error.availedServiceId);
        return newSet;
      });
    };

    socket.on("serviceCheckError", handleCheckError);
    socket.on("serviceUncheckError", handleCheckError);
    // No longer need listeners for serve/unserve errors HERE

    return () => {
      socket.off("availedServiceUpdated", handleAvailedServiceUpdate);
      socket.off("transactionCompleted", handleTransactionCompletion);
      socket.off("serviceCheckError", handleCheckError);
      socket.off("serviceUncheckError", handleCheckError);
    };
  }, [socket, handleAvailedServiceUpdate, handleTransactionCompletion]);

  // --- Fetch Initial Data (Keep as is) ---
  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true);
      try {
        if (typeof accountId === "string") {
          const data = await getActiveTransactions();
          const processedData = data.map((tx) => ({
            ...tx,
            createdAt: new Date(tx.createdAt),
            bookedFor: new Date(tx.bookedFor),
          }));
          setFetchedTransactions(processedData);
        } else {
          console.error("Cannot fetch transactions: Account ID is invalid.");
          setFetchedTransactions(null);
        }
      } catch (error) {
        console.error("Error fetching transactions:", error);
        alert("Failed to fetch transactions.");
      } finally {
        setLoading(false);
      }
    }
    fetchTransactions();
  }, [accountId]);

  // --- UI Event Handlers ---
  function handleSelectTransaction(transaction: TransactionProps) {
    setSelectedTransaction(transaction);
  }

  function handleCloseDetails() {
    setSelectedTransaction(null);
  }

  // --- Check/Uncheck Handler (Simplified) ---
  function handleServiceCheckToggle(
    availedService: AvailedServicesProps,
    isChecked: boolean, // The desired state from the checkbox click
  ) {
    if (!socket || typeof accountId !== "string") return;

    const { id: availedServiceId, transactionId } = availedService;

    // Prevent action if already processing this specific check/uncheck
    if (processingCheckActions.has(availedServiceId)) return;

    setProcessingCheckActions((prev) => new Set(prev).add(availedServiceId));

    if (isChecked) {
      // --- Trying to CHECK the box ---
      // No need to check if already checked by self - UI should reflect this.
      // Check if checked by *someone else* is handled by the backend atomically.
      console.log(`Emitting checkService for ${availedServiceId}`);
      socket.emit("checkService", {
        availedServiceId,
        transactionId,
        accountId: accountId,
      });
    } else {
      // --- Trying to UNCHECK the box ---
      // Backend handles ensuring only the owner can uncheck.
      console.log(`Emitting uncheckService for ${availedServiceId}`);
      socket.emit("uncheckService", {
        availedServiceId,
        transactionId,
        accountId: accountId,
      });
    }
  }

  // --- Checkbox Disabled Logic ---
  function isCheckboxDisabled(service: AvailedServicesProps): boolean {
    // Disable if a check/uncheck action is currently being processed for this item
    if (processingCheckActions.has(service.id)) return true;
    // Disable if it's checked by *someone else*
    if (service.checkedById && service.checkedById !== accountId) return true;
    // Maybe disable if served? Decide based on workflow. If you can uncheck even if served:
    // return false;
    // If checking/unchecking is locked once served:
    if (service.servedById) return true;

    return false;
  }

  // --- Determine Background Color based on Check/Served Status ---
  function getServiceBackgroundColor(service: AvailedServicesProps): string {
    // Base color for available items using custom colors
    const baseColor = "bg-customBlack text-customOffWhite"; // Dark base like screenshot

    if (processingCheckActions.has(service.id)) {
      // Use a neutral processing state
      return "animate-pulse bg-customGray text-customBlack opacity-70";
    }
    if (service.servedById) {
      // Use a distinct success color (can be standard green or a custom one if defined)
      // Sticking to a standard green variant for clarity
      return "bg-green-600 text-customOffWhite";
    }
    if (service.checkedById === accountId) {
      // Highlight strongly using primary accent color
      return "bg-customDarkPink text-customOffWhite";
    }
    if (service.checkedById) {
      // Muted state for "checked by other"
      return "bg-customGray text-customBlack";
    }
    return baseColor; // Available state
  }
  // --- Render Logic ---
  if (loading) {
    // Use custom colors for loading state
    return (
      <DialogBackground>
        <DialogForm titleComponent={<DialogTitle>Loading...</DialogTitle>}>
          <div className="flex h-40 items-center justify-center">
            <p className="text-customBlack/70">Loading Work Queue...</p>
          </div>
        </DialogForm>
      </DialogBackground>
    );
  }

  return (
    // Using onClick on DialogBackground to close is optional
    <DialogBackground onClick={() => router.back()}>
      <DialogForm
        onClose={() => router.back()}
        titleComponent={
          // Use custom colors for title area
          <div className="relative flex items-center justify-center border-b border-customGray pb-3">
            {selectedTransaction && (
              <button
                onClick={handleCloseDetails}
                className="absolute left-0 top-1/2 -translate-y-1/2 p-2 text-customBlack/60 hover:text-customBlack"
                aria-label="Back to list"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            <DialogTitle>Work Queue</DialogTitle>
            <button
              onClick={() => router.back()}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-customBlack/50 hover:text-customBlack"
              aria-label="Close modal"
            ></button>
          </div>
        }
      >
        {/* Content container with custom border */}
        <div className="mx-auto mt-4 h-[500px] min-w-[350px] overflow-hidden rounded-md border-2 border-customDarkPink md:w-[95%] lg:w-[450px]">
          {selectedTransaction ? (
            // --- Transaction Details View ---
            <div className="flex h-full flex-col">
              {/* Header Section - Using customDarkPink */}
              <div className="flex-shrink-0 bg-customDarkPink p-4 text-customOffWhite">
                <h2 className="mb-1 text-lg font-bold">
                  {selectedTransaction.customer.name}
                </h2>
                {/* Lighter text for details on dark pink background */}
                <div className="text-xs text-customOffWhite/80">
                  <p>
                    <span className="font-semibold">Created: </span>
                    {selectedTransaction.createdAt.toLocaleDateString()}
                  </p>
                  <p>
                    <span className="font-semibold">Booked For: </span>
                    {selectedTransaction.bookedFor.toLocaleDateString()}{" "}
                    {selectedTransaction.bookedFor.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p>
                    <span className="font-semibold">Status: </span>
                    {/* Use standard status colors here for clarity? Or map them? */}
                    <span
                      className={`font-medium ${
                        selectedTransaction.status === "PENDING"
                          ? "text-orange-200" // Lighter orange on dark pink
                          : "text-green-200" // Lighter green on dark pink
                      }`}
                    >
                      {selectedTransaction.status}
                    </span>
                  </p>
                </div>
              </div>

              {/* Services List - Using custom light blue background */}
              <div className="flex-grow overflow-y-auto bg-customWhiteBlue p-3">
                {selectedTransaction.availedServices.length === 0 ? (
                  <p className="mt-10 text-center italic text-customBlack/60">
                    No services availed for this transaction.
                  </p>
                ) : (
                  selectedTransaction.availedServices.map((service) => (
                    // Individual Service Item Card
                    <div
                      key={service.id}
                      className={`mb-3 flex flex-col rounded-lg p-3 shadow-custom transition-colors duration-200 ${getServiceBackgroundColor(service)}`}
                    >
                      {/* Top Row: Checkbox, Title, Price */}
                      <div className="flex items-center justify-between">
                        <div className="relative flex flex-grow items-center">
                          <input
                            type="checkbox"
                            checked={!!service.checkedById}
                            onChange={(e) =>
                              handleServiceCheckToggle(
                                service,
                                e.target.checked,
                              )
                            }
                            // Add 'peer' class for the SVG targeting
                            // Keep appearance-none and basic box styling
                            // Change checked state: set bg and border to pink
                            className={`peer relative mr-3 size-5 flex-shrink-0 appearance-none rounded border border-customGray bg-customOffWhite checked:border-customDarkPink checked:bg-customDarkPink focus:outline-none focus:ring-2 focus:ring-customDarkPink/50 focus:ring-offset-1 focus:ring-offset-customWhiteBlue disabled:opacity-50 ${isCheckboxDisabled(service) ? "cursor-not-allowed" : "cursor-pointer"} `}
                            id={`check-${service.id}`}
                            disabled={isCheckboxDisabled(service)}
                            aria-label={`Check service ${service.service.title}`}
                          />
                          {/* Add the SVG Checkmark Here */}
                          <div
                            className={`/* Allows clicking through to the checkbox */ pointer-events-none absolute left-[3px] top-[3px] hidden size-3.5 text-customOffWhite peer-checked:block peer-disabled:text-customGray/50`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              stroke="currentColor"
                              strokeWidth={1} // Adjust stroke width if needed
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>

                          <label
                            htmlFor={`check-${service.id}`}
                            className={`text-base font-medium ${isCheckboxDisabled(service) ? "" : "cursor-pointer"}`}
                          >
                            {service.service.title}{" "}
                            {service.quantity > 1
                              ? `(x${service.quantity})`
                              : ""}
                          </label>
                        </div>
                        {/* Text color adjusts based on card background */}
                        <span className="ml-4 flex-shrink-0 text-sm font-semibold">
                          &#8369;{service.price}
                        </span>
                      </div>

                      {/* Bottom Row: Status Indicators */}
                      {/* Adjust status text color based on card background */}
                      <div
                        className={`mt-1.5 flex justify-between pl-[calc(1.25rem+0.75rem)] text-xs ${service.checkedById ? "text-customOffWhite/70" : "text-customGray"}`}
                      >
                        <span>
                          Checked by:{" "}
                          {/* Adjust name text color based on card background */}
                          <span
                            className={`font-medium ${service.checkedById ? "text-customOffWhite" : "text-customLightBlue"}`}
                          >
                            {service.checkedBy?.name ?? "Nobody"}
                          </span>
                        </span>
                        <span className="text-right">
                          Served by:{" "}
                          <span
                            className={`font-medium ${
                              service.servedById
                                ? "text-green-300" // Keep green distinct for served status
                                : service.checkedById
                                  ? "text-customOffWhite"
                                  : "text-customLightBlue" // Adjust default based on card bg
                            }`}
                          >
                            {service.servedBy?.name ?? "Not Served"}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            // --- Transaction List View - Using Custom Colors ---
            <div className="h-full overflow-y-auto">
              <table className="min-w-full table-fixed border-collapse">
                {/* Use customGray for header background */}
                <thead className="sticky top-0 z-10 bg-customGray">
                  <tr>
                    {/* Use customBlack for header text */}
                    <th className="w-1/4 border-b border-customGray px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-customBlack">
                      Date
                    </th>
                    <th className="w-1/2 border-b border-customGray px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-customBlack">
                      Customer
                    </th>
                    <th className="w-1/4 border-b border-customGray px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-customBlack">
                      Status
                    </th>
                  </tr>
                </thead>
                {/* Use customOffWhite for table body background */}
                <tbody className="divide-y divide-customGray/50 bg-customOffWhite">
                  {fetchedTransactions && fetchedTransactions.length > 0 ? (
                    fetchedTransactions.map((transaction) => (
                      <tr
                        // Use customLightBlue for hover
                        className="cursor-pointer hover:bg-customLightBlue/50"
                        key={transaction.id}
                        onClick={() => handleSelectTransaction(transaction)}
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          handleSelectTransaction(transaction)
                        }
                      >
                        {/* Use customBlack for cell text */}
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-customBlack/80">
                          {transaction.bookedFor.toLocaleDateString()}
                        </td>
                        <td className="truncate whitespace-nowrap px-4 py-3 text-sm font-medium text-customBlack">
                          {transaction.customer.name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          {/* Map status badges to custom colors or keep standard */}
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold lowercase leading-tight ${
                              transaction.status === "PENDING"
                                ? "bg-customDarkPink/20 text-customDarkPink" // Example: Lighter pink bg, dark pink text
                                : transaction.status === "DONE"
                                  ? "bg-green-100 text-green-800" // Keep standard green?
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {transaction.status.toLowerCase()}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-10 text-center text-sm italic text-customBlack/60"
                      >
                        {loading
                          ? "Loading..."
                          : "No pending transactions found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogForm>
    </DialogBackground>
  );
}
/* "use client";

import Button from "@/components/Buttons/Button";
import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { getActiveTransactions } from "@/lib/ServerAction";
import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { useParams } from "next/navigation";
type CustomerProp = {
  email: string;
  id: string;
  name: string;
};

type ServiceProps = {
  title: string;
  id: string;
};

type availedServicesProps = {
  checkedBy: string | null;
  id: string;
  price: number;
  quantity: number;
  servedBy: string | null;
  serviceId: string;
  service: ServiceProps;
  transactionId: string;
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
  availedServices: availedServicesProps[];
  grandTotal: number;
  status: "PENDING" | "DONE";
};

export default function WorkInterceptedModal() {
  const { accountID } = useParams();

  const [fetchedTransactions, setFetchedTransactions] = useState<
    TransactionProps[] | null
  >(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io("http://localhost:4000");
    setSocket(newSocket);

    // Clean up on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    // Listen for service updates
    socket.on("serviceUpdated", (updatedService: availedServicesProps) => {
      setFetchedTransactions((prev) => {
        if (!prev) return null;

        return prev.map((transaction) => {
          if (transaction.id === updatedService.transactionId) {
            return {
              ...transaction,
              availedServices: transaction.availedServices.map((service) =>
                service.id === updatedService.id ? updatedService : service,
              ),
            };
          }
          return transaction;
        });
      });

      setSelectedTransaction((prev) => {
        if (!prev || prev.id !== updatedService.transactionId) return prev;

        return {
          ...prev,
          availedServices: prev.availedServices.map((service) =>
            service.id === updatedService.id ? updatedService : service,
          ),
        };
      });
    });

    return () => {
      socket.off("serviceUpdated");
    };
  }, [socket]);
  useEffect(() => {
    async function fetchTransactions() {
      try {
        const data = await getActiveTransactions();
        setFetchedTransactions(data);
        console.log(data);
      } catch (error) {
        console.error("Error fetching transactions:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTransactions();
  }, []);

  function handleSelectingTransaction(transaction: TransactionProps) {
    setSelectedTransaction(transaction);
    console.log(selectedTransaction);
  }

  function handleServiceToggle(
    service: availedServicesProps,
    isChecked: boolean,
  ) {
    if (!socket || !selectedTransaction || !accountID) return;

    if (isChecked) {
      // Check if already checked by someone else
      if (service.checkedBy && service.checkedBy !== accountID) {
        alert("This service is already being handled by someone else");
        return;
      }

      // Select service
      socket.emit("selectService", {
        serviceId: service.id,
        transactionId: selectedTransaction.id,
        accountID: accountID,
      });
    } else {
      // Unselect service - only if current user was the one who checked it
      if (service.checkedBy === accountID) {
        socket.emit("unselectService", {
          serviceId: service.id,
          transactionId: selectedTransaction.id,
          accountID: accountID,
        });
      }
    }
  }

  // Add this helper function to determine if checkbox should be disabled
  function isCheckboxDisabled(service: availedServicesProps): boolean {
    // Disable if:
    // 1. Service is checked by someone else, OR
    // 2. Service is checked by current user (to prevent unchecking by others)
    return !!service.checkedBy && service.checkedBy !== accountID;
  }
  return (
    <DialogBackground>
      <DialogForm>
        <DialogTitle>BeautyFeel</DialogTitle>

        <div className="mx-auto mt-4 h-[500px] min-w-[330px] rounded-md border-2 border-customDarkPink md:w-[95%]">
          {selectedTransaction ? (
            <>
              <div className="ml-2 flex flex-col">
                <h1 className="text-2xl font-bold">
                  {selectedTransaction.customer.name}
                </h1>
                <div className="">
                  <p>
                    <span className="font-bold">DATE: </span>
                    {selectedTransaction.createdAt.toLocaleDateString()}
                  </p>
                  <p>
                    <span className="font-bold">BOOKED FOR: </span>
                    {selectedTransaction.bookedFor.toLocaleDateString()}{" "}
                    {selectedTransaction.bookedFor.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="flex h-[420px] flex-col overflow-y-auto">
                {selectedTransaction.availedServices.map((service, idx) => (
                  <div
                    key={service.id}
                    className="mx-2 my-2 flex items-center justify-between rounded-md bg-customDarkPink p-2 shadow-custom"
                  >
                    <input
                      type="checkbox"
                      checked={!!service.checkedBy}
                      onChange={(e) =>
                        handleServiceToggle(service, e.target.checked)
                      }
                      className="size-5"
                      id={`${service.service.id}${idx}`}
                      disabled={isCheckboxDisabled(service)}
                    />
                    <label htmlFor={`${service.service.id}${idx}`}>
                      {service.service.title}
                    </label>
                    <div className="flex w-[20%] flex-col overflow-y-auto">
                      <p>by:</p>
                      <span className="font-medium">
                        {service.servedBy || "none"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th>date</th>
                  <th>name</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                {fetchedTransactions ? (
                  fetchedTransactions?.map((transaction) => (
                    <tr
                      className="border-b-2 border-customDarkPink"
                      key={transaction.id}
                      onClick={() => handleSelectingTransaction(transaction)}
                    >
                      <td className="text-center">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </td>
                      <td className="max-w-[150px] overflow-hidden truncate whitespace-nowrap text-center">
                        {transaction.customer.name}
                      </td>

                      <td className="lowercase">
                        {transaction.status.toLowerCase()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={3}
                      className="my-auto w-full text-center font-bold"
                    >
                      Please wait...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-4 flex justify-around">
          <Button>Done</Button>
        </div>
      </DialogForm>
    </DialogBackground>
  );
} */

{
  /* <DialogBackground>
<DialogForm>
  <DialogTitle>BeautyFeel</DialogTitle>

  <div className="mx-auto mt-4 h-[500px] min-w-[330px] rounded-md border-2 border-customDarkPink md:w-[95%]">
    {selectedTransaction ? (
      <>
        <div className="ml-2 flex flex-col">
          <h1 className="text-2xl font-bold">
            {selectedTransaction.customer.name}
          </h1>
          <div className="">
            <p>
              <span className="font-bold">DATE: </span>
              {selectedTransaction.createdAt.toLocaleDateString()}
            </p>
            <p>
              <span className="font-bold">BOOKED FOR: </span>
              {selectedTransaction.bookedFor.toLocaleDateString()}{" "}
              {selectedTransaction.bookedFor.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex h-[420px] flex-col overflow-y-auto">
          {selectedTransaction.availedServices.map((service, idx) => (
            <div
              key={service.id}
              className="mx-2 my-2 flex items-center justify-between rounded-md bg-customDarkPink p-2 shadow-custom"
            >
              <input
                type="checkbox"
                name=""
                className="size-5"
                id={`${service.service.id}${idx}`}
              />
              <label htmlFor={`${service.service.id}${idx}`}>
                {service.service.title}
              </label>
              <div className="flex w-[20%] flex-col overflow-y-auto">
                <p>by:</p>
                <span className="font-medium">none</span>
              </div>
            </div>
          ))}
        </div>
      </>
    ) : (
      <table className="w-full">
        <thead>
          <tr>
            <th>date</th>
            <th>name</th>
            <th>status</th>
          </tr>
        </thead>
        <tbody>
          {fetchedTransactions ? (
            fetchedTransactions?.map((transaction) => (
              <tr
                className="border-b-2 border-customDarkPink"
                key={transaction.id}
                onClick={() => handleSelectingTransaction(transaction)}
              >
                <td className="text-center">
                  {new Date(transaction.createdAt).toLocaleDateString()}
                </td>
                <td className="max-w-[150px] overflow-hidden truncate whitespace-nowrap text-center">
                  {transaction.customer.name}
                </td>

                <td className="lowercase">
                  {transaction.status.toLowerCase()}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={3}
                className="my-auto w-full text-center font-bold"
              >
                Please wait...
              </td>
            </tr>
          )}
        </tbody>
      </table>
    )}
  </div>
  <div className="mt-4 flex justify-around">
    <Button>Done</Button>
  </div>
</DialogForm>
</DialogBackground>
); */
}
