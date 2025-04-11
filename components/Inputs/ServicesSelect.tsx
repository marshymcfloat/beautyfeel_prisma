// components/Inputs/ServicesSelect.tsx
"use client";

import { ChevronDown } from "lucide-react";
import Spinner from "../ui/Spinner";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState } from "@/lib/reduxStore";
import { useEffect, useRef, useState } from "react";
import { FetchedItem } from "@/lib/Types"; // Assuming type import

export default function ServicesSelect({
  isLoading,
  data,
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
  function handleSelectItem(item: FetchedItem) {
    dispatch(
      cashierActions.selectItem({
        id: item.id,
        title: item.title,
        price: item.price,
        type: item.type,
      }),
    );
  }

  useEffect(() => {
    /* ... click outside logic (keep) ... */ function handleClickOutside(
      event: MouseEvent,
    ) {
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
  const inputHeight = "h-[50px]"; // Consistent height
  const labelStyle = "mb-1 block text-sm font-medium text-customBlack/80"; // Consistent Label

  return (
    // Removed outer margins/width
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
            className={`flex ${inputHeight} w-full items-center justify-between rounded-md border-2 ${hasError ? "border-red-500" : "border-customDarkPink/60"} bg-white p-2 pl-3 text-left shadow-sm outline-none focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink`} // Added pl-3
            onClick={handleToggleDropdown}
            aria-haspopup="listbox"
            aria-expanded={showDropdown}
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
            />{" "}
            {/* Added text color/margin */}
          </button>

          {showDropdown && (
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
