"use client";

import {
  useState,
  useEffect,
  ChangeEvent,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { getCustomer as fetchCustomers } from "@/lib/ServerAction";
import type { CustomerWithRecommendations } from "@/lib/Types";
import { Loader2 } from "lucide-react";

type CustomerData = CustomerWithRecommendations;

interface CustomerInputProps {
  error?: string;
  initialValue?: string;
  onCustomerSelect?: (customer: CustomerData | null) => void;
  onInputChange?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  debounceMs?: number; // Configurable debounce delay
  minQueryLength?: number; // Minimum characters before searching
}

const DEBOUNCE_DELAY = 400; // Default debounce delay in ms
const MIN_QUERY_LENGTH = 2; // Minimum characters before searching

export default function CustomerInput({
  error,
  initialValue = "",
  onCustomerSelect,
  onInputChange,
  disabled = false,
  autoFocus = false,
  debounceMs = DEBOUNCE_DELAY,
  minQueryLength = MIN_QUERY_LENGTH,
}: CustomerInputProps) {
  const [internalQuery, setInternalQuery] = useState(initialValue ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerData[]>([]);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const customerSelectedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isUserTypingRef = useRef(false);
  const lastInitialValueRef = useRef<string | undefined>(initialValue);

  // Debounce input value for fetching
  useEffect(() => {
    const trimmedValue = internalQuery.trim();

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Reset state if input is empty
    if (trimmedValue === "") {
      setDebouncedQuery("");
      setSearchResults([]);
      setIsDropdownVisible(false);
      if (customerSelectedRef.current) {
        onCustomerSelect?.(null);
        customerSelectedRef.current = false;
      }
      return;
    }

    // Only search if query meets minimum length requirement
    if (trimmedValue.length < minQueryLength) {
      setDebouncedQuery("");
      setSearchResults([]);
      setIsDropdownVisible(false);
      return;
    }

    // Set up debounce timer
    debounceTimerRef.current = setTimeout(() => {
      const currentValue = inputRef.current?.value.trim() ?? "";
      if (
        currentValue === trimmedValue &&
        currentValue.length >= minQueryLength
      ) {
        setDebouncedQuery(currentValue);
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [internalQuery, minQueryLength, debounceMs, onCustomerSelect]);

  // Fetch data when debounced query changes
  useEffect(() => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Reset if no query or disabled
    if (!debouncedQuery || disabled) {
      setSearchResults([]);
      setIsDropdownVisible(false);
      setIsFetching(false);
      return;
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let isCancelled = false;

    async function fetchData() {
      setIsFetching(true);
      setSearchResults([]);

      try {
        const response = await fetchCustomers(debouncedQuery);
        const results = Array.isArray(response) ? response : [];

        // Check if request was cancelled
        if (abortController.signal.aborted || isCancelled) {
          return;
        }

        setSearchResults(results);
        setIsDropdownVisible(results.length > 0 && isInputFocused && !disabled);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        // Only set error state if not cancelled
        if (!abortController.signal.aborted && !isCancelled) {
          setSearchResults([]);
          setIsDropdownVisible(false);
        }
      } finally {
        if (!abortController.signal.aborted && !isCancelled) {
          setIsFetching(false);
        }
      }
    }

    fetchData();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [debouncedQuery, disabled, isInputFocused]);

  // Sync with initialValue changes from parent (only when not typing and value actually changed externally)
  useEffect(() => {
    // Only sync if:
    // 1. User is not currently typing
    // 2. initialValue actually changed from the last known value
    // 3. The new initialValue is different from current internalQuery
    // 4. The change is significant (not just whitespace differences)
    const initialValueTrimmed = initialValue?.trim() ?? "";
    const internalQueryTrimmed = internalQuery.trim();
    const lastInitialValueTrimmed = lastInitialValueRef.current?.trim() ?? "";

    if (
      !isUserTypingRef.current &&
      initialValue !== undefined &&
      initialValueTrimmed !== lastInitialValueTrimmed &&
      initialValueTrimmed !== internalQueryTrimmed
    ) {
      // Only sync if the change is significant (more than just whitespace or case)
      // This prevents syncing when Redux updates due to our own typing
      setInternalQuery(initialValue);
      lastInitialValueRef.current = initialValue;
    } else if (initialValue !== lastInitialValueRef.current) {
      // Update ref to track changes, even if we don't sync
      lastInitialValueRef.current = initialValue;
    }
  }, [initialValue, internalQuery]);

  // Handle user typing in the input field
  const handleInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      isUserTypingRef.current = true;
      setInternalQuery(value);
      // Update the ref to prevent sync effect from resetting
      lastInitialValueRef.current = value;
      onInputChange?.(value);
      setIsDropdownVisible(false);
      // Reset typing flag after a delay to allow external updates
      setTimeout(() => {
        isUserTypingRef.current = false;
      }, 500);
    },
    [onInputChange],
  );

  // Handle selecting a customer from the dropdown
  const handleSelecting = useCallback(
    (customer: CustomerData) => {
      isUserTypingRef.current = false; // Clear typing flag
      setInternalQuery(customer.name);
      lastInitialValueRef.current = customer.name; // Update ref to match
      onCustomerSelect?.(customer);
      customerSelectedRef.current = true;
      setIsDropdownVisible(false);
      setSearchResults([]);
      inputRef.current?.blur();
    },
    [onCustomerSelect],
  );

  // Handle input field receiving focus
  const handleFocus = useCallback(() => {
    setIsInputFocused(true);
    const trimmedQuery = internalQuery.trim();

    if (trimmedQuery.length >= minQueryLength && searchResults.length > 0) {
      setIsDropdownVisible(true);
    } else if (
      trimmedQuery.length >= minQueryLength &&
      searchResults.length === 0 &&
      !isFetching &&
      debouncedQuery !== trimmedQuery
    ) {
      setDebouncedQuery(trimmedQuery);
    }
  }, [
    internalQuery,
    searchResults,
    isFetching,
    debouncedQuery,
    minQueryLength,
  ]);

  // Handle input field losing focus
  const handleBlur = useCallback(() => {
    // Use timeout to allow dropdown clicks to register
    setTimeout(() => {
      setIsInputFocused(false);
      setIsDropdownVisible(false);
    }, 150);
  }, []);

  // Memoize computed styles
  const shouldLabelFloat = useMemo(
    () => isInputFocused || internalQuery.trim().length > 0,
    [isInputFocused, internalQuery],
  );

  const borderColor = useMemo(
    () =>
      error
        ? "border-red-500"
        : isInputFocused
          ? "border-customDarkPink"
          : "border-gray-300",
    [error, isInputFocused],
  );

  const labelColor = useMemo(
    () =>
      error
        ? "text-red-600"
        : isInputFocused
          ? "text-customDarkPink"
          : "text-gray-500",
    [error, isInputFocused],
  );

  const labelClasses = useMemo(
    () =>
      `absolute left-3 px-1 font-medium transition-all duration-150 pointer-events-none bg-white whitespace-nowrap ${labelColor} ${
        shouldLabelFloat
          ? "top-0 -translate-y-1/2 text-sm z-10"
          : "top-1/2 -translate-y-1/2 text-base z-0"
      } ${disabled ? "cursor-not-allowed text-gray-400" : "cursor-text"}`,
    [labelColor, shouldLabelFloat, disabled],
  );

  const inputClasses = useMemo(
    () =>
      `relative z-0 h-[50px] w-full rounded-md border-2 bg-white px-2 shadow-sm outline-none transition-colors duration-150 ${borderColor} ${
        disabled ? "cursor-not-allowed bg-gray-100" : ""
      } ${shouldLabelFloat ? "pt-[1.125rem]" : "py-[0.6rem]"} pt-2.5`,
    [borderColor, disabled, shouldLabelFloat],
  );

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
          className={inputClasses}
          aria-invalid={!!error}
          aria-describedby={error ? "customer-error" : undefined}
          disabled={disabled}
          autoFocus={autoFocus}
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
        {isDropdownVisible && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-md border border-gray-300 bg-white py-2 shadow-lg">
            {searchResults.length > 0
              ? searchResults.map((customer) => (
                  <div
                    key={customer.id}
                    className="cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-gray-100"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelecting(customer);
                    }}
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
