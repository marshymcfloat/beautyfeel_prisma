// components/Inputs/VoucherInput.tsx
"use client";

import { getVoucher } from "@/lib/ServerAction";
import { ChangeEvent, useEffect, useState, useRef } from "react"; // useRef potentially for focus
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState, AppDispatch } from "@/lib/reduxStore"; // Import AppDispatch
import { Loader2 } from "lucide-react";

export default function VoucherInput() {
  // Local state ONLY for the input field's current value and debounce
  const [inputValue, setInputValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState(""); // Renamed for clarity

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
    // If the code in Redux becomes empty, and our input isn't already empty, clear the input
    if (!reduxVoucherCode && inputValue) {
      console.log("VoucherInput: Clearing input due to Redux reset.");
      setInputValue("");
      setDebouncedValue(""); // Clear debounce value too
      setVoucherStatus(null);
      setIsFetching(false);
    }
    // We DON'T want to pre-fill from Redux here, user input drives it.
  }, [reduxVoucherCode]); // Only depend on the Redux value

  // Effect 2: Debounce input changes
  useEffect(() => {
    setIsFetching(false); // Reset fetching on new typing
    // If input is cleared, immediately clear debounce and status
    if (inputValue.trim() === "") {
      setDebouncedValue("");
      setVoucherStatus(null);
      // Also clear the discount in Redux if input is cleared manually
      // Check if redux already has no code to prevent infinite loops
      if (reduxVoucherCode) {
        dispatch(
          cashierActions.setDiscount({ status: false, value: 0, code: "" }),
        );
      }
      return; // Exit early
    }

    // Set timer only if input has content
    const handler = setTimeout(() => {
      setDebouncedValue(inputValue.trim()); // Update debounced value after delay
    }, 1000); // 1 second debounce

    return () => {
      clearTimeout(handler); // Clear timer on cleanup or new input
    };
  }, [inputValue, dispatch, reduxVoucherCode]); // Add dependencies needed inside if block

  // Effect 3: Fetch voucher when debounced value changes
  useEffect(() => {
    // Only fetch if debounced value is not empty
    if (!debouncedValue) {
      return; // No need to fetch or dispatch reset if already handled by input clear
    }

    const fetchVoucher = async () => {
      setIsFetching(true);
      setVoucherStatus(null); // Clear previous status message before fetch
      let dispatched = false; // Flag to ensure dispatch happens only once
      try {
        console.log(`Fetching voucher: ${debouncedValue}`);
        const data = await getVoucher(debouncedValue);
        setVoucherStatus(data); // Update local UI status

        if (data.status && data.code && data.value !== undefined) {
          // Dispatch success to Redux
          dispatch(
            cashierActions.setDiscount({
              status: true,
              value: data.value,
              code: data.code,
            }),
          );
          dispatched = true;
        }
      } catch (error) {
        console.error("Error fetching voucher:", error);
        setVoucherStatus({
          status: false,
          error: "Failed to fetch voucher data",
        });
      } finally {
        // If fetch failed or returned invalid, ensure Redux state is reset
        if (!dispatched) {
          // Check against redux state again to prevent unnecessary dispatches if already reset
          if (reduxVoucherCode) {
            dispatch(
              cashierActions.setDiscount({ status: false, value: 0, code: "" }),
            );
          }
        }
        setIsFetching(false);
      }
    };

    fetchVoucher();
    // Depend only on debouncedValue and dispatch for the fetch action
  }, [debouncedValue, dispatch, reduxVoucherCode]); // Add reduxVoucherCode here to re-check dispatch condition

  // Handle input changes - ONLY update local state
  const handleInputChanges = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value.toUpperCase());
  };

  // --- Determine styles based on local state ---
  let borderColor = "border-customDarkPink";
  let statusTextColor = "text-gray-500";
  let statusIndicator = null;
  const currentDisplayedCode = inputValue || reduxVoucherCode; // Show current input or redux code

  if (isFetching) {
    borderColor = "border-blue-500";
    statusTextColor = "text-blue-500";
    statusIndicator = <Loader2 size={14} className="animate-spin" />;
  } else if (
    voucherStatus !== null &&
    currentDisplayedCode === voucherStatus.code
  ) {
    // Only show status if it matches the currently relevant code (input/redux)
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
  } else if (!currentDisplayedCode) {
    // Reset border if input is empty and not fetching
    borderColor = "border-customDarkPink";
    statusTextColor = "text-gray-500";
  }

  return (
    <div className="relative mt-6 flex w-full flex-col">
      <div className="relative w-full">
        <input
          type="text"
          placeholder=" "
          onChange={handleInputChanges}
          disabled={isFetching}
          value={inputValue} // Input value controlled by LOCAL state
          className={`peer h-[43px] w-full rounded-md border-2 px-2 pt-1 shadow-sm outline-none transition-colors duration-150 lg:h-[50px] ${borderColor} ${voucherStatus?.status && voucherStatus.code === currentDisplayedCode ? "font-medium text-green-600" : voucherStatus?.status === false && voucherStatus.code === currentDisplayedCode ? "text-red-600" : "text-customBlack"} disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-400 disabled:opacity-70`}
          id="voucher-input"
          aria-describedby="voucher-status"
        />
        <label
          htmlFor="voucher-input"
          // Floating label styling adjusted slightly
          className={`absolute left-3 top-[-9px] px-1 text-xs font-medium tracking-wider transition-all duration-150 ${statusTextColor} `}
        >
          Voucher Code
        </label>
      </div>
      <div
        id="voucher-status"
        className={`mt-1 flex h-4 items-center pl-1 text-xs ${statusTextColor}`}
      >
        {statusIndicator}
      </div>
    </div>
  );
}
