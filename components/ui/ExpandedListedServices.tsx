"use client";

import React, { useEffect, useCallback } from "react";
import Button from "../Buttons/Button"; // Adjust path
import { Socket } from "socket.io-client";
import { AvailedServicesProps } from "@/lib/Types"; // Adjust path
import {
  CheckCircle,
  Circle,
  UserCheck,
  Loader2,
  Tag,
  Info,
  RefreshCcw, // Added RefreshCcw
} from "lucide-react";

interface ExpandedListedServicesProps {
  services: AvailedServicesProps[];
  accountId: string;
  socket: Socket | null;
  onClose: () => void;
  processingServeActions: Set<string>;
  setProcessingServeActions: React.Dispatch<React.SetStateAction<Set<string>>>;
  onRefresh: () => void; // Added onRefresh prop
  isLoading: boolean; // Added isLoading prop (for the refresh button)
}

export default function ExpandedListedServices({
  services,
  accountId,
  socket,
  onClose,
  processingServeActions,
  setProcessingServeActions,
  onRefresh, // Destructure onRefresh
  isLoading, // Destructure isLoading
}: ExpandedListedServicesProps) {
  useEffect(() => {
    if (!socket) {
      console.warn(
        "ExpandedListedServices: Socket is null, listeners not attached.",
      );
      return;
    }
    console.log("ExpandedListedServices: Attaching listeners.");

    const handleUpdate = (updatedService: AvailedServicesProps) => {
      const isRelevant = services.some((s) => s.id === updatedService.id);
      if (isRelevant) {
        console.log(
          "ExpandedListedServices: Relevant update received for service:",
          updatedService.id,
          " Status:",
          updatedService.status,
        );
        setProcessingServeActions((prev) => {
          if (!prev.has(updatedService.id)) return prev;
          console.log(
            `ExpandedListedServices: Clearing processing state for ${updatedService.id} due to update.`,
          );
          const next = new Set(prev);
          next.delete(updatedService.id);
          return next;
        });
      }
    };

    const handleError = (error: {
      availedServiceId?: string;
      message?: string;
    }) => {
      if (!error?.availedServiceId) return;
      const isRelevant = services.some((s) => s.id === error.availedServiceId);
      if (isRelevant) {
        console.error(
          "ExpandedListedServices: Serve/Unserve Error Received:",
          error,
        );
        setProcessingServeActions((prev) => {
          if (!prev.has(error.availedServiceId!)) return prev;
          console.log(
            `ExpandedListedServices: Clearing processing state for ${error.availedServiceId} due to error.`,
          );
          const next = new Set(prev);
          next.delete(error.availedServiceId!);
          return next;
        });
      }
    };

    socket.on("availedServiceUpdated", handleUpdate);
    socket.on("serviceMarkServedError", handleError);
    socket.on("serviceUnmarkServedError", handleError);

    return () => {
      console.log("ExpandedListedServices: Removing listeners.");
      socket.off("availedServiceUpdated", handleUpdate);
      socket.off("serviceMarkServedError", handleError);
      socket.off("serviceUnmarkServedError", handleError);
    };
  }, [socket, setProcessingServeActions, services]);

  const handleMarkServed = useCallback(
    (availedService: AvailedServicesProps) => {
      if (
        !socket ||
        !accountId ||
        processingServeActions.has(availedService.id) ||
        availedService.servedById
      ) {
        console.warn("Mark Served prevented:", {
          processing: processingServeActions.has(availedService.id),
          served: !!availedService.servedById,
        });
        return;
      }
      setProcessingServeActions((prev) => new Set(prev).add(availedService.id));
      console.log(
        `ExpandedListedServices: Emitting markServiceServed for ${availedService.id}`,
      );
      socket.emit("markServiceServed", {
        availedServiceId: availedService.id,
        transactionId: availedService.transactionId,
        accountId: accountId,
      });
    },
    [socket, accountId, processingServeActions, setProcessingServeActions],
  );

  const handleUnmarkServed = useCallback(
    (availedService: AvailedServicesProps) => {
      if (
        !socket ||
        !accountId ||
        processingServeActions.has(availedService.id) ||
        availedService.servedById !== accountId
      ) {
        if (
          availedService.servedById !== accountId &&
          availedService.servedById
        ) {
          alert("Cannot unmark: Service was marked served by someone else.");
        } else if (!availedService.servedById) {
          alert("Cannot unmark: Service is not marked as served.");
        }
        console.warn("Unmark Served prevented:", {
          processing: processingServeActions.has(availedService.id),
          servedById: availedService.servedById,
          accountId,
        });
        return;
      }
      setProcessingServeActions((prev) => new Set(prev).add(availedService.id));
      console.log(
        `ExpandedListedServices: Emitting unmarkServiceServed for ${availedService.id}`,
      );
      socket.emit("unmarkServiceServed", {
        availedServiceId: availedService.id,
        transactionId: availedService.transactionId,
        accountId: accountId,
      });
    },
    [socket, accountId, processingServeActions, setProcessingServeActions],
  );

  const formatCurrency = (value: number | null | undefined): string => {
    if (
      value == null ||
      typeof value !== "number" ||
      isNaN(value) ||
      !isFinite(value)
    )
      value = 0;
    return value.toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-grow space-y-3 overflow-y-auto border-y border-gray-200 bg-gray-50 px-4 py-4 md:max-h-[calc(75vh-80px)]">
        {services.length > 0 ? (
          services.map((service) => {
            const isProcessing = processingServeActions.has(service.id);
            const isServed = !!service.servedById;
            const servedByMe = isServed && service.servedById === accountId;
            const servedByOther = isServed && !servedByMe;

            const canMark = !isServed;
            const canUnmark = servedByMe;

            const markDisabled = isProcessing || isServed;
            const unmarkDisabled = isProcessing || !servedByMe;

            return (
              <div
                key={service.id}
                className={`relative flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm transition-opacity duration-150 sm:flex-row sm:items-center sm:justify-between ${isProcessing ? "animate-pulse opacity-60" : ""} ${servedByMe ? "border-green-300 bg-green-50" : "border-gray-200"} ${servedByOther ? "border-yellow-300 bg-yellow-50 opacity-80" : ""}`}
              >
                <div className="flex-grow space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5 text-base font-semibold text-gray-800">
                      <Tag size={16} className="text-blue-600" />
                      {service.service?.title ?? "Unknown"}
                      {service.quantity > 1 ? ` (x${service.quantity})` : ""}
                    </span>
                    <span
                      className={`whitespace-nowrap text-sm font-semibold ${isServed ? "text-green-700" : "text-gray-700"}`}
                    >
                      {formatCurrency(service.price)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <UserCheck size={14} className="text-gray-400" />
                      Checked by:
                      <span className="ml-1 font-medium text-gray-700">
                        {service.checkedBy?.name ?? "N/A"}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      {isServed ? (
                        <CheckCircle
                          size={14}
                          className={
                            servedByMe ? "text-green-600" : "text-yellow-600"
                          }
                        />
                      ) : (
                        <Circle size={14} className="text-gray-400" />
                      )}
                      Served by:
                      <span
                        className={`ml-1 font-medium ${isServed ? (servedByMe ? "text-green-700" : "text-yellow-700") : "text-gray-700"}`}
                      >
                        {isServed
                          ? (service.servedBy?.name ?? "Unknown")
                          : "Not Served"}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-stretch gap-2 pt-2 sm:ml-4 sm:w-auto sm:items-end sm:pt-0">
                  {canMark && (
                    <Button
                      size="sm"
                      onClick={() => handleMarkServed(service)}
                      disabled={markDisabled}
                      className="min-w-[120px] justify-center px-3"
                      title="Mark as served"
                    >
                      {isProcessing ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        "Mark Served"
                      )}
                    </Button>
                  )}
                  {canUnmark && (
                    <Button
                      size="sm"
                      invert
                      onClick={() => handleUnmarkServed(service)}
                      disabled={unmarkDisabled}
                      className="min-w-[120px] justify-center px-3"
                      title="Unmark as served"
                    >
                      {isProcessing ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        "Unmark Served"
                      )}
                    </Button>
                  )}
                  {servedByOther && (
                    <div
                      className="flex items-center justify-center gap-1 rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800 sm:min-w-[120px]"
                      title={`Served by ${service.servedBy?.name}`}
                    >
                      <Info size={14} /> Served by other
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-10 text-center">
            <Tag size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="italic text-gray-500">No claimed services.</p>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-gray-100 px-4 py-3">
        <Button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          size="sm"
          className="flex items-center gap-1.5"
          aria-label="Refresh claimed services list"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCcw size={16} />
          )}
          Refresh
        </Button>
        <Button type="button" onClick={onClose} invert size="sm">
          Close
        </Button>
      </div>
    </div>
  );
}
