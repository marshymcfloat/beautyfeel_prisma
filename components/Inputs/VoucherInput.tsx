// components/Inputs/VoucherInput.tsx
"use client";

import { getVoucher } from "@/lib/ServerAction";
import { ChangeEvent, useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { Loader2 } from "lucide-react";

export default function VoucherInput() {
  // Local state ONLY for the input field's current value and debounce
  const [inputValue, setInputValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");

  // Local state for UI feedback (loading, validation status)
  const [voucherStatus, setVoucherStatus] = useState<null | {
    status: boolean;
    value?: number;
    code?: string; // Code that was validated
    error?: string;
  }>(null);
  const [isFetching, setIsFetching] = useState(false);

  const dispatch = useDispatch<AppDispatch>();
  // Get voucher code from Redux ONLY to detect external resets
  const reduxVoucherCode = useSelector(
    (state: RootState) => state.cashier.voucherCode,
  );

  // Effect 1: Detect EXTERNAL resets (e.g., cashierActions.reset())
  useEffect(() => {
    // If the code in Redux becomes empty, AND our input field has text, clear the local input state.
    // This syncs the input field visually when Redux is reset externally.
    if (!reduxVoucherCode && inputValue) {
      // Check inputValue *inside*
      console.log("VoucherInput: Clearing input due to Redux reset.");
      setInputValue("");
      setDebouncedValue(""); // Clear debounce value too
      setVoucherStatus(null); // Reset local status display
      setIsFetching(false); // Ensure loading stops if reset happens mid-fetch cycle
    }
    // We DON'T pre-fill from Redux. User input drives the value.
  }, [reduxVoucherCode]); // *** REMOVED inputValue from dependencies ***

  // Effect 2: Debounce input changes
  useEffect(() => {
    setIsFetching(false); // Reset fetching indicator immediately on new typing
    setVoucherStatus(null); // Clear previous status message immediately on new typing

    // If input is manually cleared by the user
    if (inputValue.trim() === "") {
      setDebouncedValue(""); // Clear the value that triggers fetch

      // If Redux *still* has a voucher code, dispatch action to clear it.
      // This handles the case where user deletes a valid code manually.
      if (reduxVoucherCode) {
        console.log("VoucherInput: Input cleared, dispatching reset.");
        dispatch(
          cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
        );
      }
      return; // Exit early, no need for debounce timer
    }

    // --- Input has text, set up debounce timer ---
    const handler = setTimeout(() => {
      // Only update debouncedValue if input hasn't changed further during the delay
      setDebouncedValue(inputValue.trim());
    }, 1000); // 1 second debounce

    // Cleanup function: Clear the timeout if inputValue changes before delay ends,
    // or when the component unmounts.
    return () => {
      clearTimeout(handler);
    };
    // This effect should run whenever the user types
  }, [inputValue, dispatch, reduxVoucherCode]); // Keep reduxVoucherCode dependency for the clearing logic check

  // Effect 3: Fetch voucher when debounced value changes (and is not empty)
  useEffect(() => {
    // Only fetch if debouncedValue has content.
    if (!debouncedValue) {
      // If debouncedValue is cleared (e.g., by Effect 2), ensure fetching stops
      // and potentially clear status if needed (though Effect 2 might handle this)
      setIsFetching(false);
      // No need to dispatch reset here, Effect 2 handles clearing based on inputValue
      return;
    }

    // Prevent fetching if the debounced value is the same as the code already validated in Redux
    if (
      reduxVoucherCode &&
      debouncedValue === reduxVoucherCode &&
      voucherStatus?.status === true
    ) {
      console.log(
        `VoucherInput: Skipping fetch for already validated code: ${debouncedValue}`,
      );
      // Ensure UI reflects the existing valid status
      setIsFetching(false);
      // You might want to re-assert the local voucherStatus here if it could be cleared by typing
      // but for simplicity, let's assume Effect 2 handles status clearing on typing correctly.
      return;
    }

    const fetchVoucher = async () => {
      console.log(`VoucherInput: Fetching voucher: ${debouncedValue}`);
      setIsFetching(true);
      setVoucherStatus(null); // Clear previous status message before new fetch
      let dispatchedSuccess = false;

      try {
        const data = await getVoucher(debouncedValue);
        // Update local UI status based on the fetch result for the *debounced code*
        setVoucherStatus({ ...data, code: debouncedValue });

        if (data.status && data.code && data.value !== undefined) {
          // Dispatch success to Redux
          console.log(`VoucherInput: Dispatching success for ${data.code}`);
          dispatch(
            cashierActions.setVoucher({
              isValid: true,
              value: data.value,
              code: data.code, // Use code from server response (might have different casing)
            }),
          );
          dispatchedSuccess = true;
        }
      } catch (error) {
        console.error("Error fetching voucher:", error);
        // Set local UI status to error state for the *debounced code*
        setVoucherStatus({
          status: false,
          code: debouncedValue,
          error: "Failed to validate code", // More specific error?
        });
      } finally {
        // If fetch failed or returned invalid status
        if (!dispatchedSuccess) {
          // Check if Redux currently holds a code AND if that code is the one we just failed to validate
          if (reduxVoucherCode && reduxVoucherCode === debouncedValue) {
            console.log(
              `VoucherInput: Fetch failed/invalid for ${debouncedValue}, dispatching reset as it matches Redux.`,
            );
            dispatch(
              cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
            );
          } else {
            console.log(
              `VoucherInput: Fetch failed/invalid for ${debouncedValue}, but Redux code (${reduxVoucherCode}) is different or empty. No Redux reset needed.`,
            );
          }
        }
        setIsFetching(false); // Stop loading indicator
      }
    };

    fetchVoucher();
    // This effect runs only when the debounced value changes
  }, [debouncedValue, dispatch, reduxVoucherCode]); // Keep reduxVoucherCode for the reset logic inside finally

  // Handle input changes - ONLY update local state
  const handleInputChanges = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value.toUpperCase());
  };

  // --- Determine styles based on local state ---
  let borderColor = "border-customDarkPink";
  let statusTextColor = "text-gray-500"; // Default label color when not focused/no value
  let statusIndicator = null;
  // Use the code associated with the *current status* for display matching
  const codeForStatusCheck = voucherStatus?.code;

  if (isFetching) {
    borderColor = "border-blue-500";
    statusTextColor = "text-blue-500"; // Color for label when fetching
    statusIndicator = <Loader2 size={14} className="animate-spin" />;
  } else if (
    voucherStatus !== null &&
    voucherStatus.code === inputValue.trim()
  ) {
    // Match status strictly with current trimmed input
    // Only show status if it matches the code *currently typed* (after trim)
    if (voucherStatus.status) {
      borderColor = "border-green-500";
      statusTextColor = "text-green-600"; // Color for label when valid
      statusIndicator = (
        <span className="text-xs">
          (Applied: -₱{voucherStatus.value?.toLocaleString() || "0"})
        </span>
      );
    } else {
      borderColor = "border-red-500";
      statusTextColor = "text-red-600"; // Color for label when invalid
      statusIndicator = (
        <span className="text-xs">({voucherStatus.error || "Invalid"})</span>
      );
    }
  } else if (!inputValue && !isFetching) {
    // Check inputValue directly for empty state styling
    // Reset border if input is truly empty and not fetching
    borderColor = "border-customDarkPink";
    statusTextColor = "text-gray-500"; // Back to default gray if empty
  } else if (inputValue && !isFetching && !voucherStatus) {
    // Input has value, not fetching, but no status yet (debouncing, or initial state)
    borderColor = "border-customDarkPink"; // Or maybe a neutral color like border-gray-400?
    statusTextColor = "text-gray-500";
  }

  // Base label classes for positioning and transition
  const labelBaseClasses =
    "absolute left-3 top-1/2 -translate-y-1/2 cursor-text px-1 text-base font-medium tracking-wider transition-all duration-150 pointer-events-none";
  // Classes for the floated label state (when focused or has value)
  const labelFloatedClasses = "top-[-9px] text-xs  z-10";

  return (
    <div className="mt-6 flex w-full flex-col">
      {/* Added relative positioning here */}
      <div className="relative w-full">
        <input
          type="text"
          id="voucher-input"
          placeholder=" " // Crucial: Must have placeholder (even empty space) for :placeholder-shown
          onChange={handleInputChanges}
          disabled={isFetching}
          value={inputValue} // Controlled by local state
          // Added z-0 to input
          className={`peer relative z-0 h-[43px] w-full rounded-md border-2 px-2 pt-1 shadow-sm outline-none transition-colors duration-150 lg:h-[50px] ${borderColor} ${
            // Text color inside input based on validation status matching *current input*
            voucherStatus?.status && voucherStatus.code === inputValue.trim()
              ? "font-medium text-green-600"
              : voucherStatus?.status === false &&
                  voucherStatus.code === inputValue.trim()
                ? "text-red-600"
                : "text-customBlack" // Default text color
          } disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 disabled:opacity-70`}
          aria-describedby="voucher-status"
        />
        <label
          htmlFor="voucher-input"
          // Combine base, floated state (controlled by peer), and dynamic color classes
          // Ensure statusTextColor applies correctly in both states
          className={`${labelBaseClasses} ${statusTextColor} peer-focus:top-[-9px] peer-focus:z-10 peer-focus:text-xs peer-focus:${statusTextColor} peer-[:not(:placeholder-shown)]:top-[-9px] peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:${statusTextColor} `}
        >
          Voucher Code
        </label>
      </div>
      <div
        id="voucher-status"
        // Status text color should match the label's current color logic
        className={`mt-1 flex h-4 items-center pl-1 text-xs ${statusTextColor}`}
      >
        {statusIndicator}
      </div>
    </div>
  );
}
