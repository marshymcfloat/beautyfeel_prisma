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
  paymentMethod: string | null;
  availedServices: AvailedServicesProps[];
  grandTotal: number;
  status: "PENDING" | "DONE" | "CANCELLED";
};

// --- Component ---

export default function WorkInterceptedModal() {
  const { accountID: accountIdParam } = useParams(); // Renamed to avoid conflict
  const router = useRouter();
  const accountId = Array.isArray(accountIdParam)
    ? accountIdParam[0]
    : accountIdParam; // Ensure string

  const [fetchedTransactions, setFetchedTransactions] = useState<
    TransactionProps[] | null
  >(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [processingCheckActions, setProcessingCheckActions] = useState<
    Set<string>
  >(new Set());

  // --- Socket Connection ---
  useEffect(() => {
    if (typeof accountId !== "string" || !accountId) {
      console.error("WorkInterceptedModal: Account ID is missing or invalid.");
      // Decide action: maybe close modal or show error? router.back() might be too abrupt.
      // For now, just log and prevent connection.
      return;
    }

    // --- CORRECTED SECTION ---
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

    if (!backendUrl) {
      console.error(
        "WorkInterceptedModal: FATAL ERROR - NEXT_PUBLIC_BACKEND_URL environment variable is not set!",
      );
      alert(
        "Configuration Error: Cannot connect to realtime server. URL not found.",
      );
      return; // Stop if URL is missing
    }

    console.log(
      `WorkInterceptedModal: Connecting socket to backend at: ${backendUrl}`,
    );
    const newSocket = io(backendUrl); // Use the environment variable
    // --- END CORRECTED SECTION ---

    setSocket(newSocket);

    console.log("WorkInterceptedModal: Socket attempting connection...");
    newSocket.on("connect", () =>
      console.log("WorkInterceptedModal: Socket connected:", newSocket.id),
    );
    newSocket.on("disconnect", (reason) =>
      console.log("WorkInterceptedModal: Socket disconnected:", reason),
    );
    newSocket.on("connect_error", (err) => {
      console.error(
        "WorkInterceptedModal: Socket connection error:",
        err.message,
        err,
      );
      alert(
        `WorkInterceptedModal: Failed to connect to server: ${err.message}. Check console.`,
      );
    });

    // Cleanup
    return () => {
      if (newSocket) {
        console.log("WorkInterceptedModal: Socket disconnecting...");
        newSocket.disconnect();
      }
      setSocket(null);
    };
    // Only re-run if accountId changes (and router, though less likely to change)
  }, [accountId, router]);

  // --- Update State based on Socket Events ---
  const handleAvailedServiceUpdate = useCallback(
    (updatedAvailedService: AvailedServicesProps) => {
      console.log(
        "WorkInterceptedModal: Received availedServiceUpdated:",
        updatedAvailedService,
      );

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
      console.log(
        "WorkInterceptedModal: Received transactionCompleted:",
        completedTransaction,
      );
      alert(
        `Transaction ${completedTransaction.id} for ${completedTransaction.customer.name} is completed! This window might close or refresh.`,
      );
      setFetchedTransactions(
        (prev) => prev?.filter((t) => t.id !== completedTransaction.id) ?? null,
      );
      setSelectedTransaction((prev) =>
        prev?.id === completedTransaction.id ? null : prev,
      );
      // Optionally close the modal after completion?
      // router.back();
    },
    [
      /* router */
    ], // Add router if you use it inside
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
      console.error(
        "WorkInterceptedModal: Service Check/Uncheck Error:",
        error,
      );
      alert(
        `WorkInterceptedModal: Error for service item ${error.availedServiceId}: ${error.message}`,
      );
      setProcessingCheckActions((prev) => {
        const newSet = new Set(prev);
        newSet.delete(error.availedServiceId);
        return newSet;
      });
    };

    socket.on("serviceCheckError", handleCheckError);
    socket.on("serviceUncheckError", handleCheckError);
    // No listeners needed here for serve/unserve errors

    return () => {
      socket.off("availedServiceUpdated", handleAvailedServiceUpdate);
      socket.off("transactionCompleted", handleTransactionCompletion);
      socket.off("serviceCheckError", handleCheckError);
      socket.off("serviceUncheckError", handleCheckError);
    };
  }, [socket, handleAvailedServiceUpdate, handleTransactionCompletion]);

  // --- Fetch Initial Data ---
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
            // Ensure availed services have expected structure if needed immediately
            availedServices: tx.availedServices.map((as) => ({
              ...as,
              // Add defaults if structure might vary initially
              checkedBy: as.checkedBy || null,
              servedBy: as.servedBy || null,
            })),
          }));
          setFetchedTransactions(processedData);
        } else {
          console.error(
            "WorkInterceptedModal: Cannot fetch transactions: Account ID is invalid.",
          );
          setFetchedTransactions(null);
        }
      } catch (error) {
        console.error(
          "WorkInterceptedModal: Error fetching transactions:",
          error,
        );
        alert("WorkInterceptedModal: Failed to fetch transactions.");
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

  // --- Check/Uncheck Handler ---
  function handleServiceCheckToggle(
    availedService: AvailedServicesProps,
    isChecked: boolean, // The desired state from the checkbox click
  ) {
    if (!socket || typeof accountId !== "string") return;

    const { id: availedServiceId, transactionId } = availedService;

    // Prevent action if already processing this specific check/uncheck
    if (processingCheckActions.has(availedServiceId)) {
      console.log(
        `WorkInterceptedModal: Action for ${availedServiceId} already in progress.`,
      );
      return;
    }

    setProcessingCheckActions((prev) => new Set(prev).add(availedServiceId));

    if (isChecked) {
      console.log(
        `WorkInterceptedModal: Emitting checkService for ${availedServiceId}`,
      );
      socket.emit("checkService", {
        availedServiceId,
        transactionId,
        accountId: accountId,
      });
    } else {
      console.log(
        `WorkInterceptedModal: Emitting uncheckService for ${availedServiceId}`,
      );
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
    // Disable if served (prevents checking/unchecking after service done)
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
      <DialogBackground onClick={() => router.back()}>
        <DialogForm
          onClose={() => router.back()}
          titleComponent={<DialogTitle>Loading Work Queue...</DialogTitle>}
        >
          <div className="flex h-40 items-center justify-center">
            <p className="text-customBlack/70">Loading...</p>
          </div>
        </DialogForm>
      </DialogBackground>
    );
  }

  return (
    // Using onClick on DialogBackground to close is optional
    <DialogBackground onClick={() => router.back()}>
      <div className="" onClick={(e) => e.stopPropagation()}>
        <DialogForm
          // Prevent background click closing when clicking form
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
                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-xl font-light text-customBlack/50 hover:text-customBlack"
                aria-label="Close modal"
              >
                {" "}
                ×{" "}
              </button>{" "}
              {/* Close button */}
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
                              className={`peer relative mr-3 size-5 flex-shrink-0 appearance-none rounded border border-customGray bg-customOffWhite checked:border-customDarkPink checked:bg-customDarkPink focus:outline-none focus:ring-2 focus:ring-customDarkPink/50 focus:ring-offset-1 focus:ring-offset-customWhiteBlue disabled:opacity-50 ${isCheckboxDisabled(service) ? "cursor-not-allowed" : "cursor-pointer"} `}
                              id={`check-${service.id}`}
                              disabled={isCheckboxDisabled(service)}
                              aria-label={`Check service ${service.service.title}`}
                            />
                            {/* SVG Checkmark */}
                            <div className="pointer-events-none absolute left-[3px] top-[3px] hidden size-3.5 text-customOffWhite peer-checked:block peer-disabled:text-customGray/50">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                stroke="currentColor"
                                strokeWidth={1}
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
                            ₱{service.price}
                          </span>
                        </div>

                        {/* Bottom Row: Status Indicators */}
                        <div
                          className={`mt-1.5 flex justify-between pl-[calc(1.25rem+0.75rem)] text-xs ${service.checkedById || service.servedById ? "text-customOffWhite/70" : "text-customGray"}`}
                        >
                          <span>
                            Checked by:{" "}
                            <span
                              className={`font-medium ${service.checkedById ? "text-customOffWhite" : "text-customLightBlue"}`}
                            >
                              {service.checkedBy?.name ?? "Nobody"}
                            </span>
                          </span>
                          <span className="text-right">
                            Served by:{" "}
                            <span
                              className={`font-medium ${service.servedById ? "text-green-300" : service.checkedById ? "text-customOffWhite" : "text-customLightBlue"}`}
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
          {/* Optional Footer/Actions */}
          {/* <div className="mt-4 flex justify-end pt-3 border-t border-customGray">
          <Button onClick={() => router.back()} variant="secondary">Close</Button>
        </div> */}
        </DialogForm>
      </div>
    </DialogBackground>
  );
}
