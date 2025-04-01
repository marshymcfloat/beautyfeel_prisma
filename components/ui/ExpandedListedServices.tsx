// components/ui/ExpandedListedServices.tsx (or your path)
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Button from "../Buttons/Button"; // Adjust path
import { Socket } from "socket.io-client"; // Import Socket type
import { AvailedServicesProps } from "@/lib/Types";

// --- Component ---
export default function ExpandedListedServices({
  services,
  accountId,
  socket,
  onClose,
  processingServeActions,
  setProcessingServeActions,
}: {
  // Type annotation for props
  services: AvailedServicesProps[];
  accountId: string;
  socket: Socket | null;
  onClose: () => void;
  processingServeActions: Set<string>;
  setProcessingServeActions: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  // --- Listen for External Updates/Errors ---
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
    if (!socket || !accountId || processingServeActions.has(availedService.id))
      return;
    // Basic check: Don't emit if already served by self (UI should disable button)
    if (availedService.servedById === accountId) {
      console.log("Already marked served by you.");
      return;
    }

    setProcessingServeActions((prev) => new Set(prev).add(availedService.id));
    console.log(`Emitting markServiceServed for ${availedService.id}`);
    socket.emit("markServiceServed", {
      availedServiceId: availedService.id,
      transactionId: availedService.transactionId,
      accountId: accountId, // The user taking the action is the server
    });
  }

  function handleUnmarkServed(availedService: AvailedServicesProps) {
    if (!socket || !accountId || processingServeActions.has(availedService.id))
      return;
    // IMPORTANT: Only allow unmarking if served *by the current user* (Backend enforces too)
    if (availedService.servedById !== accountId) {
      alert("You cannot unmark a service you didn't mark as served.");
      return;
    }

    setProcessingServeActions((prev) => new Set(prev).add(availedService.id));
    console.log(`Emitting unmarkServiceServed for ${availedService.id}`);
    socket.emit("unmarkServiceServed", {
      availedServiceId: availedService.id,
      transactionId: availedService.transactionId,
      accountId: accountId, // User performing the action
    });
  }

  // --- Button Disabled Logic ---
  function isMarkServedDisabled(service: AvailedServicesProps): boolean {
    if (processingServeActions.has(service.id)) return true; // Processing this action
    // Allow marking even if served by someone else? Let backend handle conflicts if needed.
    // if (service.servedById && service.servedById !== accountId) return true;
    // Prevent re-marking if already served by self
    if (service.servedById === accountId) return true;
    return false;
  }

  function isUnmarkServedDisabled(service: AvailedServicesProps): boolean {
    if (processingServeActions.has(service.id)) return true; // Processing this action
    if (service.servedById !== accountId) return true; // Not served by self
    return false;
  }

  // --- Determine Background and Text Colors (Updated) ---
  function getServiceItemStyles(service: AvailedServicesProps): {
    bg: string;
    text: string;
    statusText: string;
  } {
    const baseText = "text-customOffWhite";
    const baseStatusText = "text-customOffWhite/80";

    if (processingServeActions.has(service.id)) {
      // Processing: Gray background, black text
      return {
        bg: "animate-pulse bg-customGray",
        text: "text-customBlack",
        statusText: "text-customBlack/70",
      };
    }
    if (service.servedById) {
      // Served: Green background, white text (using a standard green)
      return { bg: "bg-green-600", text: baseText, statusText: baseStatusText };
    }
    // Default (Checked by You, Not Served): Dark Blue Placeholder
    // **RECOMMENDATION:** Add 'customDarkBlue: "#your_blue_hex"' to tailwind.config.js
    // Using fallback:
    return { bg: "bg-blue-800", text: baseText, statusText: baseStatusText };
  }

  return (
    <>
      {/* List Container - Adjusted styles */}
      <div className="mb-4 max-h-[60vh] space-y-3 overflow-y-auto border-y border-customGray bg-customWhiteBlue px-3 py-4 md:max-h-[70vh]">
        {services.length > 0 ? (
          services.map((service) => {
            // Get styles based on state
            const itemStyles = getServiceItemStyles(service);

            return (
              <div
                key={service.id}
                // Apply dynamic background, relative positioning for button
                className={`relative flex min-h-[80px] items-center rounded-lg p-3 shadow-custom transition-colors duration-200 ${itemStyles.bg}`}
              >
                {/* Left side content area - Adjusted padding-right */}
                <div className={`flex-grow pr-24 md:pr-28 ${itemStyles.text}`}>
                  {/* Service Info */}
                  <div className="flex items-start justify-between">
                    <span
                      className={`text-base font-semibold ${itemStyles.text}`}
                    >
                      {service.service.title}{" "}
                      {service.quantity > 1 ? `(x${service.quantity})` : ""}
                    </span>
                    <span
                      className={`text-sm font-semibold ${itemStyles.text} pl-2`}
                    >
                      &#8369;{service.price.toFixed(2)}
                    </span>
                  </div>

                  {/* Status Indicators */}
                  <div
                    className={`mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs ${itemStyles.statusText}`}
                  >
                    <span>
                      Checked by: <span className="font-medium">You</span>
                    </span>
                    <span className="text-right">
                      Served by:{" "}
                      <span
                        // Use appropriate text color based on background
                        className={`font-medium ${
                          service.servedById
                            ? "text-green-200" // Lighter green on dark green bg
                            : itemStyles.text // Use the main text color for the card state
                        }`}
                      >
                        {service.servedBy?.name ?? "Not Served"}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Action Buttons Area (Absolutely Positioned) */}
                <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-end">
                  {/* Conditionally render Mark or Unmark Button */}
                  {!service.servedById || service.servedById !== accountId ? (
                    <Button // Use Default Style (Solid Pink)
                      size="sm" // Assuming Button component accepts size
                      onClick={() => handleMarkServed(service)}
                      disabled={isMarkServedDisabled(service)}
                      // Add specific width/padding tweaks if needed via className
                      className="min-w-[90px] px-2 md:min-w-[100px] md:px-3"
                      title={
                        isMarkServedDisabled(service)
                          ? processingServeActions.has(service.id)
                            ? "Processing..."
                            : "Cannot mark now" // Simplified message
                          : "Mark as Served"
                      }
                    >
                      Mark Served
                    </Button>
                  ) : (
                    <Button // Use Inverted Style (Outline)
                      size="sm"
                      invert={true} // Use the invert prop
                      onClick={() => handleUnmarkServed(service)}
                      disabled={isUnmarkServedDisabled(service)}
                      // Add specific width/padding tweaks if needed via className
                      className="min-w-[90px] px-2 md:min-w-[100px] md:px-3"
                      // Adjust invert focus color if needed in Button.jsx (e.g., focus:ring-customOffWhite)
                      title={
                        isUnmarkServedDisabled(service)
                          ? processingServeActions.has(service.id)
                            ? "Processing..."
                            : "Cannot unmark" // Simplified message
                          : "Unmark as Served"
                      }
                    >
                      Unmark Served
                    </Button>
                  )}
                </div>
              </div> // End Service Item Card
            ); // End return inside map
          }) // End map
        ) : (
          <p className="py-4 text-center italic text-customBlack/60">
            You haven't checked any services yet.
          </p>
        )}
      </div>

      {/* Close button - Use Inverted Style */}
      <div className="flex justify-end border-t border-customGray px-3 pt-4">
        <Button
          type="button"
          onClick={onClose}
          invert={true} // Use inverted style for close
        >
          Close
        </Button>
      </div>
    </>
  );
}
