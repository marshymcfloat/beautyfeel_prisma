"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { useSelector, useDispatch } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState } from "@/lib/reduxStore";
import { getCustomer as fetchCustomers } from "@/lib/ServerAction";

type CustomerData = {
  id: string;
  name: string;
  email: string | null; // Allow null email based on schema
};

// Add error prop
export default function CustomerInput({ error }: { error?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerData[] | null>(
    null,
  );
  const dispatch = useDispatch();
  const reduxNameState = useSelector((state: RootState) => state.cashier.name);

  // Debounce search query update based on Redux state
  useEffect(() => {
    const handler = setTimeout(() => {
      // Only trigger search if the redux state is not empty
      if (reduxNameState && reduxNameState.trim()) {
        setSearchQuery(reduxNameState.trim());
      } else {
        // Clear search if redux state is empty
        setSearchQuery("");
        setSearchResults(null);
      }
    }, 500); // Debounce time

    return () => clearTimeout(handler);
  }, [reduxNameState]);

  // Fetch data when debounced searchQuery changes
  useEffect(() => {
    async function fetchData() {
      if (searchQuery) {
        try {
          const response = await fetchCustomers(searchQuery);
          setSearchResults(response ?? []); // Ensure it's an array
        } catch (err) {
          console.error("Failed to fetch customers:", err);
          setSearchResults([]); // Set empty on error
        }
      } else {
        setSearchResults(null); // Clear results if query is empty
      }
    }

    fetchData();
  }, [searchQuery]);

  function handleInputChanges(e: ChangeEvent<HTMLInputElement>) {
    dispatch(cashierActions.setCustomerName(e.target.value));
    // If user clears input, immediately clear search results
    if (e.target.value.trim() === "") {
      setSearchQuery("");
      setSearchResults(null);
    }
  }

  function handleSelecting(name: string, email: string | null) {
    dispatch(cashierActions.selectCustomerSuggestion(name));
    // Dispatch email even if it's null
    dispatch(cashierActions.setEmail(email ?? "")); // Send empty string if null to Redux
    setSearchResults(null);
  }

  // Clear suggestions on blur after a short delay to allow clicks
  const handleBlur = () => {
    setTimeout(() => {
      setSearchResults(null);
    }, 150); // Small delay
  };

  return (
    <div className="relative mt-8 flex w-full flex-col items-center">
      <div className="relative w-[90%]">
        {" "}
        {/* Container for input and label */}
        <input
          name="customer"
          id="customer-input" // Add id for label association
          value={reduxNameState}
          onChange={handleInputChanges}
          autoComplete="off"
          required // Keep HTML5 required for basic browser hints if desired
          onBlur={handleBlur}
          placeholder=" " // For label animation
          // Apply error styling conditionally
          className={`peer h-[50px] w-full rounded-md border-2 ${
            error ? "border-red-500" : "border-customDarkPink" // Use error prop for border
          } px-2 shadow-custom outline-none transition-colors duration-150`}
        />
        <label
          htmlFor="customer-input" // Associate label
          // Adjust label styling for error state if needed
          className={`absolute left-3 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:text-sm peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:text-sm peer-[&:not(:placeholder-shown)]:tracking-widest ${
            error ? "text-red-600" : "text-gray-600" // Use error prop for text color
          } peer-focus:text-customDarkPink`}
        >
          Customer Name * {/* Indicate required */}
        </label>
        {/* Suggestions dropdown */}
        {searchResults && searchResults.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border-2 border-customDarkPink bg-white py-2 shadow-lg">
            {searchResults.map((customer) => (
              <div
                key={customer.id}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-200"
                // Use onMouseDown to register click before onBlur hides the dropdown
                onMouseDown={() =>
                  handleSelecting(customer.name, customer.email)
                }
              >
                <span className="font-medium">{customer.name}</span>
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
        <p className="-mt-1 w-[90%] self-start pl-1 pt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
