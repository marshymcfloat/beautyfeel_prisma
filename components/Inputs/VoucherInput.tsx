"use client";

import { getVoucher } from "@/lib/ServerAction";
import { ChangeEvent, useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { Loader2 } from "lucide-react";

// Added disabled prop to the type definition
export default function VoucherInput({ disabled }: { disabled?: boolean }) {
  // Accept the disabled prop
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
    if (!reduxVoucherCode && inputValue) {
      console.log("VoucherInput: Clearing input due to Redux reset.");
      setInputValue("");
      setDebouncedValue("");
      setVoucherStatus(null);
      setIsFetching(false);
    }
  }, [reduxVoucherCode]);

  // Effect 2: Debounce input changes
  useEffect(() => {
    // If the component is disabled externally, clear local state and stop fetching/debounce
    if (disabled) {
      setInputValue("");
      setDebouncedValue("");
      setVoucherStatus(null);
      setIsFetching(false);
      // Ensure Redux is also cleared if it had a value
      if (reduxVoucherCode) {
        dispatch(
          cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
        );
      }
      return; // Exit early if disabled
    }

    setIsFetching(false);
    setVoucherStatus(null);

    if (inputValue.trim() === "") {
      setDebouncedValue("");
      if (reduxVoucherCode) {
        console.log("VoucherInput: Input cleared, dispatching reset.");
        dispatch(
          cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
        );
      }
      return;
    }

    const handler = setTimeout(() => {
      setDebouncedValue(inputValue.trim());
    }, 1000);

    return () => {
      clearTimeout(handler);
    };
  }, [inputValue, dispatch, reduxVoucherCode, disabled]); // Added disabled to deps

  // Effect 3: Fetch voucher when debounced value changes (and is not empty)
  useEffect(() => {
    // Do not fetch if the component is disabled or if the debounced value is empty
    if (disabled || !debouncedValue) {
      // Added disabled check
      setIsFetching(false); // Ensure fetching stops if disabled or value empty
      return;
    }

    if (
      reduxVoucherCode &&
      debouncedValue === reduxVoucherCode &&
      voucherStatus?.status === true
    ) {
      console.log(
        `VoucherInput: Skipping fetch for already validated code: ${debouncedValue}`,
      );
      setIsFetching(false);
      return;
    }

    const fetchVoucher = async () => {
      console.log(`VoucherInput: Fetching voucher: ${debouncedValue}`);
      setIsFetching(true);
      setVoucherStatus(null);
      let dispatchedSuccess = false;

      try {
        const data = await getVoucher(debouncedValue);
        setVoucherStatus({ ...data, code: debouncedValue });

        if (data.status && data.code && data.value !== undefined) {
          console.log(`VoucherInput: Dispatching success for ${data.code}`);
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
        console.error("Error fetching voucher:", error);
        setVoucherStatus({
          status: false,
          code: debouncedValue,
          error: "Failed to validate code",
        });
      } finally {
        if (!dispatchedSuccess) {
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
        setIsFetching(false);
      }
    };

    fetchVoucher();
  }, [
    debouncedValue,
    dispatch,
    reduxVoucherCode,
    disabled,
    voucherStatus?.status,
  ]); // Added disabled and voucherStatus.status for re-evaluation

  // Handle input changes - ONLY update local state
  const handleInputChanges = (e: ChangeEvent<HTMLInputElement>) => {
    // Prevent input change if disabled
    if (!disabled) {
      setInputValue(e.target.value.toUpperCase());
    }
  };

  // --- Determine styles based on local state and disabled prop ---
  let borderColor = "border-customDarkPink";
  let statusTextColor = "text-gray-500";
  let statusIndicator = null;
  const codeForStatusCheck = voucherStatus?.code;

  if (disabled) {
    // Explicitly handle disabled state styling
    borderColor = "border-gray-300";
    statusTextColor = "text-gray-400";
    statusIndicator = null; // No status indicator when disabled
  } else if (isFetching) {
    borderColor = "border-blue-500";
    statusTextColor = "text-blue-500";
    statusIndicator = <Loader2 size={14} className="animate-spin" />;
  } else if (
    voucherStatus !== null &&
    voucherStatus.code === inputValue.trim() // Check against current input value
  ) {
    if (voucherStatus.status) {
      borderColor = "border-green-500";
      statusTextColor = "text-green-600";
      statusIndicator = (
        <span className="text-xs">
          (Applied: -₱{voucherStatus.value?.toLocaleString() || "0"})
        </span>
      );
    } else {
      borderColor = "border-red-500";
      statusTextColor = "text-red-600";
      statusIndicator = (
        <span className="text-xs">({voucherStatus.error || "Invalid"})</span>
      );
    }
  } else if (!inputValue && !isFetching) {
    borderColor = "border-customDarkPink";
    statusTextColor = "text-gray-500";
  } else if (inputValue && !isFetching && !voucherStatus) {
    // Input has value, not fetching, but no validated status yet (debouncing or new input)
    borderColor = "border-customDarkPink";
    statusTextColor = "text-gray-500";
  } else if (
    inputValue &&
    !isFetching &&
    voucherStatus &&
    voucherStatus.code !== inputValue.trim()
  ) {
    // Input has value, not fetching, has an old status but it doesn't match current input (user typed further)
    borderColor = "border-customDarkPink";
    statusTextColor = "text-gray-500";
  }

  // Base label classes
  const labelBaseClasses =
    "absolute left-3 top-1/2 -translate-y-1/2 px-1 text-base font-medium tracking-wider transition-all duration-150 pointer-events-none";
  // Classes for the floated label state (when focused or has value)
  const labelFloatedClasses = "top-[-9px] text-xs z-10";

  return (
    <div className="mt-6 flex w-full flex-col">
      <div className="relative w-full">
        <input
          type="text"
          id="voucher-input"
          placeholder=" "
          onChange={handleInputChanges}
          // Disable if fetching *or* if disabled prop is true
          disabled={isFetching || disabled} // Apply the disabled prop here
          value={inputValue}
          // Combined class string for input border and text color based on dynamic state
          className={`peer relative z-0 h-[43px] w-full rounded-md border-2 px-2 pt-1 shadow-sm outline-none transition-colors duration-150 lg:h-[50px] ${borderColor} ${
            // Text color inside input matches status color if status code matches current input
            voucherStatus?.code === inputValue.trim()
              ? statusTextColor // Use the calculated status color if it matches
              : disabled
                ? "text-gray-400" // Gray text if disabled
                : "text-customBlack" // Default text color
          } disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70`}
          aria-describedby="voucher-status"
        />
        <label
          htmlFor="voucher-input"
          // Combine base, floated state (controlled by peer), and dynamic color classes
          className={`${labelBaseClasses} ${statusTextColor} bg-customOffWhite peer-focus:${statusTextColor} peer-[:not(:placeholder-shown)]:${statusTextColor} peer-focus:${labelFloatedClasses} peer-[:not(:placeholder-shown)]:${labelFloatedClasses} ${disabled ? "cursor-not-allowed" : "cursor-text"} `}
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
