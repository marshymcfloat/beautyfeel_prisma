"use client";

import React, { useState, useEffect, useCallback } from "react";
import Button from "../Buttons/Button"; // Adjust path
import { Socket } from "socket.io-client"; // Import Socket type

// --- Use the SAME Type Definitions as WorkInterceptedModal ---
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

type ExpandedListedServicesProps = {
  services: AvailedServicesProps[]; // Expects services CHECKED BY the current user
  accountId: string; // ID of the logged-in user
  socket: Socket | null; // Socket instance for emitting events
  onClose: () => void; // Function to close the container (e.g., a dialog)
  // Pass down processing state management from parent if needed globally
  // Or manage processing state locally if this component is self-contained enough
  processingServeActions: Set<string>;
  setProcessingServeActions: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export default function ExpandedListedServices({
  services,
  accountId,
  socket,
  onClose,
  processingServeActions, // Receive from parent
  setProcessingServeActions, // Receive from parent
}: ExpandedListedServicesProps) {
  // --- Listen for External Updates/Errors (Optional but Recommended) ---
  // This ensures the UI stays consistent if, for example, a service gets
  // automatically unmarked due to some external logic or if an error occurs
  // on the server during mark/unmark.
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (updatedService: AvailedServicesProps) => {
      // Check if the update concerns one of the services listed here
      if (services.some((s) => s.id === updatedService.id)) {
        console.log(
          "External update received for listed service:",
          updatedService.id,
        );
        // Stop processing indicator if it matches
        setProcessingServeActions((prev) => {
          const next = new Set(prev);
          next.delete(updatedService.id);
          return next;
        });
        // NOTE: The parent component should handle updating the 'services' prop
        // based on the main socket listener. This useEffect is primarily
        // for stopping the local processing indicator.
      }
    };

    const handleError = (error: {
      availedServiceId: string;
      message: string;
    }) => {
      // Check if the error concerns one of the services listed here
      if (services.some((s) => s.id === error.availedServiceId)) {
        console.error("Serve/Unserve Error:", error);
        alert(
          `Error for service item ${error.availedServiceId}: ${error.message}`,
        );
        // Stop processing indicator on error
        setProcessingServeActions((prev) => {
          const next = new Set(prev);
          next.delete(error.availedServiceId);
          return next;
        });
      }
    };

    socket.on("availedServiceUpdated", handleUpdate);
    socket.on("serviceMarkServedError", handleError);
    socket.on("serviceUnmarkServedError", handleError);

    return () => {
      socket.off("availedServiceUpdated", handleUpdate);
      socket.off("serviceMarkServedError", handleError);
      socket.off("serviceUnmarkServedError", handleError);
    };
    // Add 'services' to dependency array if you need to re-evaluate checks inside listeners
  }, [socket, setProcessingServeActions, services]);

  // --- Mark/Unmark Served Handlers ---
  function handleMarkServed(availedService: AvailedServicesProps) {
    if (!socket || !accountId) return;
    const { id: availedServiceId, transactionId } = availedService;

    if (processingServeActions.has(availedServiceId)) return; // Already processing this item

    // Basic check: Don't emit if already served by self (UI should disable button)
    if (availedService.servedById === accountId) {
      console.log("Already marked served by you.");
      return;
    }

    setProcessingServeActions((prev) => new Set(prev).add(availedServiceId));
    console.log(`Emitting markServiceServed for ${availedServiceId}`);
    socket.emit("markServiceServed", {
      availedServiceId,
      transactionId,
      accountId: accountId, // The user taking the action is the server
    });
  }

  function handleUnmarkServed(availedService: AvailedServicesProps) {
    if (!socket || !accountId) return;
    const { id: availedServiceId, transactionId } = availedService;

    if (processingServeActions.has(availedServiceId)) return; // Already processing

    // IMPORTANT: Only allow unmarking if served *by the current user* (Backend enforces too)
    if (availedService.servedById !== accountId) {
      alert("You cannot unmark a service you didn't mark as served.");
      // Optional: Remove processing state if added prematurely, though UI disable should prevent this
      // setProcessingServeActions(prev => { const next = new Set(prev); next.delete(availedServiceId); return next; });
      return;
    }

    setProcessingServeActions((prev) => new Set(prev).add(availedServiceId));
    console.log(`Emitting unmarkServiceServed for ${availedServiceId}`);
    socket.emit("unmarkServiceServed", {
      availedServiceId,
      transactionId,
      accountId: accountId, // User performing the action
    });
  }

  // --- Mark Served Button Disabled Logic ---
  function isMarkServedDisabled(service: AvailedServicesProps): boolean {
    if (processingServeActions.has(service.id)) return true; // Processing this action
    if (service.servedById === accountId) return true; // Already served by self
    // Optional: Prevent marking if served by *anyone*?
    // if (service.servedById) return true;
    return false;
  }

  // --- Unmark Served Button Disabled Logic ---
  function isUnmarkServedDisabled(service: AvailedServicesProps): boolean {
    if (processingServeActions.has(service.id)) return true; // Processing this action
    if (service.servedById !== accountId) return true; // Not served by self
    return false;
  }

  // --- Determine Background Color ---
  function getServiceBackgroundColor(service: AvailedServicesProps): string {
    if (processingServeActions.has(service.id)) {
      return "animate-pulse bg-gray-300 dark:bg-gray-600"; // Processing serve/unserve
    }
    if (service.servedById) {
      // Could use a different green or just the standard 'served' green
      return "bg-green-100 dark:bg-green-900"; // Served
    }
    // Since all services here are checked by the user, default is the 'checked by me' color
    return "bg-blue-100 dark:bg-blue-900";
  }

  return (
    <>
      {/* List of user's checked services */}
      {/* Adjusted max-height for dialog context */}
      <div className="mb-4 max-h-[60vh] space-y-3 overflow-y-auto border-y border-gray-200 py-3 pr-1 md:max-h-[70vh]">
        {services.length > 0 ? (
          services.map((service) => (
            <div
              key={service.id}
              className={`my-2 flex flex-col rounded-md p-3 shadow-custom transition-colors duration-200 ${getServiceBackgroundColor(service)}`}
            >
              {/* Service Info */}
              <div className="flex items-center justify-between">
                <span className="text-lg font-medium">
                  {service.service.title}{" "}
                  {service.quantity > 1 ? `(x${service.quantity})` : ""}
                </span>
                <span className="text-sm font-semibold">
                  ${(service.price / 100).toFixed(2)}
                </span>
              </div>
              {/* Customer Info (If available and needed) */}
              {/* You might need to adjust data structure or pass customer info if required here */}
              {/* <div className="text-xs text-gray-600 dark:text-gray-400">
                 Customer: {service.transaction?.customer?.name ?? 'N/A'}
              </div> */}

              {/* Status Indicators */}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                <span>
                  {/* Checked by will always be the current user here */}
                  Checked by: <span className="font-medium">You</span>
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
              <div className="mt-3 flex justify-end gap-2">
                {!service.servedById || service.servedById !== accountId ? ( // Show Mark Served if not served by current user
                  <Button
                    onClick={() => handleMarkServed(service)}
                    disabled={isMarkServedDisabled(service)}
                    title={
                      isMarkServedDisabled(service)
                        ? processingServeActions.has(service.id)
                          ? "Processing..."
                          : "Already served or cannot mark now"
                        : "Mark as Served"
                    }
                  >
                    Mark Served
                  </Button>
                ) : (
                  // Show Unmark Served if served by current user
                  <Button
                    invert={true} // Make it visually distinct
                    onClick={() => handleUnmarkServed(service)}
                    disabled={isUnmarkServedDisabled(service)}
                    title={
                      isUnmarkServedDisabled(service)
                        ? processingServeActions.has(service.id)
                          ? "Processing..."
                          : "Cannot unmark (not served by you)"
                        : "Unmark as Served"
                    }
                  >
                    Unmark Served
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="py-4 text-center italic text-gray-500">
            You haven't checked any services yet.
          </p>
        )}
      </div>

      {/* Close button */}
      <div className="flex justify-end border-t border-gray-200 pt-4">
        <Button
          type="button"
          onClick={onClose}
          invert={true} // Use inverted style for close/cancel
        >
          Close
        </Button>
      </div>
    </>
  );
}
