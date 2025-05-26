// components/Inputs/CustomerInput.tsx
"use client";

import { useState, useEffect, ChangeEvent, useRef, FocusEvent } from "react";
import { getCustomer as fetchCustomers } from "@/lib/ServerAction"; // Import the server action (corrected typo fetchCustaomers -> fetchCustomers)
import type { CustomerWithRecommendations } from "@/lib/Types"; // Import the type

// Use the refined type from Types.ts
type CustomerData = CustomerWithRecommendations;

interface CustomerInputProps {
  error?: string;
  initialValue?: string; // Optional initial value (used for initial state)
  // This prop is now ONLY for selecting/clearing an EXISTING customer
  onCustomerSelect?: (customer: CustomerData | null) => void;
  // This prop is for reporting the raw input text as the user types
  onChange?: (value: string) => void; // Standard input change handler
  disabled?: boolean; // Added disabled prop
  autoFocus?: boolean; // Added autoFocus prop for potential future use by parent
}

export default function CustomerInput({
  error,
  initialValue = "", // Default to empty string
  onCustomerSelect, // Callback prop for selection/clearing
  onChange, // Callback prop for raw input change
  disabled = false, // Default disabled to false
  autoFocus = false, // Default autoFocus to false
}: CustomerInputProps) {
  // Use initialValue for the initial state
  const [internalQuery, setInternalQuery] = useState(initialValue);
  const [debouncedQuery, setDebouncedQuery] = useState(initialValue);
  const [searchResults, setSearchResults] = useState<CustomerData[] | null>(
    null,
  );
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // REMOVED: useEffect that attempted to sync initialValue.
  // Rely on parent component's 'key' prop to reset component state if initialValue changes.

  // Effect 1: Debounce input changes and handle clearing
  useEffect(() => {
    const value = internalQuery.trim();

    // If input becomes empty, immediately clear debouncedQuery and search results,
    // hide dropdown, and notify parent that selection is cleared.
    if (value === "") {
      setDebouncedQuery("");
      setSearchResults(null);
      setIsDropdownVisible(false);
      // Notify parent that customer selection is cleared (sets customerId = null, name="", email=null in Redux)
      onCustomerSelect?.(null);
      return;
    }

    const handler = setTimeout(() => {
      // Only update debouncedQuery if the input value hasn't changed while waiting
      // and if it's different from the *currently selected* name (to avoid re-fetching
      // immediately after selecting an existing customer)
      if (inputRef.current && value === inputRef.current.value.trim()) {
        // Check if the typed value is different from the current Redux name
        // This check prevents unnecessary searches if the parent's `initialValue` prop
        // caused `internalQuery` to be set to an already selected customer's name.
        // However, the debounce effect runs based on `internalQuery`, so it's better
        // to just update `debouncedQuery` if the input value matches `internalQuery`.
        // The logic for preventing unnecessary fetch after selection will be in Effect 2.
        setDebouncedQuery(value);
      }
    }, 500); // 500ms delay

    // Cleanup function: Clear timeout if internalQuery changes before the delay
    return () => clearTimeout(handler);
    // Depend on internalQuery, onCustomerSelect (since it's called here)
  }, [internalQuery, onCustomerSelect]);

  // Effect 2: Fetch data when debouncedQuery changes
  useEffect(() => {
    async function fetchData() {
      // Only fetch if debouncedQuery is not empty AND
      // if the current input value isn't already exactly matching a previously selected name.
      // This avoids re-searching right after a customer is selected.
      if (debouncedQuery) {
        // Optional: Add a check here if the debouncedQuery exactly matches the current
        // `initialValue` passed by the parent (which should be the selected customer's name).
        // If they match and a customer *was* selected, maybe skip the search?
        // However, fetching again is safe and ensures search results are up-to-date.
        // Let's stick to simply checking if debouncedQuery is not empty.

        try {
          const response = await fetchCustomers(debouncedQuery);
          const results = response ?? []; // Ensure results is an array
          setSearchResults(results);
          // Show dropdown only if input is currently focused and results exist
          if (results.length > 0 && isInputFocused) {
            setIsDropdownVisible(true);
          } else {
            setIsDropdownVisible(false);
          }
        } catch (err) {
          console.error("Failed to fetch customers:", err);
          setSearchResults([]); // Clear results on error
          setIsDropdownVisible(false); // Hide dropdown on error
        }
      } else {
        // If debouncedQuery becomes empty (e.g., due to initial load with empty initialValue or user clearing input)
        setSearchResults(null);
        setIsDropdownVisible(false);
        // onCustomerSelect(null) is handled in the debounce effect (Effect 1) when internalQuery is cleared.
      }
    }
    fetchData();
    // Dependencies: Trigger fetch when debouncedQuery changes or focus state changes.
    // Do NOT add onCustomerSelect here, as it would cause unnecessary fetches.
  }, [debouncedQuery, isInputFocused]);

  // Handle direct input changes
  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInternalQuery(value); // Update local state immediately
    onChange?.(value); // Notify parent of the raw input value change

    // If the user starts typing *after* a customer was selected,
    // this action implicitly means they are creating a NEW customer or modifying the input.
    // We should clear the existing selection in the parent state.
    // This could be handled here or in the parent based on `onCustomerSelect` or `onChange`.
    // Let's handle it in the parent by checking if the input value deviates from the selected name.
    // The simpler approach is: if `onChange` is called AND `onCustomerSelect` hasn't been called
    // with a customer object for this specific input sequence, the parent should assume
    // the customer is *not* an existing selected one.
  }

  // Handle selecting a suggestion
  function handleSelecting(customer: CustomerData) {
    // Update internal state first to match the selected customer's name
    setInternalQuery(customer.name);

    // Notify parent of the selection
    onCustomerSelect?.(customer); // Call the callback prop with the selected customer object

    // Hide and clear search results after selection
    setIsDropdownVisible(false);
    setSearchResults(null); // Clear search results after selection (optional, but common)

    // Remove focus after selection
    inputRef.current?.blur();
  }

  // --- Focus and Blur Handlers ---
  const handleFocus = () => {
    setIsInputFocused(true);
    // Show dropdown on focus if there are already matching results for the current debounced query
    // or if there's any text typed, potentially triggering a search if debounced query is old/empty.
    if (internalQuery.trim().length > 0 && searchResults !== null) {
      // Show dropdown if there are existing results OR if searchResults is explicitly empty []
      // This handles cases where a previous search returned no results.
      setIsDropdownVisible(true);
    } else if (
      internalQuery.trim().length > 0 &&
      searchResults === null &&
      debouncedQuery.trim() !== internalQuery.trim()
    ) {
      // If input has text but no search results yet (maybe debounce pending),
      // re-trigger the debounce/fetch by updating debouncedQuery immediately on focus.
      setDebouncedQuery(internalQuery.trim());
    }
  };

  const handleBlur = () => {
    // Use a small timeout to allow the click event on a suggestion to fire BEFORE blur hides the dropdown.
    setTimeout(() => {
      setIsInputFocused(false);
      setIsDropdownVisible(false);
      // Note: We DO NOT call onCustomerSelect(null) here.
      // Clearing the selection happens ONLY when the input value becomes empty (Effect 1).
      // If the user types a name but doesn't select, the parent's Redux state
      // will have `customerId: null`, `name: typedValue`, `email: typedValue or null`.
    }, 100); // Adjust delay as needed, 100-200ms is common
  };

  // Sync internalQuery with initialValue prop when initialValue changes
  useEffect(() => {
    setInternalQuery(initialValue ?? "");
    // This useEffect is critical if the parent controls the input value via Redux state changes.
    // When the parent selects a customer and updates Redux 'name', this effect
    // propagates that 'name' down as `initialValue` to set `internalQuery`.
    // We might also want to reset `debouncedQuery` here if initialValue is empty.
    if (initialValue === "") {
      setDebouncedQuery(""); // Clear search results if initialValue is cleared
      setSearchResults(null);
    } else {
      // If initialValue is set (e.g. on selecting a customer), we should update the debounced query
      // to match the selected name, potentially triggering a search again, but the results
      // should just show the selected person at the top. Or we could skip the search
      // if initialValue is non-empty? This depends on desired UX.
      // Let's keep it simple and just update debouncedQuery, Effect 2 handles the fetch.
      setDebouncedQuery(initialValue ?? "");
    }
  }, [initialValue]);

  // --- Styling ---
  let borderColor = error
    ? "border-red-500"
    : isInputFocused
      ? "border-customDarkPink"
      : "border-gray-300";

  let labelColor = error
    ? "text-red-600"
    : isInputFocused
      ? "text-customDarkPink"
      : "text-gray-500";

  // Ensure input is disabled if the disabled prop is true
  const inputDisabledStyle = disabled ? "cursor-not-allowed bg-gray-100" : "";

  return (
    <div className="relative w-full">
      <div className="relative w-full">
        <input
          ref={inputRef}
          name="customer_display"
          id="customer-input"
          value={internalQuery} // Controlled by local state
          onChange={handleInput} // Use the new handleInput
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
          placeholder=" "
          className={`peer relative z-0 h-[50px] w-full rounded-md border-2 bg-white ${borderColor} px-2 shadow-custom outline-none transition-colors duration-150 ${inputDisabledStyle}`}
          aria-invalid={!!error}
          aria-describedby={error ? "customer-error" : undefined}
          disabled={disabled} // Apply the disabled prop
          autoFocus={autoFocus} // Apply the autoFocus prop
        />
        <label
          htmlFor="customer-input"
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 cursor-text bg-white px-1 text-base font-medium transition-all duration-150 ${labelColor} peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-sm peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-sm peer-focus:${error ? "text-red-600" : "text-customDarkPink"} ${disabled ? "cursor-not-allowed text-gray-400" : ""}`} // Add disabled label style
        >
          Recipient Customer *
        </label>

        {/* Suggestions Dropdown */}
        {isDropdownVisible && searchResults !== null && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border border-gray-300 bg-white py-2 shadow-lg">
            {searchResults.length > 0
              ? searchResults.map((customer) => (
                  <div
                    key={customer.id}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
                    // Use onMouseDown to handle click before blur hides dropdown
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent input blur
                      handleSelecting(customer); // Pass the whole customer object
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
                ))
              : debouncedQuery.trim() !== "" && (
                  // Display "No results" only if a search was attempted (debouncedQuery not empty)
                  <div className="px-3 py-2 text-sm italic text-gray-500">
                    No customers found.
                  </div>
                )}
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
