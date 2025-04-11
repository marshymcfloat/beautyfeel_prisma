// components/Inputs/CustomerInput.tsx
"use client";

import { useState, useEffect, ChangeEvent, useRef } from "react";
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
  // Keep internal state for suggestions, separate from Redux 'name'
  const [internalQuery, setInternalQuery] = useState(""); // User's current typing
  const [debouncedQuery, setDebouncedQuery] = useState(""); // Debounced value for fetching
  const [searchResults, setSearchResults] = useState<CustomerData[] | null>(
    null,
  );
  const [isDropdownVisible, setIsDropdownVisible] = useState(false); // Control visibility

  const dispatch = useDispatch<AppDispatch>();
  const reduxNameState = useSelector((state: RootState) => state.cashier.name);
  const inputRef = useRef<HTMLInputElement>(null); // Ref for the input element

  // Effect 0: Sync internalQuery if reduxNameState is cleared externally
  // (e.g., by a reset action elsewhere)
  useEffect(() => {
    if (!reduxNameState && internalQuery) {
      setInternalQuery("");
      setDebouncedQuery(""); // Also clear debounced value
      setSearchResults(null);
      setIsDropdownVisible(false);
    }
    // Only run when reduxNameState changes externally
  }, [reduxNameState]); // Note: Adding internalQuery here could cause loops if not careful

  // Effect 1: Debounce input changes to update debouncedQuery
  useEffect(() => {
    // If user clears input, clear debounced immediately
    if (internalQuery.trim() === "") {
      setDebouncedQuery("");
      setSearchResults(null);
      setIsDropdownVisible(false);
      return; // No timer needed
    }

    // Set timer to update debouncedQuery for fetching
    const handler = setTimeout(() => {
      setDebouncedQuery(internalQuery.trim());
    }, 500); // Debounce time

    return () => clearTimeout(handler);
  }, [internalQuery]); // Depend only on the user's direct input

  // Effect 2: Fetch data when debouncedQuery changes
  useEffect(() => {
    async function fetchData() {
      // Only fetch if debounced query is not empty
      if (debouncedQuery) {
        // Check if the debounced query matches the currently selected name in Redux.
        // If they match, we probably don't need to fetch again unless the dropdown isn't visible.
        // This prevents refetching right after selection in some cases.
        if (
          debouncedQuery.toLowerCase() === reduxNameState?.toLowerCase() &&
          isDropdownVisible
        ) {
          // console.log("Skipping fetch, query matches selected name and dropdown is visible.");
          // return; // Option: Skip fetch if name matches & dropdown open
        }

        try {
          // console.log(`Fetching customers for: ${debouncedQuery}`);
          const response = await fetchCustomers(debouncedQuery);
          const results = response ?? [];
          setSearchResults(results);
          // Show dropdown ONLY if there are results AND the input still has focus
          // (or hasn't been blurred immediately after typing)
          if (
            results.length > 0 &&
            document.activeElement === inputRef.current
          ) {
            setIsDropdownVisible(true);
          } else if (results.length === 0) {
            setIsDropdownVisible(false); // Hide if no results found
          }
        } catch (err) {
          console.error("Failed to fetch customers:", err);
          setSearchResults([]);
          setIsDropdownVisible(false);
        }
      } else {
        // Clear results and hide dropdown if debounced query becomes empty
        setSearchResults(null);
        setIsDropdownVisible(false);
      }
    }

    fetchData();
  }, [debouncedQuery, reduxNameState]); // Depend on debounced query and reduxNameState (for the skip check)

  // Handle direct input changes
  function handleInputChanges(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInternalQuery(value); // Update internal query state immediately
    dispatch(cashierActions.setCustomerName(value)); // Update Redux state immediately
    // Let debounce effect handle showing/hiding dropdown based on results
  }

  // Handle selecting a suggestion
  function handleSelecting(name: string, email: string | null) {
    console.log("Selecting:", name);
    // Update Redux state first
    dispatch(cashierActions.setCustomerName(name));
    dispatch(cashierActions.setEmail(email ?? ""));

    // Update the input field value directly
    setInternalQuery(name);

    // --- Crucial: Hide dropdown and clear results *before* potential state updates trigger effects ---
    setIsDropdownVisible(false);
    setSearchResults(null);

    // --- DO NOT setDebouncedQuery here ---
    // Let the internalQuery update trigger the debounce effect naturally if needed,
    // but the immediate state changes above should prevent the flicker.

    // Optional: Blur the input to signify selection completion
    inputRef.current?.blur();
  }

  // Handle losing focus (blur) - use timeout to allow click on suggestion
  const handleBlur = () => {
    // Use a short timeout to allow the 'onMouseDown' of the suggestion to register
    // before hiding the dropdown.
    setTimeout(() => {
      // Check if the focus is still within the component (e.g., user clicked a suggestion)
      // This check might be complex depending on structure. Relying on onMouseDown is often simpler.
      // If the click wasn't on a suggestion (which calls handleSelecting and hides), hide dropdown.
      if (isDropdownVisible) {
        // Only hide if it was still meant to be visible
        // console.log("Blur triggered, hiding dropdown.");
        setIsDropdownVisible(false);
      }
    }, 150); // Delay in ms - adjust if needed
  };

  // Handle gaining focus
  const handleFocus = () => {
    // If there's a debounced query and results already exist (cached in state), show dropdown.
    // Also check if the current input value matches the debounced query to avoid showing
    // stale results immediately on focus if the user cleared the input.
    if (
      debouncedQuery &&
      searchResults &&
      searchResults.length > 0 &&
      debouncedQuery === internalQuery.trim()
    ) {
      // console.log("Focus triggered, showing existing results.");
      setIsDropdownVisible(true);
    } else if (internalQuery.trim()) {
      // If there's text but no results yet (e.g., focus after clearing), trigger a new debounce/fetch cycle.
      // Force update debouncedQuery to potentially trigger fetch faster on focus? Or just let debounce run.
      // Let's stick to showing existing results or letting debounce handle it naturally.
    }
  };

  // --- Styling ---
  const hasValue = !!reduxNameState; // Check if Redux state (which controls input value) has content
  const isFocused = document.activeElement === inputRef.current; // Simple focus check

  // Determine colors based on state
  let borderColor = error ? "border-red-500" : "border-customDarkPink";
  let labelColor = error ? "text-red-600" : "text-gray-500"; // Default label gray

  if (!error && isFocused) {
    labelColor = "text-customDarkPink"; // Focused label color (non-error)
    // borderColor remains customDarkPink unless error
  }

  // Base label classes
  const labelBaseClasses =
    "absolute left-3 top-1/2 -translate-y-1/2 cursor-text px-1 text-base font-medium transition-all duration-150 pointer-events-none";
  // Floated label state classes
  const labelFloatedClasses = "top-[-10px] text-sm tracking-widest  z-10"; // Added bg, z-index

  return (
    <div className="relative my-8 flex w-full flex-col items-center">
      <div className="relative w-full">
        <input
          ref={inputRef}
          name="customer"
          id="customer-input"
          value={reduxNameState || ""} // Ensure value is controlled, fallback to "" if null/undefined
          onChange={handleInputChanges}
          onBlur={handleBlur}
          onFocus={handleFocus}
          autoComplete="off"
          required // Keep required if needed for form semantics
          placeholder=" " // Keep placeholder for :placeholder-shown
          // Added z-0 to input
          className={`peer relative z-0 h-[50px] w-full rounded-md border-2 ${borderColor} px-2 shadow-custom outline-none transition-colors duration-150`}
          aria-invalid={!!error}
          aria-describedby={error ? "customer-error" : undefined}
        />
        <label
          htmlFor="customer-input"
          // Apply base, dynamic color, and floated state classes
          className={`${labelBaseClasses} ${labelColor} peer-focus:top-[-10px] peer-focus:z-10 peer-focus:text-sm peer-focus:tracking-widest peer-focus:${error ? "text-red-600" : "text-customDarkPink"} peer-[:not(:placeholder-shown)]:top-[-10px] peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:text-sm peer-[:not(:placeholder-shown)]:tracking-widest peer-[:not(:placeholder-shown)]:${labelColor} `}
        >
          Customer Name *
        </label>

        {/* Suggestions Dropdown - Controlled by isDropdownVisible */}
        {isDropdownVisible && searchResults && searchResults.length > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border-2 border-customDarkPink bg-white py-2 shadow-lg">
            {" "}
            {/* Increased z-index */}
            {searchResults.map((customer) => (
              <div
                key={customer.id}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-customLightBlue"
                // Use onMouseDown: Fires before onBlur, ensuring selection works
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input from losing focus momentarily
                  handleSelecting(customer.name, customer.email);
                }}
              >
                <span className="font-medium text-customBlack">
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

      {/* Display error message below input container */}
      {error && (
        <p
          id="customer-error"
          // Adjusted margin-top to be slightly closer if needed
          className="w-full self-start pl-1 pt-0.5 text-xs text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
