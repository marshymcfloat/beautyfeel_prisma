"use client";

import Button from "@/components/Buttons/Button";
import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { getActiveTransactions } from "@/lib/ServerAction"; // Assuming this fetches transactions with status PENDING
import { useState, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useParams, useRouter } from "next/navigation"; // Added useRouter
import { ChevronLeft } from "lucide-react";

// --- Type Definitions (Keep as they are) ---
type CustomerProp = {
  email: string | null; // Make email nullable as per schema
  id: string;
  name: string;
};

type ServiceProps = {
  title: string;
  id: string;
};

type AccountInfo = {
  // Added type for user info included in availedService
  id: string;
  name: string;
} | null;

type AvailedServicesProps = {
  // Corrected naming convention and added included relations
  id: string;
  price: number;
  quantity: number;
  serviceId: string;
  transactionId: string;
  service: ServiceProps;
  checkedById: string | null;
  checkedBy: AccountInfo; // Use AccountInfo type
  servedById: string | null;
  servedBy: AccountInfo; // Use AccountInfo type
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
  grandTotal: number; // Ensure this type matches schema if it was Int
  status: "PENDING" | "DONE" | "CANCELLED"; // Include CANCELLED from schema enum
};

// --- Component ---

export default function WorkInterceptedModal() {
  const { accountID: accountId } = useParams(); // Rename for consistency
  const router = useRouter(); // For closing the modal
  const [fetchedTransactions, setFetchedTransactions] = useState<
    TransactionProps[] | null
  >(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [processingServices, setProcessingServices] = useState<Set<string>>(
    new Set(),
  ); // serviceId -> isProcessing

  // --- Socket Connection ---
  useEffect(() => {
    // Ensure accountId is available and is a string
    if (typeof accountId !== "string") {
      console.error("Account ID is missing or invalid.");
      // Handle error appropriately, maybe redirect or show message
      // router.back(); // Example: Go back if no accountID
      return;
    }

    const newSocket = io("http://localhost:4000");
    setSocket(newSocket);
    console.log("Socket connecting...");

    newSocket.on("connect", () => {
      console.log("Socket connected:", newSocket.id);
    });

    newSocket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      alert(`Failed to connect to server: ${err.message}`);
    });

    return () => {
      console.log("Socket disconnecting...");
      newSocket.disconnect();
      setSocket(null);
    };
  }, [accountId]); // Add accountId dependency

  // --- Update State based on Socket Events ---
  const handleAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      console.log("Received availedServiceUpdated:", updatedAvailedService);
      // Stop processing indicator for this service
      setProcessingServices((prev) => {
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
  ); // No dependencies needed as it uses state setters

  const handleTransactionCompletion = useCallback(
    (completedTransaction: TransactionProps) => {
      console.log("Received transactionCompleted:", completedTransaction);
      alert(
        `Transaction ${completedTransaction.id} for ${completedTransaction.customer.name} is completed!`,
      );

      // Remove completed transaction from the list
      setFetchedTransactions(
        (prev) => prev?.filter((t) => t.id !== completedTransaction.id) ?? null,
      );

      // If the completed transaction was selected, deselect it
      setSelectedTransaction((prev) =>
        prev?.id === completedTransaction.id ? null : prev,
      );
    },
    [],
  ); // Empty dependency array

  // --- Socket Event Listeners ---
  useEffect(() => {
    if (!socket) return;

    // --- Success Listener ---
    socket.on("availedServiceUpdated", handleAvailedServiceUpdate);
    socket.on("transactionCompleted", handleTransactionCompletion); // Listen for completion

    // --- Error Listeners ---
    const handleServiceError = (error: {
      availedServiceId: string;
      message: string;
    }) => {
      console.error("Service Error:", error);
      alert(
        `Error for service item ${error.availedServiceId}: ${error.message}`,
      );
      // Stop processing indicator on error
      setProcessingServices((prev) => {
        const newSet = new Set(prev);
        newSet.delete(error.availedServiceId);
        return newSet;
      });
    };

    socket.on("serviceCheckError", handleServiceError);
    socket.on("serviceUncheckError", handleServiceError);
    socket.on("serviceMarkServedError", handleServiceError);
    socket.on("serviceUnmarkServedError", handleServiceError);

    // Cleanup listeners on component unmount or socket change
    return () => {
      socket.off("availedServiceUpdated", handleAvailedServiceUpdate);
      socket.off("transactionCompleted", handleTransactionCompletion);

      socket.off("serviceCheckError", handleServiceError);
      socket.off("serviceUncheckError", handleServiceError);
      socket.off("serviceMarkServedError", handleServiceError);
      socket.off("serviceUnmarkServedError", handleServiceError);
    };
  }, [socket, handleAvailedServiceUpdate, handleTransactionCompletion]); // Add handlers as dependencies

  // --- Fetch Initial Data ---
  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true);
      try {
        // Ensure accountId is a string before fetching
        if (typeof accountId === "string") {
          const data = await getActiveTransactions(); // Assuming this fetches PENDING transactions
          // Convert date strings to Date objects
          const processedData = data.map((tx) => ({
            ...tx,
            createdAt: new Date(tx.createdAt),
            bookedFor: new Date(tx.bookedFor),
          }));
          setFetchedTransactions(processedData);
          console.log("Fetched Transactions:", processedData);
        } else {
          console.error("Cannot fetch transactions: Account ID is invalid.");
          setFetchedTransactions(null); // Clear data if ID is bad
        }
      } catch (error) {
        console.error("Error fetching transactions:", error);
        alert("Failed to fetch transactions.");
      } finally {
        setLoading(false);
      }
    }

    fetchTransactions();
  }, [accountId]); // Re-fetch if accountId changes

  // --- UI Event Handlers ---

  function handleSelectTransaction(transaction: TransactionProps) {
    setSelectedTransaction(transaction);
    console.log("Selected Transaction:", transaction);
  }

  function handleCloseDetails() {
    setSelectedTransaction(null);
  }

  // --- Check/Uncheck Handler ---
  function handleServiceCheckToggle(
    availedService: AvailedServicesProps,
    isChecked: boolean, // The desired state from the checkbox click
  ) {
    if (!socket || !selectedTransaction || typeof accountId !== "string")
      return;

    const { id: availedServiceId, transactionId } = availedService;

    // Prevent action if already processing
    if (processingServices.has(availedServiceId)) return;

    setProcessingServices((prev) => new Set(prev).add(availedServiceId));

    if (isChecked) {
      // Trying to check the box
      if (
        availedService.checkedById &&
        availedService.checkedById !== accountId
      ) {
        alert(
          `Already checked by ${availedService.checkedBy?.name ?? "another user"}.`,
        );
        setProcessingServices((prev) => {
          const newSet = new Set(prev);
          newSet.delete(availedServiceId);
          return newSet;
        });
        return; // Prevent emitting
      }
      if (availedService.checkedById === accountId) {
        console.log("Already checked by you."); // No need to emit again
        setProcessingServices((prev) => {
          const newSet = new Set(prev);
          newSet.delete(availedServiceId);
          return newSet;
        });
        return;
      }

      console.log(`Emitting checkService for ${availedServiceId}`);
      socket.emit("checkService", {
        // CORRECT EVENT NAME
        availedServiceId,
        transactionId,
        accountId: accountId,
      });
    } else {
      // Trying to uncheck the box
      if (availedService.checkedById !== accountId) {
        console.log("Cannot uncheck, not checked by you.");
        // User might be clicking rapidly, or state is slightly out of sync.
        // Don't emit if they aren't the checker.
        setProcessingServices((prev) => {
          const newSet = new Set(prev);
          newSet.delete(availedServiceId);
          return newSet;
        });
        return;
      }
      console.log(`Emitting uncheckService for ${availedServiceId}`);
      socket.emit("uncheckService", {
        // CORRECT EVENT NAME
        availedServiceId,
        transactionId,
        accountId: accountId,
      });
    }
  }

  // --- Mark/Unmark Served Handlers ---
  function handleMarkServed(availedService: AvailedServicesProps) {
    if (!socket || !selectedTransaction || typeof accountId !== "string")
      return;
    const { id: availedServiceId, transactionId } = availedService;

    if (processingServices.has(availedServiceId)) return;
    if (availedService.servedById === accountId) {
      console.log("Already marked as served by you.");
      return; // Idempotent or prevent unnecessary emits
    }
    // Optional: Check if it's already served by someone else?
    // if (availedService.servedById && availedService.servedById !== accountId) {
    //     alert(`Already marked served by ${availedService.servedBy?.name ?? 'another user'}. Cannot change.`);
    //     return;
    // }

    setProcessingServices((prev) => new Set(prev).add(availedServiceId));
    console.log(`Emitting markServiceServed for ${availedServiceId}`);
    socket.emit("markServiceServed", {
      // CORRECT EVENT NAME
      availedServiceId,
      transactionId,
      accountId: accountId, // The user taking the action is the server
    });
  }

  function handleUnmarkServed(availedService: AvailedServicesProps) {
    if (!socket || !selectedTransaction || typeof accountId !== "string")
      return;
    const { id: availedServiceId, transactionId } = availedService;

    if (processingServices.has(availedServiceId)) return;

    // IMPORTANT: Only allow unmarking if served *by the current user*
    if (availedService.servedById !== accountId) {
      alert("You cannot unmark a service you didn't mark as served.");
      return;
    }

    setProcessingServices((prev) => new Set(prev).add(availedServiceId));
    console.log(`Emitting unmarkServiceServed for ${availedServiceId}`);
    socket.emit("unmarkServiceServed", {
      // CORRECT EVENT NAME
      availedServiceId,
      transactionId,
      accountId: accountId, // User performing the action
    });
  }

  // --- Checkbox Disabled Logic ---
  function isCheckboxDisabled(service: AvailedServicesProps): boolean {
    // Disable if it's currently being processed
    if (processingServices.has(service.id)) return true;
    // Disable if it's checked by *someone else*
    if (service.checkedById && service.checkedById !== accountId) return true;
    // Disable if it's already marked as served (optional, maybe allow unchecking even if served?)
    // if (service.servedById) return true;
    return false;
  }

  // --- Mark Served Button Disabled Logic ---
  function isMarkServedDisabled(service: AvailedServicesProps): boolean {
    // Disable if processing
    if (processingServices.has(service.id)) return true;
    // Disable if already served by the current user (or anyone, depending on rules)
    if (service.servedById === accountId) return true;
    // Maybe disable if not checked by the current user? Depends on workflow.
    // if (service.checkedById !== accountId) return true;
    return false;
  }

  // --- Unmark Served Button Disabled Logic ---
  function isUnmarkServedDisabled(service: AvailedServicesProps): boolean {
    // Disable if processing
    if (processingServices.has(service.id)) return true;
    // Disable if *not* served by the current user
    if (service.servedById !== accountId) return true;
    return false;
  }

  // --- Render Logic ---

  if (loading) {
    return (
      <DialogBackground>
        <DialogForm>
          <DialogTitle>Loading...</DialogTitle>
        </DialogForm>
      </DialogBackground>
    );
  }

  return (
    <DialogBackground>
      <DialogForm>
        <DialogTitle>Work List</DialogTitle>
        <div className="mx-auto mt-4 h-[500px] min-w-[330px] rounded-md border-2 border-customDarkPink md:w-[95%]">
          {selectedTransaction && (
            <ChevronLeft
              onClick={handleCloseDetails}
              className="absolute left-4 top-4 cursor-pointer"
            />
          )}

          {selectedTransaction ? (
            <>
              <div className="sticky top-0 z-10 mb-2 border-b-2 border-customDarkPink p-2">
                {" "}
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">
                    {selectedTransaction.customer.name}
                  </h2>
                </div>
                <div className="text-sm">
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
                    <span
                      className={`font-medium ${selectedTransaction.status === "PENDING" ? "text-orange-500" : "text-green-500"}`}
                    >
                      {selectedTransaction.status}
                    </span>
                  </p>
                </div>
              </div>

              <div className="h-[calc(100%-100px)] overflow-y-auto px-2 pb-2">
                {selectedTransaction.availedServices.length === 0 ? (
                  <p className="mt-4 text-center italic text-gray-500">
                    No services availed for this transaction.
                  </p>
                ) : (
                  selectedTransaction.availedServices.map((service) => (
                    <div
                      key={service.id}
                      className={`my-2 flex flex-col rounded-md p-2 shadow-custom transition-colors duration-200 ${
                        processingServices.has(service.id)
                          ? "animate-pulse bg-gray-300 dark:bg-gray-600"
                          : service.servedById
                            ? "bg-green-100 dark:bg-green-900"
                            : service.checkedById === accountId
                              ? "bg-blue-100 dark:bg-blue-900"
                              : service.checkedById
                                ? "bg-yellow-100 dark:bg-yellow-900"
                                : "bg-customDarkPink dark:bg-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!service.checkedById}
                            onChange={(e) =>
                              handleServiceCheckToggle(
                                service,
                                e.target.checked,
                              )
                            }
                            className="size-5 accent-customDarkPink disabled:opacity-50"
                            id={`check-${service.id}`}
                            disabled={isCheckboxDisabled(service)}
                            aria-label={`Check service ${service.service.title}`}
                          />
                          <label
                            htmlFor={`check-${service.id}`}
                            className="text-lg font-medium"
                          >
                            {service.service.title}{" "}
                            {service.quantity > 1
                              ? `(x${service.quantity})`
                              : ""}
                          </label>
                        </div>
                        <span className="text-sm font-semibold">
                          ${service.price / 100}{" "}
                          {/* Assuming price is in cents */}
                        </span>
                      </div>

                      {/* Status Indicators */}
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-7 text-xs">
                        {" "}
                        {/* Indent status */}
                        <span>
                          Checked by:{" "}
                          <span className="font-medium">
                            {service.checkedBy?.name ?? "Nobody"}
                          </span>
                        </span>
                        <span className="text-right">
                          Served by:{" "}
                          <span
                            className={`font-medium ${service.servedById ? "text-green-700 dark:text-green-300" : "text-gray-500"}`}
                          >
                            {service.servedBy?.name ?? "Not Served"}
                          </span>
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-2 flex justify-end gap-2 pl-7">
                        {!service.servedById ? (
                          <Button
                            onClick={() => handleMarkServed(service)}
                            disabled={isMarkServedDisabled(service)}
                            // The title attribute is standard HTML and should pass through
                            title={
                              isMarkServedDisabled(service)
                                ? processingServices.has(service.id)
                                  ? "Processing..."
                                  : "Already served or cannot mark now"
                                : "Mark as Served"
                            }
                            // Default style (invert=false) will be used
                          >
                            Mark Served
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleUnmarkServed(service)}
                            disabled={isUnmarkServedDisabled(service)}
                            // The title attribute is standard HTML and should pass through
                            title={
                              isUnmarkServedDisabled(service)
                                ? processingServices.has(service.id)
                                  ? "Processing..."
                                  : "Cannot unmark (not served by you)"
                                : "Unmark as Served"
                            }
                            // Default style (invert=false) will be used, perhaps use invert={true}?
                            // Or modify Button component later if specific warning style needed
                            invert={true} // Using invert to make it visually distinct from "Mark Served"
                          >
                            Unmark Served
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            // --- Transaction List View ---
            <table className="w-full table-fixed">
              <thead className="sticky top-0">
                <tr className="border-b-2 border-customDarkPink">
                  <th className="w-1/4 px-1 py-2 text-left text-sm font-semibold">
                    Date
                  </th>
                  <th className="w-1/2 px-1 py-2 text-left text-sm font-semibold">
                    Customer
                  </th>
                  <th className="w-1/4 px-1 py-2 text-left text-sm font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {fetchedTransactions && fetchedTransactions.length > 0 ? (
                  fetchedTransactions.map((transaction) => (
                    <tr
                      className="cursor-pointer border-b border-customDarkPink/50 hover:bg-customDarkPink/10 dark:hover:bg-gray-700/50"
                      key={transaction.id}
                      onClick={() => handleSelectTransaction(transaction)}
                      tabIndex={0} // Make it focusable
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        handleSelectTransaction(transaction)
                      } // Allow keyboard navigation
                    >
                      <td className="px-1 py-2 text-sm">
                        {transaction.bookedFor.toLocaleDateString()}
                      </td>
                      <td className="max-w-[150px] truncate whitespace-nowrap px-1 py-2 text-sm">
                        {transaction.customer.name}
                      </td>
                      <td
                        className={`px-1 py-2 text-sm font-medium lowercase ${
                          transaction.status === "PENDING"
                            ? "text-orange-500"
                            : transaction.status === "DONE"
                              ? "text-green-500"
                              : "text-red-500" // CANCELLED
                        }`}
                      >
                        {transaction.status.toLowerCase()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-4 text-center italic text-gray-500"
                    >
                      {loading
                        ? "Loading..."
                        : "No pending transactions found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {/* Keep Done button or remove if not needed */}
        {/* <div className="mt-4 flex justify-around">
             <Button onClick={() => router.back()}>Close</Button>
           </div> */}
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
