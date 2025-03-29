"use client";

import { getVoucher } from "@/lib/ServerAction";
import { ChangeEvent, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { RootState } from "@/lib/reduxStore";

export default function VoucherInput() {
  const [inputValue, setInputValue] = useState("");
  const [debounceValue, setDebounceValue] = useState("");
  const [voucherStatus, setVoucherStatus] = useState<null | {
    status: boolean;
    value?: number; // Assuming discount value comes from API
    error?: string;
  }>(null);

  const dispatch = useDispatch();

  const { grandTotal } = useSelector((state: RootState) => state.cashier);

  console.log(grandTotal);

  useEffect(() => {
    const debouncingTimeout = setTimeout(() => {
      setDebounceValue(inputValue);
    }, 500);

    return () => clearTimeout(debouncingTimeout); // Cleanup timeout on input change
  }, [inputValue]);

  function handleInputChanges(e: ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value.toUpperCase());
  }

  useEffect(() => {
    if (debounceValue) {
      async function fetchVoucher() {
        try {
          const data = await getVoucher(debounceValue);
          setVoucherStatus(data);

          if (data.status) {
            dispatch(
              cashierActions.setDiscount({
                status: true,
                value: data.value || 0,
                code: data.code,
              }),
            ); // Dispatch Redux action
          } else {
            dispatch(cashierActions.setDiscount({ status: false, value: 0 })); // Reset discount
          }

          // Hide status after 5 seconds (return to default)
          setTimeout(() => setVoucherStatus(null), 5000);
        } catch (error) {
          console.error("Error fetching voucher:", error);
          setVoucherStatus({ status: false, error: "Failed to fetch voucher" });

          dispatch(cashierActions.setDiscount({ status: false, value: 0 })); // Reset discount on error

          // Hide status after 5 seconds (return to default)
          setTimeout(() => setVoucherStatus(null), 5000);
        }
      }

      fetchVoucher();
    }
  }, [debounceValue, dispatch]);

  return (
    <div className="relative mt-6 flex w-full lg:mt-7">
      <input
        type="text"
        placeholder=" "
        onChange={handleInputChanges}
        disabled={grandTotal < 500}
        value={inputValue}
        className={`peer h-[43px] w-full rounded-md border-2 px-2 shadow-custom outline-none transition-all duration-300 ${
          voucherStatus === null
            ? "border-customDarkPink text-black" // Default state
            : voucherStatus.status
              ? "border-green-500 text-green-500" // Valid
              : "border-red-500 text-red-500" // Invalid
        } peer disabled:cursor-not-allowed disabled:bg-white disabled:text-gray-500 disabled:opacity-50`}
      />

      <label className="absolute left-3 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:tracking-widest peer-disabled:text-gray-500 peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:tracking-widest">
        Voucher
      </label>
    </div>
  );
}
