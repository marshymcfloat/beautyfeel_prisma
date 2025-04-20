// components/Inputs/CustomerInput.tsx
"use client";

import { useState, useEffect, ChangeEvent, useRef, FocusEvent } from "react";
import { useSelector, useDispatch } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { getCustomer as fetchCustomers } from "@/lib/ServerAction";

type CustomerData = {
  id: string;
  name: string;
  email: string | null;
};

export default function CustomerInput({ error }: { error?: string }) {
  // State for user's typing, suggestions, and dropdown visibility
  const [internalQuery, setInternalQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerData[] | null>(
    null,
  );
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  // State to track focus (safe for SSR/client)
  const [isInputFocused, setIsInputFocused] = useState(false);

  const dispatch = useDispatch<AppDispatch>();
  // Get name from Redux, primarily for initial value or external updates
  const reduxNameState = useSelector((state: RootState) => state.cashier.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Effect 0: Sync internalQuery with reduxNameState on mount or external change
  useEffect(() => {
    // If redux has a value and internal is different (or empty), update internal.
    // This handles initial load or external resets. Check focus to avoid overwriting while typing.
    if (reduxNameState !== internalQuery && !isInputFocused) {
      setInternalQuery(reduxNameState || ""); // Use redux value or empty string
      // Clear debounce/results if redux state became empty
      if (!reduxNameState) {
        setDebouncedQuery("");
        setSearchResults(null);
        setIsDropdownVisible(false);
      }
    }
    // Only trigger when reduxNameState changes or on initial mount if needed.
    // Avoid depending on internalQuery here to prevent potential loops.
  }, [reduxNameState, isInputFocused]); // Rerun if focus changes to potentially sync

  // Effect 1: Debounce input changes
  useEffect(() => {
    if (internalQuery.trim() === "") {
      setDebouncedQuery("");
      setSearchResults(null);
      setIsDropdownVisible(false);
      return;
    }
    const handler = setTimeout(() => {
      // Ensure the current input value still matches the debounced target
      if (internalQuery === inputRef.current?.value) {
        setDebouncedQuery(internalQuery.trim());
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [internalQuery]);

  // Effect 2: Fetch data when debouncedQuery changes
  useEffect(() => {
    async function fetchData() {
      if (debouncedQuery) {
        try {
          const response = await fetchCustomers(debouncedQuery);
          const results = response ?? [];
          setSearchResults(results);
          if (results.length > 0 && isInputFocused) {
            setIsDropdownVisible(true);
          } else {
            setIsDropdownVisible(false);
          }
        } catch (err) {
          console.error("Failed to fetch customers:", err);
          setSearchResults([]);
          setIsDropdownVisible(false);
        }
      } else {
        setSearchResults(null);
        setIsDropdownVisible(false);
      }
    }
    fetchData();
    // Depend on debounced query and focus state
  }, [debouncedQuery, isInputFocused]);

  // Handle direct input changes
  function handleInputChanges(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInternalQuery(value); // Update local state immediately
    dispatch(cashierActions.setCustomerName(value)); // Update Redux immediately
  }

  // Handle selecting a suggestion
  function handleSelecting(name: string, email: string | null) {
    dispatch(cashierActions.setCustomerName(name));
    dispatch(cashierActions.setEmail(email ?? ""));
    setInternalQuery(name); // Sync input field value
    setIsDropdownVisible(false);
    setSearchResults(null);
    inputRef.current?.blur(); // Remove focus after selection
  }

  // --- Focus and Blur Handlers ---
  const handleFocus = () => {
    setIsInputFocused(true);
    // Show existing results on focus if query matches results
    if (
      debouncedQuery &&
      searchResults &&
      searchResults.length > 0 &&
      debouncedQuery === internalQuery.trim()
    ) {
      setIsDropdownVisible(true);
    }
  };

  const handleBlur = () => {
    // Use timeout to allow click on suggestion before hiding
    setTimeout(() => {
      // Check activeElement *within* timeout - safe on client
      if (document.activeElement !== inputRef.current) {
        setIsInputFocused(false);
        setIsDropdownVisible(false); // Hide dropdown if focus truly moved away
      }
    }, 150);
  };

  // --- Styling ---
  // Determine colors based on error and focus state
  let borderColor = error
    ? "border-red-500"
    : isInputFocused
      ? "border-customDarkPink" // Focused border
      : "border-gray-300"; // Default border

  let labelColor = error
    ? "text-red-600"
    : isInputFocused
      ? "text-customDarkPink" // Focused label
      : "text-gray-500"; // Default label

  return (
    <div className="relative my-8 flex w-full flex-col items-center">
      {" "}
      {/* Adjusted margin */}
      <div className="relative w-full">
        <input
          ref={inputRef}
          name="customer"
          id="customer-input"
          value={internalQuery} // Controlled by local state
          onChange={handleInputChanges}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
          required
          placeholder=" " // Crucial for :placeholder-shown selector
          // Apply dynamic border color, ensure peer class is present
          className={`peer relative z-0 h-[50px] w-full rounded-md border-2 bg-white ${borderColor} px-2 shadow-custom outline-none transition-colors duration-150`}
          aria-invalid={!!error}
          aria-describedby={error ? "customer-error" : undefined}
        />
        {/*
          Label Styling using PEER variants for position/size,
          and component STATE for color.
        */}
        <label
          htmlFor="customer-input"
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 cursor-text bg-white px-1 text-base font-medium transition-all duration-150 ${labelColor} /* Base styles and dynamic color */ /* Positioning/size based on PEER state (via CSS) */ /* Color override when PEER is focused (matches state-based color) */ peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-sm peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-sm peer-focus:${error ? "text-red-600" : "text-customDarkPink"} `}
        >
          Customer Name *
        </label>

        {/* Suggestions Dropdown */}
        {isDropdownVisible && searchResults && searchResults.length > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border border-gray-300 bg-white py-2 shadow-lg">
            {searchResults.map((customer) => (
              <div
                key={customer.id}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
                onMouseDown={(e) => {
                  // Use onMouseDown
                  e.preventDefault();
                  handleSelecting(customer.name, customer.email);
                }}
              >
                <span className="font-medium text-gray-900">
                  {customer.name}
                </span>
                {customer.email && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({customer.email})
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Error Message */}
      {error && (
        <p
          id="customer-error"
          className="w-full self-start pl-1 pt-0.5 text-xs text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
