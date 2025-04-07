// components/Inputs/ServicesSelect.tsx
"use client";

import { ChevronDown } from "lucide-react";
import Spinner from "../ui/Spinner";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState } from "@/lib/reduxStore";
import { useEffect, useRef, useState } from "react";

// Types for fetched data (adjust ServerAction/types accordingly)
type FetchedItem = {
  id: string;
  title: string;
  price: number;
  type: "service" | "set"; // Add type identifier
};

export default function ServicesSelect({
  isLoading,
  data, // Should now be FetchedItem[] | null
  error,
}: {
  isLoading: boolean;
  data: FetchedItem[] | null;
  error?: string | null;
}) {
  const dispatch = useDispatch();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const servicesAvailed = useSelector(
    (state: RootState) => state.cashier.servicesAvailed,
  );

  function handleToggleDropdown() {
    setShowDropdown((prev) => !prev);
  }

  // Handle selecting either a service or a set
  function handleSelectItem(item: FetchedItem) {
    dispatch(
      cashierActions.selectItem({
        // Use the updated action name
        id: item.id,
        title: item.title,
        price: item.price,
        type: item.type,
      }),
    );
    // Optional: Close dropdown after selection
    // setShowDropdown(false);
  }

  // Handle clicks outside dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const hasError = !!error;
  const buttonText =
    servicesAvailed.length > 0
      ? `${servicesAvailed.length} item(s) selected`
      : "Select Service(s) or Set(s)...";

  return (
    <div className="relative mx-auto mt-8 w-[90%]" ref={dropdownRef}>
      <label
        htmlFor="service-select-button"
        className="mb-1 block text-sm font-medium"
      >
        Services / Sets *
      </label>
      {isLoading ? (
        <div className="loading-placeholder">
          <Spinner />
        </div> // Use your loading style
      ) : (
        <>
          <button
            id="service-select-button"
            type="button"
            className={`flex h-[50px] w-full cursor-pointer items-center justify-between rounded-md border-2 ${hasError ? "border-red-500" : "border-customDarkPink"} bg-white p-2 text-left shadow-custom outline-none focus:ring-2 focus:ring-blue-300`}
            onClick={handleToggleDropdown}
            aria-haspopup="listbox"
            aria-expanded={showDropdown}
          >
            <span className="text-gray-700">{buttonText}</span>
            <ChevronDown
              className={`transform transition-transform duration-150 ${showDropdown ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {showDropdown && (
            <div
              className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border-2 border-customDarkPink bg-white shadow-lg"
              role="listbox"
            >
              {data && data.length > 0 ? (
                data.map((item) => {
                  const isSelected = servicesAvailed.some(
                    (availed) => availed.id === item.id,
                  );
                  return (
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={isSelected}
                      className={`cursor-pointer p-2 text-sm ${
                        isSelected
                          ? "bg-customDarkPink/20 font-medium text-customDarkPink"
                          : "hover:bg-customDarkPink/80 hover:text-white"
                      }`}
                      onClick={() => handleSelectItem(item)}
                    >
                      {item.title} {item.type === "set" ? "(Set)" : ""} - ₱
                      {item.price.toLocaleString()}
                    </div>
                  );
                })
              ) : (
                <div className="p-2 text-center text-sm text-gray-500">
                  No services or sets available.
                </div>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="mt-1 pl-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
