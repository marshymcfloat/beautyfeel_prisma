"use client";

import React, { useState, useEffect } from "react";
import { ListChecks, Eye, X, Loader2 } from "lucide-react";
import { getServedServicesTodayByUser } from "@/lib/ServerAction";
import { AvailedServicesProps } from "@/lib/Types";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "@/components/Buttons/Button";

interface UserServedTodayWidgetProps {
  loggedInUserId: string | undefined;
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

  if (!loggedInUserId && isLoading) {
    return (
      <div className="mx-auto flex aspect-square w-full max-w-xs flex-col items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 shadow-custom sm:mx-0 sm:max-w-sm lg:size-44">
        <Loader2 className="h-8 w-8 animate-spin text-customGray" />
        <p className="mt-2 text-sm text-customGray">Waiting for user...</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="mx-auto flex aspect-square w-full max-w-xs cursor-pointer flex-col items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 shadow-custom transition-all hover:shadow-lg sm:mx-0 sm:max-w-sm lg:size-44"
        onClick={
          servicesCount > 0 && !isLoading && !error ? openModal : undefined
        }
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openModal();
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
          <Loader2 className="h-12 w-12 animate-spin text-customDarkPink" />
        ) : error ? (
          <div className="text-center">
            <ListChecks className="mx-auto mb-1 h-8 w-8 text-red-500 sm:h-10 sm:w-10" />
            <p className="text-xs font-medium uppercase tracking-wide text-red-500 sm:text-sm md:text-base">
              ERROR
            </p>
            <p className="text-[10px] text-red-400 sm:text-xs">{error}</p>
          </div>
        ) : (
          <>
            <p className="mb-1 text-base font-medium uppercase tracking-wide text-customDarkPink sm:text-lg md:mb-1.5 md:text-xl lg:text-2xl">
              SERVICES
            </p>
            <p className="text-7xl font-bold text-customBlack sm:text-5xl md:text-6xl">
              {servicesCount}
            </p>
            <p className="mt-1 text-xs font-light text-gray-500 sm:text-sm">
              Served Today
            </p>
          </>
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
