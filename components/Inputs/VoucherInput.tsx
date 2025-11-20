"use client";

import { getVoucher } from "@/lib/ServerAction";
import { ChangeEvent, useEffect, useState, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { Loader2 } from "lucide-react";

export default function VoucherInput({ disabled }: { disabled?: boolean }) {
  const [inputValue, setInputValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");

  // State to track input focus
  const [isFocused, setIsFocused] = useState(false);

  const [voucherStatus, setVoucherStatus] = useState<null | {
    status: boolean;
    value?: number;
    code?: string;
    error?: string;
  }>(null);
  const [isFetching, setIsFetching] = useState(false);

  const dispatch = useDispatch<AppDispatch>();

  const reduxVoucherCode = useSelector(
    (state: RootState) => state.cashier.voucherCode,
  );

  // REMOVED: The problematic useEffect that was clearing input on change when reduxVoucherCode was empty.

  // Effect to handle input changes, debouncing, and disabling
  // Also handles clearing Redux state if the local input becomes empty
  useEffect(() => {
    // If component is disabled, reset all local state and clear Redux state if applicable
    if (disabled) {
      setInputValue("");
      setDebouncedValue("");
      setVoucherStatus(null);
      setIsFetching(false);
      setIsFocused(false);

      // If Redux currently holds a voucher code, clear it
      if (reduxVoucherCode) {
        dispatch(
          cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
        );
      }
      return; // Stop further execution in this effect if disabled
    }

    // If input is empty after trimming, clear debounced value
    // Also, if there was a voucher in Redux state, clear it
    if (inputValue.trim() === "") {
      setDebouncedValue("");
      // If Redux held a code (which must have matched the previous non-empty input), clear it
      if (reduxVoucherCode) {
        dispatch(
          cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
        );
      }
      return;
    }

    // If input is NOT empty, set up the debounce timer
    const handler = setTimeout(() => {
      const trimmedValue = inputValue.trim();
      setDebouncedValue(trimmedValue);
    }, 1000); // 1 second debounce

    // Cleanup function for the timer
    return () => {
      clearTimeout(handler);
    };
  }, [inputValue, dispatch, reduxVoucherCode, disabled]); // Add disabled to dependencies

  // Effect to fetch voucher data when debouncedValue changes
  useEffect(() => {
    // Do nothing if disabled or debounced value is empty
    if (disabled || !debouncedValue) {
      setIsFetching(false);
      return;
    }

    // Prevent unnecessary fetches if the debounced code is already successfully applied in Redux
    // AND the local status state reflects this success AND is for the current debounced value.
    // We also check !isFocused to avoid re-fetching just because the user focused and blurred
    // the input *after* it was already validated and is still the current code.
    if (
      reduxVoucherCode &&
      debouncedValue === reduxVoucherCode &&
      voucherStatus?.status === true &&
      voucherStatus?.code === debouncedValue &&
      !isFocused
    ) {
      setIsFetching(false);
      return;
    }

    // If the local status state exists but is *not* for the current debouncedValue,
    // clear the old status visual before starting the new fetch.
    if (voucherStatus && voucherStatus.code !== debouncedValue) {
      setVoucherStatus(null);
    }

    const fetchVoucher = async () => {
      setIsFetching(true);

      let fetchedData = null;
      let dispatchedSuccess = false;

      try {
        const data = await getVoucher(debouncedValue);
        fetchedData = { ...data, code: debouncedValue };

        if (data.status && data.code && data.value !== undefined) {
          dispatch(
            cashierActions.setVoucher({
              isValid: true,
              value: data.value,
              code: data.code,
            }),
          );
          dispatchedSuccess = true;
        }
      } catch (error) {
        fetchedData = {
          status: false,
          code: debouncedValue,
          error: "Failed to validate code",
        };
      } finally {
        const currentInputValueTrimmed = inputValue.trim();
        if (debouncedValue === currentInputValueTrimmed) {
          if (fetchedData) {
            setVoucherStatus(fetchedData);
          } else {
            setVoucherStatus({
              status: false,
              code: debouncedValue,
              error: "Network error or unexpected response",
            });
          }
        }

        if (!dispatchedSuccess && reduxVoucherCode === debouncedValue) {
          dispatch(
            cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
          );
        }

        setIsFetching(false);
      }
    };

    fetchVoucher();

    // No cleanup needed with current async function structure unless using AbortController
  }, [
    debouncedValue,
    dispatch,
    reduxVoucherCode,
    disabled,
    isFocused, // Add isFocused to dependency array for the skipping logic
    inputValue, // Added inputValue to check against debouncedValue in finally block
  ]);

  // Handlers for input focus and blur
  const handleFocus = useCallback(() => {
    if (!disabled) {
      setIsFocused(true);
    }
  }, [disabled]);

  const handleBlur = useCallback(() => {
    if (!disabled) {
      setIsFocused(false);
      const trimmedValue = inputValue.trim();
      if (trimmedValue !== "" && trimmedValue !== debouncedValue) {
        setDebouncedValue(trimmedValue);
      }
    }
  }, [disabled, inputValue, debouncedValue]);

  const handleInputChanges = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (!disabled) {
        const upperCaseValue = e.target.value.toUpperCase();
        setInputValue(upperCaseValue);
        if (
          !isFetching &&
          (voucherStatus?.code !== upperCaseValue.trim() ||
            voucherStatus === null)
        ) {
          setVoucherStatus(null);
        }
      }
    },
    [disabled, isFetching, voucherStatus],
  );

  // --- Dynamic Class Handling ---
  let borderColor = "border-customDarkPink"; // Default border color
  let statusTextColor = "text-gray-500"; // Default text color for status/label
  let statusIndicator = null; // Element to show fetch status or result info

  // Determine classes based on component state (disabled, fetching, voucher status)
  if (disabled) {
    // Styles when component is disabled
    borderColor = "border-gray-300";
    statusTextColor = "text-gray-400";
    statusIndicator = null; // No status indicator when disabled
  } else if (isFetching) {
    // Styles when data is being fetched
    borderColor = "border-blue-500";
    statusTextColor = "text-blue-500";
    statusIndicator = (
      // Show loading spinner
      <Loader2 size={14} className="mr-1 inline-block animate-spin" />
    );
  } else if (
    // Check if voucherStatus exists AND is for the current value in the input field
    // AND we are NOT currently fetching (to avoid flickering status while fetching)
    !isFetching && // Added !isFetching check
    voucherStatus !== null &&
    voucherStatus.code === inputValue.trim() // Ensure status matches current visible input
  ) {
    if (voucherStatus.status) {
      // Styles for a valid, applied voucher
      borderColor = "border-green-500";
      statusTextColor = "text-green-600";
      statusIndicator = (
        // Show applied discount value
        <span className="text-xs">
          (Applied: -₱{voucherStatus.value?.toLocaleString() || "0"})
        </span>
      );
    } else {
      // Styles for an invalid voucher
      borderColor = "border-red-500";
      statusTextColor = "text-red-600";
      statusIndicator = (
        // Show error message
        <span className="text-xs">({voucherStatus.error || "Invalid"})</span>
      );
    }
  }
  // If none of the above conditions are met (input has value but no status yet, or status is for an old value, or currently fetching),
  // it remains the default borderColor and statusTextColor ("border-customDarkPink", "text-gray-500").

  // Determine if the label should be in the floated state (based on focus or value)
  const shouldLabelFloat = isFocused || inputValue.trim().length > 0;

  // Base classes for the label's position and transition
  const labelBaseClasses =
    "absolute left-3 top-1/2 -translate-y-1/2 px-1 font-medium tracking-wider transition-all duration-150 pointer-events-none "; // Added bg and transition here

  // Classes for the label when it's floated (input is focused or has value)
  // Removed text-xs and z-10 from here, applied conditionally below
  const labelFloatedClasses = "top-[-9px]";

  // Combine base and floated classes based on state
  const labelClasses = `${labelBaseClasses}
    ${statusTextColor}
    ${shouldLabelFloat ? labelFloatedClasses : ""} // Apply floated position
    ${shouldLabelFloat ? "text-xs z-10" : "text-base z-0"} // Apply size and z-index based on float state
    ${disabled ? "cursor-not-allowed" : "cursor-text"}
    `;
  // Adjusted text-base/text-xs and z-index application to be conditional based on shouldLabelFloat

  return (
    <div className="mt-6 flex w-full flex-col">
      <div className="relative w-full">
        <input
          type="text"
          id="voucher-input"
          // Removed placeholder=" "
          onChange={handleInputChanges}
          onFocus={handleFocus} // Add focus handler
          onBlur={handleBlur} // Add blur handler
          disabled={isFetching || disabled} // Disable input while fetching or if component is disabled
          value={inputValue} // Controlled component: input value is tied to state
          className={`// Height classes relative z-0 h-[43px] w-full rounded-md border-2 px-2 shadow-sm outline-none transition-colors duration-150 lg:h-[50px] ${borderColor} ${
            // Determine input text color: status color if status matches current input and not disabled/fetching, grey if disabled, else default
            voucherStatus?.code === inputValue.trim() &&
            !isFetching &&
            !disabled
              ? statusTextColor // Use status color only if status is relevant and not fetching/disabled
              : disabled
                ? "text-gray-400" // Grey text when disabled
                : "text-customBlack" // Default text color
          } // Add padding-top to make space for floated label ${shouldLabelFloat ? "pt-[1.25rem]" : "pt-[0.5rem]"} // Adjusted padding based on whether label is floated - is roughly center pt-[0.5rem] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70`}
          aria-describedby="voucher-status" // Associate input with the status div for accessibility
        />
        {/* The label element */}
        <label
          htmlFor="voucher-input" // Link label to input by ID
          className={labelClasses} // Use dynamically generated class string
        >
          Voucher Code
        </label>
      </div>
      {/* Div to display status messages */}
      <div
        id="voucher-status" // Linked via aria-describedby to the input
        className={`mt-1 flex h-4 items-center pl-1 text-xs ${statusTextColor}`} // Text color matches label/border status color
      >
        {statusIndicator} {/* Render spinner or status text */}
      </div>
    </div>
  );
}
