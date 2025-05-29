"use client";

import { useState, useEffect, ChangeEvent, useRef, FocusEvent } from "react";
import { getCustomer as fetchCustomers } from "@/lib/ServerAction";
import type { CustomerWithRecommendations } from "@/lib/Types";

type CustomerData = CustomerWithRecommendations;

interface CustomerInputProps {
  error?: string;
  initialValue?: string;

  onCustomerSelect?: (customer: CustomerData | null) => void;

  onChange?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function CustomerInput({
  error,
  initialValue = "",
  onCustomerSelect,
  onChange,
  disabled = false,
  autoFocus = false,
}: CustomerInputProps) {
  const [internalQuery, setInternalQuery] = useState(initialValue);
  const [debouncedQuery, setDebouncedQuery] = useState(initialValue);
  const [searchResults, setSearchResults] = useState<CustomerData[] | null>(
    null,
  );
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const value = internalQuery.trim();

    if (value === "") {
      setDebouncedQuery("");
      setSearchResults(null);
      setIsDropdownVisible(false);

      onCustomerSelect?.(null);
      return;
    }

    const handler = setTimeout(() => {
      if (inputRef.current && value === inputRef.current.value.trim()) {
        setDebouncedQuery(value);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [internalQuery, onCustomerSelect]);

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
  }, [debouncedQuery, isInputFocused]);

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInternalQuery(value);
    onChange?.(value);
  }

  function handleSelecting(customer: CustomerData) {
    setInternalQuery(customer.name);

    onCustomerSelect?.(customer);

    setIsDropdownVisible(false);
    setSearchResults(null);

    inputRef.current?.blur();
  }

  const handleFocus = () => {
    setIsInputFocused(true);

    if (internalQuery.trim().length > 0 && searchResults !== null) {
      setIsDropdownVisible(true);
    } else if (
      internalQuery.trim().length > 0 &&
      searchResults === null &&
      debouncedQuery.trim() !== internalQuery.trim()
    ) {
      setDebouncedQuery(internalQuery.trim());
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsInputFocused(false);
      setIsDropdownVisible(false);
    }, 100);
  };

  useEffect(() => {
    setInternalQuery(initialValue ?? "");

    if (initialValue === "") {
      setDebouncedQuery("");
      setSearchResults(null);
    } else {
      setDebouncedQuery(initialValue ?? "");
    }
  }, [initialValue]);

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

  const inputDisabledStyle = disabled ? "cursor-not-allowed bg-gray-100" : "";

  return (
    <div className="relative w-full">
      <div className="relative w-full">
        <input
          ref={inputRef}
          name="customer_display"
          id="customer-input"
          value={internalQuery}
          onChange={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
          placeholder=" "
          className={`peer relative z-0 h-[50px] w-full rounded-md border-2 bg-white ${borderColor} px-2 shadow-custom outline-none transition-colors duration-150 ${inputDisabledStyle}`}
          aria-invalid={!!error}
          aria-describedby={error ? "customer-error" : undefined}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <label
          htmlFor="customer-input"
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 cursor-text bg-white px-1 text-base font-medium transition-all duration-150 ${labelColor} peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-sm peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-sm peer-focus:${error ? "text-red-600" : "text-customDarkPink"} ${disabled ? "cursor-not-allowed text-gray-400" : ""}`}
        >
          Recipient Customer *
        </label>

        {}
        {isDropdownVisible && searchResults !== null && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border border-gray-300 bg-white py-2 shadow-lg">
            {searchResults.length > 0
              ? searchResults.map((customer) => (
                  <div
                    key={customer.id}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelecting(customer);
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
                  <div className="px-3 py-2 text-sm italic text-gray-500">
                    No customers found.
                  </div>
                )}
          </div>
        )}
      </div>
      {}
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
