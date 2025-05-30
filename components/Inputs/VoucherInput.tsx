"use client";

import { getVoucher } from "@/lib/ServerAction";
import { ChangeEvent, useEffect, useState, useRef } from "react";
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
      console.log("VoucherInput: Disabled prop is true, resetting state.");
      setInputValue("");
      setDebouncedValue("");
      setVoucherStatus(null);
      setIsFetching(false);
      setIsFocused(false); // Ensure focus state is reset when disabled

      // If Redux currently holds a voucher code, clear it
      if (reduxVoucherCode) {
        console.log(
          "VoucherInput: Dispatching Redux reset due to disabled prop.",
        );
        dispatch(
          cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
        );
      }
      return; // Stop further execution in this effect if disabled
    }

    // If input is empty after trimming, clear debounced value
    // Also, if there was a voucher in Redux state, clear it
    if (inputValue.trim() === "") {
      console.log("VoucherInput: Input is empty, clearing debounced value.");
      setDebouncedValue("");
      // If Redux held a code (which must have matched the previous non-empty input), clear it
      if (reduxVoucherCode) {
        console.log("VoucherInput: Input cleared, dispatching Redux reset.");
        dispatch(
          cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
        );
      }
      // No need to set up debounce timer if input is empty, return here.
      return;
    }

    // If input is NOT empty, set up the debounce timer
    const handler = setTimeout(() => {
      const trimmedValue = inputValue.trim();
      console.log(
        `VoucherInput: Debounce finished, setting debounced value to: ${trimmedValue}`,
      );
      setDebouncedValue(trimmedValue);
    }, 1000); // 1 second debounce

    // Cleanup function for the timer
    return () => {
      console.log("VoucherInput: Clearing debounce timeout.");
      clearTimeout(handler);
    };
  }, [inputValue, dispatch, reduxVoucherCode, disabled]); // Add disabled to dependencies

  // Effect to fetch voucher data when debouncedValue changes
  useEffect(() => {
    // Do nothing if disabled or debounced value is empty
    if (disabled || !debouncedValue) {
      console.log(
        "VoucherInput: Skipping fetch - disabled or empty debounced value.",
      );
      setIsFetching(false); // Ensure fetching is false if conditions aren't met
      return;
    }

    // Prevent unnecessary fetches if the debounced code is already successfully applied in Redux
    // AND the local status state reflects this success AND is for the current debounced value.
    // We also check !isFocused to avoid re-fetching just because the user focused and blurred
    // the input *after* it was already validated and is still the current code.
    if (
      reduxVoucherCode &&
      debouncedValue === reduxVoucherCode && // Redux code matches debounced value
      voucherStatus?.status === true && // Local status indicates valid
      voucherStatus?.code === debouncedValue && // Local status is for this code
      !isFocused // Input is not currently focused
    ) {
      console.log(
        `VoucherInput: Skipping fetch for already validated code: ${debouncedValue}`,
      );
      setIsFetching(false); // Ensure fetching is false if skipping
      return;
    }

    // If the local status state exists but is *not* for the current debouncedValue,
    // clear the old status visual before starting the new fetch.
    if (voucherStatus && voucherStatus.code !== debouncedValue) {
      console.log(
        `VoucherInput: Clearing old status (code: ${voucherStatus.code}) for new fetch (${debouncedValue})`,
      );
      setVoucherStatus(null);
    }

    const fetchVoucher = async () => {
      console.log(`VoucherInput: Fetching voucher: ${debouncedValue}`);
      setIsFetching(true);

      let fetchedData = null; // To hold the result of the fetch
      let dispatchedSuccess = false; // Flag to track if a valid voucher was dispatched to Redux

      try {
        const data = await getVoucher(debouncedValue);
        // Always associate the status/data with the debounced code that triggered the fetch
        fetchedData = { ...data, code: debouncedValue };
        console.log("VoucherInput: Fetch successful:", fetchedData);

        if (data.status && data.code && data.value !== undefined) {
          console.log(
            `VoucherInput: Fetch indicates valid code: ${data.code}. Dispatching success.`,
          );
          dispatch(
            cashierActions.setVoucher({
              isValid: true,
              value: data.value,
              code: data.code,
            }),
          );
          dispatchedSuccess = true; // Set flag on successful dispatch
        } else {
          console.log(
            `VoucherInput: Fetch indicates invalid code: ${debouncedValue}`,
            data,
          );
        }
      } catch (error) {
        console.error("VoucherInput: Error fetching voucher:", error);
        // Store error state, still associated with the attempted code
        fetchedData = {
          status: false,
          code: debouncedValue,
          error: "Failed to validate code",
        };
      } finally {
        // Always update local voucherStatus state after fetch attempt
        // Ensure we only set status if it matches the *current* debounced value,
        // in case a new fetch started before this one finished. This prevents
        // showing results for a code the user already deleted or changed.
        const currentInputValueTrimmed = inputValue.trim(); // Get the current input value
        if (debouncedValue === currentInputValueTrimmed) {
          console.log(
            `VoucherInput: Applying fetch result for "${debouncedValue}" as it matches current input.`,
          );
          if (fetchedData) {
            setVoucherStatus(fetchedData);
          } else {
            // Fallback if fetch promise rejected or data was unexpected
            setVoucherStatus({
              status: false,
              code: debouncedValue,
              error: "Network error or unexpected response",
            });
          }
        } else {
          // If input value changed while fetching, don't update status with old result
          console.log(
            `VoucherInput: Fetch result for "${debouncedValue}" ignored. Current input is now "${currentInputValueTrimmed}".`,
          );
          // If the fetch result was successful but the input changed,
          // make sure Redux state is consistent. This might be an edge case.
          // If the Redux code *was* the debouncedValue, but the input changed,
          // maybe the Redux state should reflect the *new* input state eventually?
          // For simplicity now, we just skip updating local status and handle Redux below.
        }

        // If a valid voucher was NOT dispatched to Redux during this fetch,
        // AND the code that *was* fetched for (`debouncedValue`) matches the one currently in Redux,
        // it means the Redux code (which matched the old debounced value) is now invalid or couldn't be re-validated.
        // In this case, we should clear it from Redux.
        // Note: If the user types a new code and the old Redux code is different,
        // this check correctly *doesn't* clear the old Redux code until the new code
        // is successfully validated OR the input field is cleared.
        if (!dispatchedSuccess && reduxVoucherCode === debouncedValue) {
          console.log(
            `VoucherInput: Fetch failed/invalid for ${debouncedValue}, and it matches Redux code. Dispatching Redux reset.`,
          );
          dispatch(
            cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
          );
        } else if (!dispatchedSuccess) {
          console.log(
            `VoucherInput: Fetch failed/invalid for ${debouncedValue}, but Redux code (${reduxVoucherCode}) is different or empty. No Redux reset needed for Redux state based on this fetch result.`,
          );
        }
        // If dispatchedSuccess is true, the setVoucher action already handled updating Redux.

        setIsFetching(false); // Always set fetching to false when done
        console.log(
          `VoucherInput: Fetch process for "${debouncedValue}" finished.`,
        );
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
  const handleFocus = () => {
    console.log("VoucherInput: Input focused.");
    if (!disabled) {
      setIsFocused(true);
    }
  };

  const handleBlur = () => {
    console.log("VoucherInput: Input blurred.");
    if (!disabled) {
      setIsFocused(false);
      // Re-trigger debounce logic immediately on blur if there's input
      // This ensures validation runs even if the user just types and blurs quickly
      const trimmedValue = inputValue.trim();
      if (trimmedValue !== "" && trimmedValue !== debouncedValue) {
        console.log(
          `VoucherInput: Input blurred with new value "${trimmedValue}", immediately triggering debounce.`,
        );
        setDebouncedValue(trimmedValue);
      } else if (trimmedValue === "") {
        // If input is empty on blur, the second useEffect handles clearing
        console.log(
          "VoucherInput: Input blurred empty. Second useEffect will handle cleanup.",
        );
      } else {
        // Input is not empty and matches current debounced value, no action needed on blur
        console.log(
          "VoucherInput: Input blurred, value matches debounced value. No action needed.",
        );
      }
    }
  };

  const handleInputChanges = (e: ChangeEvent<HTMLInputElement>) => {
    console.log(`VoucherInput: Input changed: ${e.target.value}`);
    // Allow changing input only if not disabled
    if (!disabled) {
      const upperCaseValue = e.target.value.toUpperCase();
      // Update input value state (which triggers the debouncing effect in the second useEffect)
      setInputValue(upperCaseValue);
      // Clear local status instantly when input changes, except if currently fetching
      // This provides immediate feedback that the current status might be stale.
      // Check against the new value to avoid flickering if typing fast.
      if (
        !isFetching &&
        (voucherStatus?.code !== upperCaseValue.trim() ||
          voucherStatus === null)
      ) {
        console.log("VoucherInput: Input changed, clearing local status.");
        setVoucherStatus(null);
      } else if (isFetching) {
        console.log(
          "VoucherInput: Input changed while fetching, status will update after fetch.",
        );
      } else {
        console.log(
          "VoucherInput: Input changed, but status already matches new value or is being fetched.",
        );
      }
    }
  };

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
