// components/Inputs/CustomerInput.tsx
"use client";

import { useState, useEffect, ChangeEvent, useRef, FocusEvent } from "react";
// Removed Redux imports as we'll use a callback prop instead for this specific use case
// import { useSelector, useDispatch } from "react-redux";
// import { cashierActions } from "@/lib/Slices/CashierSlice";
// import { RootState, AppDispatch } from "@/lib/reduxStore";
import { getCustomer as fetchCustomers } from "@/lib/ServerAction"; // Import the server action
import type { CustomerWithRecommendations } from "@/lib/Types"; // Import the type

// Use the refined type from Types.ts
type CustomerData = CustomerWithRecommendations;

// --- NEW PROP TYPE ---
interface CustomerInputProps {
  error?: string;
  initialValue?: string; // Optional initial value
  onCustomerSelect?: (customer: CustomerData | null) => void; // Callback prop
}

export default function CustomerInput({
  error,
  initialValue = "", // Default to empty string
  onCustomerSelect, // Destructure the new prop
}: CustomerInputProps) {
  // Use initialValue for the initial state
  const [internalQuery, setInternalQuery] = useState(initialValue);
  const [debouncedQuery, setDebouncedQuery] = useState(initialValue);
  const [searchResults, setSearchResults] = useState<CustomerData[] | null>(
    null,
  );
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Removed Redux state references
  // const dispatch = useDispatch<AppDispatch>();
  // const reduxNameState = useSelector((state: RootState) => state.cashier.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Effect 0: Sync internalQuery with initialValue if it changes externally (less common without Redux)
  useEffect(() => {
    if (initialValue !== internalQuery && !isInputFocused) {
      setInternalQuery(initialValue || "");
      if (!initialValue) {
        setDebouncedQuery("");
        setSearchResults(null);
        setIsDropdownVisible(false);
        // Call callback with null when cleared externally
        onCustomerSelect?.(null);
      }
    }
  }, [initialValue, isInputFocused, onCustomerSelect, internalQuery]);

  // Effect 1: Debounce input changes (No changes needed)
  useEffect(() => {
    if (internalQuery.trim() === "") {
      setDebouncedQuery("");
      setSearchResults(null);
      setIsDropdownVisible(false);
      return;
    }
    const handler = setTimeout(() => {
      if (internalQuery === inputRef.current?.value) {
        setDebouncedQuery(internalQuery.trim());
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [internalQuery]);

  // Effect 2: Fetch data when debouncedQuery changes (No changes needed in fetch logic)
  useEffect(() => {
    async function fetchData() {
      if (debouncedQuery) {
        try {
          const response = await fetchCustomers(debouncedQuery);
          const results = response ?? []; // Ensure results is an array
          setSearchResults(results);
          // Show dropdown only if focused and results exist
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
        // If query is cleared, notify parent via callback
        onCustomerSelect?.(null);
      }
    }
    fetchData();
    // Use onCustomerSelect in dependency array if needed, but likely stable
  }, [debouncedQuery, isInputFocused, onCustomerSelect]);

  // Handle direct input changes
  function handleInputChanges(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInternalQuery(value); // Update local state immediately
    // When user is typing, signal that no specific customer is selected
    onCustomerSelect?.(null);
  }

  // Handle selecting a suggestion
  function handleSelecting(customer: CustomerData) {
    // --- MODIFIED: Call the callback prop ---
    onCustomerSelect?.(customer);
    // --- END MODIFIED ---
    setInternalQuery(customer.name); // Sync input field value
    setIsDropdownVisible(false);
    setSearchResults(null); // Clear search results after selection
    inputRef.current?.blur(); // Remove focus after selection
  }

  // --- Focus and Blur Handlers ---
  const handleFocus = () => {
    setIsInputFocused(true);
    // Show dropdown on focus if there are already matching results for the current query
    if (
      debouncedQuery &&
      searchResults &&
      searchResults.length > 0 &&
      debouncedQuery === internalQuery.trim() // Ensure results match current input
    ) {
      setIsDropdownVisible(true);
    }
  };

  const handleBlur = () => {
    // Use timeout to allow click on suggestion before hiding
    setTimeout(() => {
      // Check if focus is still within the component or dropdown (more robust check needed if dropdown isn't direct child)
      if (document.activeElement !== inputRef.current) {
        setIsInputFocused(false);
        setIsDropdownVisible(false);
        // If the user blurs and the text doesn't exactly match a selected customer's name,
        // assume no specific customer is selected. The parent component should handle this logic based on its state.
        // The onCustomerSelect(null) call in handleInputChanges handles the clearing during typing.
        // If the text matches the selected customer name, the callback won't be called again, preserving the selection.
      }
    }, 150); // Adjust delay if needed
  };

  // --- Styling --- (No changes needed)
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

  return (
    <div className="relative w-full">
      {" "}
      {/* Removed outer flex container */}
      <div className="relative w-full">
        <input
          ref={inputRef}
          name="customer_display" // Changed name to avoid conflict if used in form directly
          id="customer-input"
          value={internalQuery} // Controlled by local state
          onChange={handleInputChanges}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
          // Removed 'required' as the parent component will manage validation based on selection
          placeholder=" "
          className={`peer relative z-0 h-[50px] w-full rounded-md border-2 bg-white ${borderColor} px-2 shadow-custom outline-none transition-colors duration-150`}
          aria-invalid={!!error}
          aria-describedby={error ? "customer-error" : undefined}
        />
        <label
          htmlFor="customer-input"
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 cursor-text bg-white px-1 text-base font-medium transition-all duration-150 ${labelColor} peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-sm peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-sm peer-focus:${error ? "text-red-600" : "text-customDarkPink"} `}
        >
          Recipient Customer * {/* Changed Label */}
        </label>

        {/* Suggestions Dropdown */}
        {isDropdownVisible && searchResults && searchResults.length > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border border-gray-300 bg-white py-2 shadow-lg">
            {searchResults.map((customer) => (
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
