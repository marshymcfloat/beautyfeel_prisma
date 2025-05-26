"use client";

import React, { useState, useEffect } from "react";
import { ListChecks, Eye, X, Loader2, AlertCircle } from "lucide-react";
import { getServedServicesTodayByUser } from "@/lib/ServerAction";
import { AvailedServicesProps } from "@/lib/Types";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";

interface UserServedTodayWidgetProps {
  loggedInUserId: string | undefined;
  className?: string; // Accept className prop
}

const formatCompletedAtToPHT = (
  date: Date | string | null | undefined,
): string => {
  if (!date) return "N/A";
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(dateObj);
  } catch (error) {
    console.error("Error formatting date to PHT:", error);
    return "Invalid Date";
  }
};

export default function UserServedTodayWidget({
  loggedInUserId,
  className, // Destructure className prop
}: UserServedTodayWidgetProps) {
  const [servedServices, setServedServices] = useState<AvailedServicesProps[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!loggedInUserId) {
      setIsLoading(false);
      setServedServices([]);
      return;
    }

    const fetchServices = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getServedServicesTodayByUser(loggedInUserId);
        setServedServices(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch served services for today:", err);
        setError("Could not load services.");
        setServedServices([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServices();
  }, [loggedInUserId]);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const servicesCount = servedServices.length;

  // If loggedInUserId is null/undefined and not loading, render nothing or a placeholder
  if (!loggedInUserId && !isLoading) return null;

  // Apply classes and merge className
  const widgetClasses = `
    flex aspect-[4/3] w-full flex-col items-center justify-center
    rounded-lg border border-customGray/30 bg-customOffWhite/70 p-3 text-center
    shadow-custom transition-all duration-150 ease-in-out
    sm:aspect-square sm:p-4 md:max-w-none
    ${servicesCount > 0 && !isLoading && !error ? "cursor-pointer hover:border-customGray/50 hover:shadow-md active:scale-95" : ""}
    ${isLoading ? "animate-pulse opacity-60 cursor-wait" : ""}
    ${className || ""} // Merge the passed className
  `;

  return (
    <>
      <div
        className={widgetClasses}
        onClick={
          servicesCount > 0 && !isLoading && !error ? openModal : undefined
        }
        role={servicesCount > 0 && !isLoading && !error ? "button" : undefined}
        tabIndex={servicesCount > 0 && !isLoading && !error ? 0 : undefined}
        onKeyDown={(e) => {
          if (
            servicesCount > 0 &&
            !isLoading &&
            !error &&
            (e.key === "Enter" || e.key === " ")
          ) {
            openModal();
          }
        }}
        title={
          isLoading
            ? "Loading services..."
            : error
              ? "Error loading services"
              : servicesCount > 0
                ? "Click to view details"
                : "No services served today"
        }
      >
        {isLoading ? (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-customBlack/70 sm:text-xs">
              LOADING
            </div>
            <Loader2 className="mb-1 h-7 w-7 animate-spin text-customDarkPink/80 sm:h-8 sm:w-8" />
            <div className="text-[10px] font-light text-gray-500 sm:text-xs">
              Please wait...
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full w-full flex-col items-center justify-center text-center text-red-500">
            <AlertCircle className="mb-1 h-7 w-7 sm:h-8 sm:w-8" />
            <p className="text-[11px] font-medium uppercase tracking-wide sm:text-xs">
              ERROR
            </p>
            <p className="mt-1 text-[10px] sm:text-xs">{error}</p>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-customDarkPink sm:text-xs">
              SERVICES
            </p>
            <p className="mb-1 text-4xl font-bold text-customBlack sm:text-4xl">
              {servicesCount}
            </p>
            <p className="text-[10px] font-light text-gray-500 sm:text-xs">
              Served Today
            </p>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={<DialogTitle>Services Served Today</DialogTitle>}
        size="md"
      >
        {isLoading && (
          <div className="flex justify-center p-4">
            <Loader2 className="h-8 w-8 animate-spin text-customDarkPink" />
          </div>
        )}
        {error && <p className="p-4 text-center text-red-500">{error}</p>}
        {!isLoading && !error && (
          <div className="p-1">
            {servedServices.length > 0 ? (
              <ul className="max-h-[60vh] divide-y divide-gray-200 overflow-y-auto">
                {servedServices.map((item) => (
                  <li key={item.id} className="p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-customBlack">
                        {item.service?.title || "Unknown Service"}
                      </span>
                      <span className="text-xs text-gray-500">
                        Qty: {item.quantity}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-gray-600">
                      Customer: {item.transaction?.customer?.name || "N/A"}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      Completed: {formatCompletedAtToPHT(item.completedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-center text-gray-500">
                No services recorded as served by you today.
              </p>
            )}
            <div className="mt-4 flex justify-end border-t border-gray-200 pt-3">
              <Button onClick={closeModal} invert>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
