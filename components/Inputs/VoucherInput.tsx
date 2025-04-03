"use client";

import { getVoucher } from "@/lib/ServerAction";
import { ChangeEvent, useEffect, useState, useCallback } from "react"; // Added useCallback
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState } from "@/lib/reduxStore";

export default function VoucherInput() {
  const [inputValue, setInputValue] = useState("");
  const [debounceValue, setDebounceValue] = useState("");
  const [voucherStatus, setVoucherStatus] = useState<null | {
    status: boolean;
    value?: number;
    code?: string; // Add code here too for consistency
    error?: string;
  }>(null);
  const [isFetching, setIsFetching] = useState(false); // Add loading state

  const dispatch = useDispatch();
  const { grandTotal } = useSelector((state: RootState) => state.cashier);

  // Debounce effect
  useEffect(() => {
    setIsFetching(false); // Reset fetching state on new input
    setVoucherStatus(null); // Clear previous status immediately on new input
    const debouncingTimeout = setTimeout(() => {
      // Only set debounceValue if input is not empty after debounce
      setDebounceValue(inputValue.trim()); // Trim whitespace
    }, 1000);

    return () => clearTimeout(debouncingTimeout);
  }, [inputValue]);

  const handleInputChanges = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value.toUpperCase());
  };

  // Fetch voucher effect
  useEffect(() => {
    // Only fetch if debounceValue is not empty
    if (!debounceValue) {
      // If debounce value becomes empty (e.g., user cleared input), reset discount
      dispatch(
        cashierActions.setDiscount({ status: false, value: 0, code: "" }),
      );
      setVoucherStatus(null); // Ensure UI resets
      setIsFetching(false);
      return;
    }

    const fetchVoucher = async () => {
      setIsFetching(true);
      setVoucherStatus(null); // Clear previous status before fetch
      try {
        const data = await getVoucher(debounceValue);
        setVoucherStatus(data); // Update local UI status

        if (data.status && data.code && data.value !== undefined) {
          // Dispatch only if successful and data is valid
          dispatch(
            cashierActions.setDiscount({
              status: true,
              value: data.value,
              code: data.code,
            }),
          );
        } else {
          // Handle invalid voucher or missing data from server action response
          dispatch(
            cashierActions.setDiscount({
              status: false,
              value: 0,
              code: "", // <-- FIX: Provide empty string for code
            }),
          );
        }
      } catch (error) {
        console.error("Error fetching voucher:", error);
        // Set local UI status for error
        setVoucherStatus({ status: false, error: "Failed to fetch voucher" });
        // Dispatch reset action on error
        dispatch(
          cashierActions.setDiscount({
            status: false,
            value: 0,
            code: "", // <-- FIX: Provide empty string for code
          }),
        );
      } finally {
        setIsFetching(false);
        // Optional: Clear status message after delay, but maybe not needed if cleared on input change
        // setTimeout(() => {
        //    // Only clear if the input hasn't changed again
        //    if (debounceValue === inputValue.trim()) {
        //        setVoucherStatus(null);
        //    }
        // }, 5000);
      }
    };

    fetchVoucher();
    // Include inputValue in dependency array? No, rely on debounceValue.
  }, [debounceValue, dispatch]);

  // Determine border/text color based on state
  let borderColor = "border-customDarkPink";
  let textColor = "text-black";
  if (isFetching) {
    borderColor = "border-blue-500"; // Indicate loading
  } else if (voucherStatus !== null) {
    if (voucherStatus.status) {
      borderColor = "border-green-500";
      textColor = "text-green-500";
    } else {
      borderColor = "border-red-500";
      textColor = "text-red-500";
    }
  }

  return (
    // Adjusted mt-6/lg:mt-7 - may need fine-tuning based on sibling elements
    <div className="relative mt-6 flex w-full">
      <input
        type="text"
        placeholder=" "
        onChange={handleInputChanges}
        // Disable based on total AND if fetching
        disabled={grandTotal < 1 || isFetching} // Simplified disable condition? Adjust min total if needed
        value={inputValue}
        className={`peer h-[43px] w-full rounded-md border-2 px-2 shadow-custom outline-none transition-colors duration-150 lg:h-[50px] ${borderColor} ${textColor} disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-400 disabled:opacity-70`}
      />

      <label
        className={`absolute left-3 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-12px] peer-focus:tracking-wider peer-disabled:text-gray-400 peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:tracking-widest ${textColor} peer-focus:${textColor}`}
      >
        Voucher{/* Changed label text for clarity */}
        {/* Optionally show status text or icon */}
        {isFetching && (
          <span className="ml-2 text-xs text-blue-500">(Checking...)</span>
        )}
        {voucherStatus?.status === true && (
          <span className="ml-2 text-xs text-green-500">(Applied!)</span>
        )}
      </label>
    </div>
  );
}
