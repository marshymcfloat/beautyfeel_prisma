"use client";

import { ChevronDown } from "lucide-react";
import Spinner from "../ui/Spinner";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState } from "@/lib/reduxStore";
import { useEffect, useRef, useState } from "react";
import { FetchedItem } from "@/lib/Types";

// Added disabled prop to the type definition
export default function ServicesSelect({
  isLoading,
  data,
  error,
  disabled, // Accept the disabled prop
}: {
  isLoading: boolean;
  data: FetchedItem[] | null;
  error?: string | null;
  disabled?: boolean; // Define the disabled prop
}) {
  const dispatch = useDispatch();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const servicesAvailed = useSelector(
    (state: RootState) => state.cashier.servicesAvailed,
  );

  function handleToggleDropdown() {
    // Only toggle if not disabled
    if (!disabled) {
      setShowDropdown((prev) => !prev);
    }
  }
  function handleSelectItem(item: FetchedItem) {
    // Allow selecting only if not disabled (redundant check as button is disabled, but good practice)
    if (!disabled) {
      dispatch(
        cashierActions.selectItem({
          id: item.id,
          title: item.title,
          price: item.price,
          type: item.type,
        }),
      );
      // Optionally close dropdown after selection
      // setShowDropdown(false);
    }
  }

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
  }, [showDropdown]); // Added showDropdown as dependency for effect cleanup logic correctness

  const hasError = !!error;
  const buttonText =
    servicesAvailed.length > 0
      ? `${servicesAvailed.length} item(s) selected`
      : "Select Service(s) or Set(s)...";
  const inputHeight = "h-[50px]";
  const labelStyle = "mb-1 block text-sm font-medium text-customBlack/80";

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <label htmlFor="service-select-button" className={labelStyle}>
        Services / Sets *
      </label>
      {isLoading ? (
        <div
          className={`flex ${inputHeight} items-center justify-center rounded-md border-2 border-customGray bg-gray-50`}
        >
          <Spinner />
        </div>
      ) : (
        <>
          <button
            id="service-select-button"
            type="button"
            className={`flex ${inputHeight} w-full items-center justify-between rounded-md border-2 ${hasError ? "border-red-500" : "border-customDarkPink/60"} bg-white p-2 pl-3 text-left shadow-sm outline-none focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100`} // Added disabled styles
            onClick={handleToggleDropdown}
            aria-haspopup="listbox"
            aria-expanded={showDropdown}
            disabled={disabled} // Apply the disabled prop
          >
            <span
              className={
                servicesAvailed.length > 0
                  ? "text-customBlack"
                  : "text-gray-500"
              }
            >
              {buttonText}
            </span>
            <ChevronDown
              className={`transform transition-transform duration-150 ${showDropdown ? "rotate-180" : ""} mr-1 text-gray-500`}
              aria-hidden="true"
            />
          </button>

          {/* Only show dropdown if not disabled AND showDropdown is true */}
          {showDropdown && !disabled && (
            <div
              className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-customGray bg-white py-1 shadow-lg"
              role="listbox"
            >
              {data && data.length > 0 ? (
                data.map((item) => {
                  const isSelected = servicesAvailed.some(
                    (a) => a.id === item.id,
                  );
                  return (
                    // List items don't need a disabled prop directly,
                    // their click handler is guarded by the parent button's state,
                    // and we added a check inside handleSelectItem as well.
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={isSelected}
                      className={`cursor-pointer px-3 py-1.5 text-sm ${isSelected ? "bg-customDarkPink/10 font-medium text-customDarkPink" : "hover:bg-customLightBlue/50"}`}
                      onClick={() => handleSelectItem(item)}
                    >
                      {item.title} {item.type === "set" ? "(Set)" : ""} - ₱
                      {item.price.toLocaleString()}
                    </div>
                  );
                })
              ) : (
                <div className="p-2 text-center text-sm text-gray-500">
                  No items available.
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
