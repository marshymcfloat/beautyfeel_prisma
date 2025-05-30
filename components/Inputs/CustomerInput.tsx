"use client";

import { useState, useEffect, ChangeEvent, useRef, FocusEvent } from "react";
import { getCustomer as fetchCustomers } from "@/lib/ServerAction";
import type { CustomerWithRecommendations } from "@/lib/Types";
import { Loader2 } from "lucide-react"; // Added Loader2 import

type CustomerData = CustomerWithRecommendations;

interface CustomerInputProps {
  error?: string;
  initialValue?: string;
  // Consider adding a 'value' prop and making it a controlled component if
  // the parent needs to programmatically change the input value after initial render.
  // For now, it behaves more like an uncontrolled component initialized by initialValue.

  onCustomerSelect?: (customer: CustomerData | null) => void;
  // Renamed from onChange to onInputChange to avoid confusion with form onChange
  onInputChange?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  // Optional: loading state from parent if fetching is coordinated elsewhere
  // isLoading?: boolean;
}

export default function CustomerInput({
  error,
  initialValue = "",
  onCustomerSelect,
  onInputChange, // Using onInputChange instead of onChange
  disabled = false,
  autoFocus = false,
}: CustomerInputProps) {
  // Initialize state directly from initialValue
  const [internalQuery, setInternalQuery] = useState(initialValue ?? "");
  // Initialize debounced state from initialValue
  const [debouncedQuery, setDebouncedQuery] = useState(initialValue ?? "");

  const [searchResults, setSearchResults] = useState<CustomerData[] | null>(
    null,
  );
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isFetching, setIsFetching] = useState(false); // Local fetching state

  const inputRef = useRef<HTMLInputElement>(null);
  // Ref to track if a customer has been explicitly selected from the dropdown
  const customerSelectedRef = useRef(false);

  // Effect 1: Debounce input value for fetching
  useEffect(() => {
    const value = internalQuery.trim();
    console.log(
      `Debounce Effect: internalQuery=${internalQuery}, trimmed=${value}`,
    );

    // Clear debounced query, results, and hide dropdown if input is empty
    if (value === "") {
      console.log("Debounce Effect: Input is empty, resetting.");
      setDebouncedQuery("");
      setSearchResults(null);
      setIsDropdownVisible(false);
      // Notify parent that selection is cleared if input is made empty
      // Check if a selection was previously made before clearing parent state
      // This prevents unnecessarily calling onCustomerSelect(null) on initial empty render
      if (customerSelectedRef.current) {
        console.log(
          "Debounce Effect: Input cleared after selection, calling onCustomerSelect(null)",
        );
        onCustomerSelect?.(null);
        customerSelectedRef.current = false; // Reset the flag
      }
      return; // No need to set a timeout for empty value
    }

    // Set up the debounce timer
    const handler = setTimeout(() => {
      // Only update debounced query if the input value hasn't changed since the timeout was set
      if (inputRef.current && value === inputRef.current.value.trim()) {
        console.log(
          `Debounce Effect: Timeout finished, setting debouncedQuery to "${value}"`,
        );
        setDebouncedQuery(value);
      } else {
        console.log(
          "Debounce Effect: Timeout finished, but input value changed. Skipping setDebouncedQuery.",
        );
      }
    }, 500); // 500ms debounce delay

    // Cleanup function: clear the timeout if internalQuery changes before the timeout fires
    return () => {
      console.log("Debounce Effect: Clearing timeout.");
      clearTimeout(handler);
    };
  }, [internalQuery, onCustomerSelect]); // Depend on internalQuery to re-run when it changes

  // Effect 2: Fetch data when debounced query changes
  useEffect(() => {
    async function fetchData() {
      // Only fetch if there's a debounced query and the component is not disabled
      if (debouncedQuery && !disabled) {
        console.log(`Fetch Effect: Fetching customers for "${debouncedQuery}"`);
        setIsFetching(true);
        setSearchResults(null); // Clear previous results immediately

        try {
          const response = await fetchCustomers(debouncedQuery);
          const results = response ?? [];
          console.log(`Fetch Effect: Received ${results.length} results.`);
          setSearchResults(results);

          // Show dropdown if results are found AND input is currently focused
          // Avoid showing dropdown if the user has blurred the input while fetching
          if (results.length > 0 && isInputFocused) {
            setIsDropdownVisible(true);
            console.log("Fetch Effect: Showing dropdown.");
          } else {
            setIsDropdownVisible(false);
            console.log(
              "Fetch Effect: Hiding dropdown (no results or not focused).",
            );
          }
        } catch (err) {
          console.error("Fetch Effect: Failed to fetch customers:", err);
          setSearchResults([]); // Set to empty array on error
          setIsDropdownVisible(false); // Hide dropdown on error
        } finally {
          setIsFetching(false); // Always set fetching to false when done
          console.log("Fetch Effect: Fetching finished.");
        }
      } else if (!debouncedQuery) {
        // If debouncedQuery becomes empty (e.g., user deleted input)
        console.log(
          "Fetch Effect: debouncedQuery is empty, resetting results.",
        );
        setSearchResults(null);
        setIsDropdownVisible(false);
        setIsFetching(false); // Ensure fetching is off
      } else if (disabled) {
        // If disabled becomes true while a fetch was pending
        console.log(
          "Fetch Effect: Disabled prop is true, aborting potential fetch.",
        );
        setIsFetching(false);
      }
    }

    // Call fetchData when debouncedQuery or disabled state changes
    fetchData();
  }, [debouncedQuery, disabled, isInputFocused]); // Depend on debouncedQuery, disabled, and isInputFocused

  // Removed the third useEffect that synced with initialValue

  // Handle user typing in the input field
  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    console.log(`handleInput: Setting internalQuery to "${value}"`);
    setInternalQuery(value); // Update internal state immediately

    // Notify parent component about the input change
    onInputChange?.(value);

    // Hide dropdown immediately if the input value changes,
    // it will reappear if new search results warrant it in the fetch effect.
    setIsDropdownVisible(false); // Hide on input change
    // Also clear search results visually until debounce/fetch kicks in
    // setSearchResults(null); // Optional: uncomment if you want results to clear instantly on typing
  }

  // Handle selecting a customer from the dropdown
  function handleSelecting(customer: CustomerData) {
    console.log(`handleSelecting: Customer "${customer.name}" selected.`);
    // Set the input value to the selected customer's name
    setInternalQuery(customer.name);

    // Notify the parent component about the selected customer data
    onCustomerSelect?.(customer);
    customerSelectedRef.current = true; // Mark that a customer has been selected

    // Hide the dropdown
    setIsDropdownVisible(false);
    setSearchResults(null); // Clear search results after selection

    // Blur the input field
    inputRef.current?.blur();
  }

  // Handle input field receiving focus
  const handleFocus = () => {
    console.log("handleFocus: Input focused.");
    setIsInputFocused(true); // Set focus state

    // If there is already text in the input and we have search results, show the dropdown
    // This handles the case where the user focuses the input again after blurring
    if (
      internalQuery.trim().length > 0 &&
      searchResults !== null &&
      searchResults.length > 0
    ) {
      console.log(
        "handleFocus: Input has value and results exist, showing dropdown.",
      );
      setIsDropdownVisible(true);
    } else if (
      internalQuery.trim().length > 0 &&
      searchResults === null &&
      !isFetching &&
      debouncedQuery.trim() !== internalQuery.trim()
    ) {
      // If input has value, no results yet, not fetching, and debounced query is stale,
      // immediately trigger debounce to fetch results on focus.
      console.log(
        "handleFocus: Input has value, no results, not fetching, debounced stale. Triggering fetch.",
      );
      setDebouncedQuery(internalQuery.trim());
      // The fetch effect will show the dropdown if results are found
    } else if (
      internalQuery.trim().length > 0 &&
      searchResults === null &&
      isFetching
    ) {
      // If input has value and we're already fetching, just wait for fetch effect to handle dropdown
      console.log(
        "handleFocus: Input has value, fetching in progress. Waiting for fetch result.",
      );
    }
    // If input is empty, dropdown stays hidden until user types and results arrive
  };

  // Handle input field losing focus
  const handleBlur = () => {
    console.log("handleBlur: Input blurred.");
    // Use a timeout to allow click events on the dropdown items to register
    // before the dropdown is hidden and focus state is reset.
    setTimeout(() => {
      console.log("handleBlur: Timeout finished.");
      setIsInputFocused(false); // Reset focus state
      setIsDropdownVisible(false); // Hide the dropdown
      // Optional: Clear search results on blur if you want to hide results when not focused
      // setSearchResults(null);
    }, 100); // 100ms delay
  };

  // Determine if the floating label should be in the floated state
  // It floats if the input is focused OR if it has a non-empty value
  const shouldLabelFloat = isInputFocused || internalQuery.trim().length > 0;

  // --- Dynamic Class Handling (using state instead of peer) ---
  // Border color based on error, focus, or default
  let borderColor = error
    ? "border-red-500" // Error state
    : isInputFocused
      ? "border-customDarkPink" // Focused state
      : "border-gray-300"; // Default state

  // Label and status text color based on error, focus, or default
  let labelColor = error
    ? "text-red-600" // Error state
    : isInputFocused
      ? "text-customDarkPink" // Focused state
      : "text-gray-500"; // Default state

  // Styles for disabled input
  const inputDisabledStyle = disabled ? "cursor-not-allowed bg-gray-100" : "";

  // Base label classes for position and transition
  const labelBaseClasses =
    "absolute left-3 px-1 font-medium transition-all duration-150 pointer-events-none bg-white whitespace-nowrap"; // Added bg-white

  // Floating label classes for the upper position and size
  // Removed z-10 from here, apply dynamically below
  const labelFloatedClasses = "top-0 -translate-y-1/2 text-sm";

  // Combine base and floated label classes based on state
  const labelClasses = `${labelBaseClasses}
     ${labelColor}
     ${shouldLabelFloat ? labelFloatedClasses : "top-1/2 -translate-y-1/2 text-base"} // Apply floated or base position/size
     ${shouldLabelFloat ? "z-10" : "z-0"} // Apply z-index based on float state
     ${disabled ? "cursor-not-allowed text-gray-400" : "cursor-text"}
     `;
  // Using text-sm/text-base and z-10/z-0 conditionally based on shouldLabelFloat

  return (
    <div className="relative w-full">
      <div className="relative w-full">
        <input
          ref={inputRef}
          name="customer_display"
          id="customer-input"
          value={internalQuery} // Controlled by React state
          onChange={handleInput} // Use internal handler
          onFocus={handleFocus} // Use internal handler
          onBlur={handleBlur} // Use internal handler
          autoComplete="off" // Disable browser autocomplete
          // Removed placeholder=" " as we're not using :placeholder-shown
          className={`// Height class relative z-0 h-[50px] w-full rounded-md border-2 bg-white px-2 shadow-sm outline-none transition-colors duration-150 ${borderColor} // Border color based on state ${inputDisabledStyle} // Disabled styles // Add padding-top to make space for floated label ${shouldLabelFloat ? "pt-[1.125rem]" : "py-[0.6rem]"} // Adjust padding based on whether label is floated (pt-5 vs roughly) pt-2.5`}
          aria-invalid={!!error} // Accessibility: indicates if input is invalid
          aria-describedby={error ? "customer-error" : undefined} // Accessibility: links to error message
          disabled={disabled} // Disable input field
          autoFocus={autoFocus} // Auto-focus on mount if prop is true
        />
        {/* The label element */}
        <label
          htmlFor="customer-input" // Link label to input by ID
          className={labelClasses} // Use dynamically generated class string
        >
          Recipient Customer *
        </label>

        {/* Loading spinner positioned inside the input area */}
        {isFetching && (
          <div className="pointer-events-none absolute inset-y-0 right-3 z-10 flex items-center">
            <Loader2 size={20} className="animate-spin text-customDarkPink" />
          </div>
        )}

        {/* Dropdown for search results */}
        {/* Only show if dropdown is visible AND there are search results */}
        {isDropdownVisible && searchResults !== null && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border border-gray-300 bg-white py-2 shadow-lg">
            {searchResults.length > 0
              ? searchResults.map((customer) => (
                  <div
                    key={customer.id}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
                    // Use onMouseDown to prevent input blur before click
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent input blur
                      handleSelecting(customer); // Handle selection
                    }}
                    // onTouchStart is good for touch devices, preventing passive listeners issues
                    onTouchStart={() => handleSelecting(customer)}
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
              : debouncedQuery.trim() !== "" &&
                !isFetching && (
                  // Message displayed when no results are found and fetching is not in progress
                  <div className="px-3 py-2 text-sm italic text-gray-500">
                    No customers found.
                  </div>
                )}
          </div>
        )}
      </div>
      {/* Error message */}
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
