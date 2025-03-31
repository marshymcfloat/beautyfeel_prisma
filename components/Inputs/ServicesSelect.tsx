"use client";

import { ChevronDown } from "lucide-react";
import Spinner from "../ui/Spinner";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice"; // Action creators
import { RootState } from "@/lib/reduxStore"; // Root state type
import { useEffect, useRef, useState } from "react";

// Type for the raw service data fetched and passed as props
type ServicesProps = {
  id: string;
  title: string; // The data fetched has 'title'
  price: number;
  branchId: string; // Include if needed, otherwise optional
};

export default function ServicesSelect({
  isLoading,
  data,
  error,
}: {
  isLoading: boolean;
  data: ServicesProps[] | null; // Expecting array of fetched services or null
  error?: string;
}) {
  const dispatch = useDispatch();
  const [showServices, setShowServices] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Select the services already added to the transaction from the cashier state
  // Note: Items in servicesAvailed now have the structure { id, name, price, quantity }
  const servicesAvailed = useSelector(
    (state: RootState) => state.cashier.servicesAvailed,
  );

  function handleShowingServices() {
    setShowServices((prev) => !prev);
  }

  // This function is called when a service from the *dropdown list* is clicked
  function handleSelectingService(service: ServicesProps) {
    // service has { id, title, price, branchId }

    // Check if the service (by ID) is already in the availed list in the Redux state
    const isAlreadySelected = servicesAvailed.some(
      (availed) => availed.id === service.id,
    );

    // Only dispatch the action if the service is NOT already selected.
    // The reducer now handles adding/removing (toggle behavior from original slice)
    // or just adding (if the original slice's toggle wasn't intended).
    // The current slice code removes if existing, adds if new.
    dispatch(
      cashierActions.selectingService({
        // Pass the necessary info for the reducer
        id: service.id,
        title: service.title, // Pass 'title', reducer maps it to 'name'
        price: service.price,
      }),
    );

    // Optional: Close dropdown after selection

    // Note: The original component code prevented re-selection via the UI logic below.
    // The updated reducer logic *also* handles this (removes if existing).
    // If you *only* want to add and never remove by clicking the dropdown,
    // you would add the `if (!isAlreadySelected)` check back here.
    // Example:
    // if (!isAlreadySelected) {
    //    dispatch(cashierActions.selectingService({...}));
    // } else {
    //    console.log("Service already selected, not dispatching add/remove action again from dropdown.");
    // }
  }

  // *** REMOVED useEffect for handlingTotals ***
  // Total calculation is now handled directly within the CashierSlice reducers
  // (selectingService, handleServicesQuantity, setDiscount) whenever relevant state changes.
  /*
  useEffect(() => {
    // THIS IS NO LONGER NEEDED
    const total = servicesAvailed.reduce(
      (sum, service) => sum + service.price * service.quantity,
      0,
    );
    dispatch(
      // This action/reducer part was likely removed or changed in the slice
      // cashierActions.handlingTotals({ identifier: "grandTotal", value: total }),
    );
  }, [servicesAvailed, dispatch]);
  */

  // Handle clicks outside dropdown (Keep this as is)
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
  }, []); // Empty dependency array is correct here

  const hasError = !!error;

  return (
    <div className="relative mx-auto mt-8 w-[90%]" ref={dropdownRef}>
      <label
        htmlFor="service-select-button"
        className="mb-1 block text-sm font-medium"
      >
        Services * {/* Indicate required */}
      </label>
      {isLoading ? (
        <div className="flex h-[50px] w-full items-center justify-center rounded-md border-2 border-gray-300 bg-gray-100 p-2 shadow-inner outline-none">
          <Spinner /> {/* Loading indicator */}
        </div>
      ) : (
        <>
          {/* Button to toggle dropdown */}
          <button
            id="service-select-button"
            type="button"
            className={`flex h-[50px] w-full cursor-pointer items-center justify-between rounded-md border-2 ${
              hasError ? "border-red-500" : "border-customDarkPink" // Error styling
            } bg-white p-2 text-left shadow-custom outline-none focus:ring-2 focus:ring-blue-300`}
            onClick={handleShowingServices}
            aria-haspopup="listbox"
            aria-expanded={showServices}
          >
            <span className="text-gray-700">
              {/* Display count of selected services */}
              {servicesAvailed.length > 0
                ? `${servicesAvailed.length} service(s) selected`
                : "Select Service(s)..."}
            </span>
            <ChevronDown
              className={`transform transition-transform duration-150 ${
                showServices ? "rotate-180" : "" // Rotate arrow icon
              }`}
              aria-hidden="true"
            />
          </button>

          {/* Dropdown List */}
          {showServices && (
            <div
              className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border-2 border-customDarkPink bg-white shadow-lg"
              role="listbox"
            >
              {/* Check if data exists and has items */}
              {data && data.length > 0 ? (
                data.map((service) => {
                  // Map over the fetched service data
                  // Check if this service ID is already in the availed list in Redux state
                  const isSelected = servicesAvailed.some(
                    (availed) => availed.id === service.id,
                  );
                  return (
                    <div
                      key={service.id} // Use service ID as key
                      role="option"
                      aria-selected={isSelected} // Indicate selection state for accessibility
                      // Apply styling based on selection state
                      className={`cursor-pointer p-2 text-sm ${
                        isSelected
                          ? "bg-customDarkPink/20 text-gray-500" // Style if selected (less emphasis)
                          : "hover:bg-customDarkPink/80 hover:text-white" // Style on hover if not selected
                      }`}
                      // Call handler when an item is clicked
                      onClick={() => handleSelectingService(service)}
                      // Original code prevented clicking if already selected:
                      // onClick={() => !isSelected && handleSelectingService(service)}
                      // The current reducer handles the toggle/removal, so clicking again will deselect.
                      // If you DON'T want deselection by clicking the dropdown, use the commented-out onClick.
                    >
                      {/* Display service title (from fetched data) and price */}
                      {service.title} - ₱{service.price.toLocaleString()}
                    </div>
                  );
                })
              ) : (
                // Display message if no services are available in the fetched data
                <div className="p-2 text-center text-sm text-gray-500">
                  No services available.
                </div>
              )}
            </div>
          )}
        </>
      )}
      {/* Display error message below the component if provided */}
      {error && <p className="mt-1 pl-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
