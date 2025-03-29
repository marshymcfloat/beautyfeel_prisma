"use client";

import { ChevronDown } from "lucide-react";
import Spinner from "../ui/Spinner";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState } from "@/lib/reduxStore";
import { useEffect, useRef, useState } from "react";

type ServicesProps = {
  id: string;
  title: string;
  price: number;
  branchId: string;
};

export default function ServicesSelect({
  isLoading,
  data,
  error, // Add error prop
}: {
  isLoading: boolean;
  data: ServicesProps[] | null;
  error?: string; // Make error optional
}) {
  const dispatch = useDispatch();
  // Removed selectedService state as it wasn't directly used for display
  const [showServices, setShowServices] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null); // Reference for dropdown container

  const servicesAvailed = useSelector(
    (state: RootState) => state.cashier.servicesAvailed,
  );

  function handleShowingServices() {
    setShowServices((prev) => !prev);
  }

  function handleSelectingService(service: ServicesProps) {
    // Check if service already exists to avoid duplicates or implement quantity increase
    const existingService = servicesAvailed.find((s) => s.id === service.id);
    if (!existingService) {
      // Only add if not already selected
      dispatch(
        cashierActions.selectingService({
          id: service.id,
          title: service.title,
          price: service.price,
        }),
      );
    } else {
      // Optional: dispatch an action to increase quantity or show a message
      console.log("Service already selected");
    }
  }

  // Update total whenever `servicesAvailed` changes (keeping as is)
  useEffect(() => {
    const total = servicesAvailed.reduce(
      (sum, service) => sum + service.price * service.quantity,
      0,
    );
    dispatch(
      cashierActions.handlingTotals({ identifier: "grandTotal", value: total }),
    );
  }, [servicesAvailed, dispatch]);

  // Handle clicks outside dropdown (keeping as is)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowServices(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const hasError = !!error; // Boolean check

  return (
    // Use the ref on the main container div
    <div className="relative mx-auto mt-8 w-[90%]" ref={dropdownRef}>
      <label
        htmlFor="service-select-button"
        className="mb-1 block text-sm font-medium"
      >
        Services * {/* Indicate required */}
      </label>
      {isLoading ? (
        <div className="flex h-[50px] w-full items-center justify-center rounded-md border-2 border-gray-300 bg-gray-100 p-2 shadow-inner outline-none">
          <Spinner />
        </div>
      ) : (
        <>
          {/* The clickable button to open dropdown */}
          <button
            id="service-select-button"
            type="button" // Important for forms
            // Apply error styling conditionally
            className={`flex h-[50px] w-full cursor-pointer items-center justify-between rounded-md border-2 ${
              hasError ? "border-red-500" : "border-customDarkPink"
            } bg-white p-2 text-left shadow-custom outline-none focus:ring-2 focus:ring-blue-300`}
            onClick={handleShowingServices}
            aria-haspopup="listbox"
            aria-expanded={showServices}
          >
            <span className="text-gray-700">
              {/* Maybe show count of selected services? */}
              {servicesAvailed.length > 0
                ? `${servicesAvailed.length} service(s) selected`
                : "Select Service(s)..."}
            </span>
            <ChevronDown
              className={`transform transition-transform duration-150 ${
                showServices ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>

          {/* The dropdown list */}
          {showServices && (
            <div
              className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border-2 border-customDarkPink bg-white shadow-lg"
              role="listbox"
            >
              {data && data.length > 0 ? (
                data.map((service) => {
                  // Check if the service is already in the availed list
                  const isSelected = servicesAvailed.some(
                    (availed) => availed.id === service.id,
                  );
                  return (
                    <div
                      key={service.id}
                      role="option"
                      aria-selected={isSelected}
                      // Apply different styling if already selected, make it non-clickable or handle differently
                      className={`cursor-pointer p-2 text-sm ${
                        isSelected
                          ? "cursor-not-allowed bg-customDarkPink/20 text-gray-500" // Style if selected
                          : "hover:bg-customDarkPink/80 hover:text-white" // Style on hover if not selected
                      }`}
                      onClick={() =>
                        !isSelected && handleSelectingService(service)
                      } // Only allow selection if not already selected
                    >
                      {service.title} - ₱{service.price.toLocaleString()}
                    </div>
                  );
                })
              ) : (
                <div className="p-2 text-center text-sm text-gray-500">
                  No services available.
                </div>
              )}
            </div>
          )}
        </>
      )}
      {/* Display error message below */}
      {error && <p className="mt-1 pl-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
