// components/Inputs/CustomerInput.tsx
"use client";

import { useState, useEffect, ChangeEvent, useRef } from "react"; // Import useRef
import { useSelector, useDispatch } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice"; // Correct action import
import { RootState, AppDispatch } from "@/lib/reduxStore"; // Import AppDispatch
import { getCustomer as fetchCustomers } from "@/lib/ServerAction"; // Assuming this is correct

type CustomerData = {
  id: string;
  name: string;
  email: string | null;
};

export default function CustomerInput({ error }: { error?: string }) {
  // Keep internal state for suggestions, separate from Redux 'name'
  const [internalQuery, setInternalQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerData[] | null>(
    null,
  );
  const [isDropdownVisible, setIsDropdownVisible] = useState(false); // Control visibility

  const dispatch = useDispatch<AppDispatch>();
  const reduxNameState = useSelector((state: RootState) => state.cashier.name);
  const inputRef = useRef<HTMLInputElement>(null); // Ref for the input element

  // Debounce effect for triggering search
  useEffect(() => {
    const handler = setTimeout(() => {
      // Trigger search based on internal query, not redux state directly
      setDebouncedQuery(internalQuery.trim());
    }, 500); // Debounce time

    return () => clearTimeout(handler);
  }, [internalQuery]); // Depend on the internal input value

  // Fetch data when debouncedQuery changes
  useEffect(() => {
    async function fetchData() {
      // Only fetch if debounced query is not empty
      if (debouncedQuery) {
        try {
          const response = await fetchCustomers(debouncedQuery);
          setSearchResults(response ?? []);
          if (response && response.length > 0) {
            setIsDropdownVisible(true); // Show dropdown if results found
          } else {
            setIsDropdownVisible(false); // Hide if no results
          }
        } catch (err) {
          console.error("Failed to fetch customers:", err);
          setSearchResults([]);
          setIsDropdownVisible(false);
        }
      } else {
        setSearchResults(null); // Clear results if query is empty
        setIsDropdownVisible(false);
      }
    }

    fetchData();
  }, [debouncedQuery]); // Depend on the debounced query

  // Handle direct input changes
  function handleInputChanges(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInternalQuery(value); // Update internal query state immediately
    dispatch(cashierActions.setCustomerName(value)); // Update Redux state immediately
    // Don't hide dropdown immediately on typing
  }

  // Handle selecting a suggestion
  function handleSelecting(name: string, email: string | null) {
    // --- Use setCustomerName ---
    dispatch(cashierActions.setCustomerName(name));
    // Dispatch email update
    dispatch(cashierActions.setEmail(email ?? "")); // Use empty string if email is null

    // Clear internal state and hide dropdown
    setInternalQuery(name); // Update internal query to selected name to avoid re-triggering search
    setDebouncedQuery(name); // Prevent fetch flicker
    setSearchResults(null);
    setIsDropdownVisible(false);

    // Optional: Blur the input
    inputRef.current?.blur();
  }

  // Handle losing focus (blur) - use timeout to allow click on suggestion
  const handleBlur = () => {
    setTimeout(() => {
      setIsDropdownVisible(false); // Hide dropdown after a delay
    }, 150); // Delay in ms
  };

  // Handle gaining focus - potentially show recent/cached results? (optional)
  const handleFocus = () => {
    // If there's a query and results exist, show dropdown again
    if (debouncedQuery && searchResults && searchResults.length > 0) {
      setIsDropdownVisible(true);
    }
  };

  return (
    <div className="relative mt-8 flex w-full flex-col items-center">
      <div className="relative w-[90%]">
        {" "}
        {/* Container for input and label */}
        <input
          ref={inputRef} // Attach ref
          name="customer"
          id="customer-input"
          value={reduxNameState} // Input value controlled by Redux state
          onChange={handleInputChanges} // Updates internal and Redux state
          onBlur={handleBlur} // Hides dropdown on blur
          onFocus={handleFocus} // Re-shows dropdown on focus if results exist
          autoComplete="off"
          required
          placeholder=" " // For label animation
          className={`peer h-[50px] w-full rounded-md border-2 ${error ? "border-red-500" : "border-customDarkPink"} px-2 shadow-custom outline-none transition-colors duration-150`}
          aria-invalid={!!error}
          aria-describedby={error ? "customer-error" : undefined}
        />
        <label
          htmlFor="customer-input"
          className={`absolute left-3 top-1/2 -translate-y-1/2 px-1 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:text-sm peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:text-sm peer-[&:not(:placeholder-shown)]:tracking-widest ${error ? "text-red-600" : "text-gray-600"} peer-focus:text-customDarkPink`}
        >
          Customer Name *
        </label>
        {/* Suggestions Dropdown - Controlled by isDropdownVisible */}
        {isDropdownVisible && searchResults && searchResults.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border-2 border-customDarkPink bg-white py-2 shadow-lg">
            {searchResults.map((customer) => (
              <div
                key={customer.id}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-customLightBlue" // Use theme hover color
                // Use onMouseDown to register click before onBlur hides dropdown
                onMouseDown={() =>
                  handleSelecting(customer.name, customer.email)
                }
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
          className="-mt-1 w-[90%] self-start pl-1 pt-1 text-xs text-red-600"
        >
          {" "}
          {/* Use theme error color */}
          {error}
        </p>
      )}
    </div>
  );
}
