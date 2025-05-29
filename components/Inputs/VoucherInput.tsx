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

  useEffect(() => {
    if (!reduxVoucherCode && inputValue) {
      console.log("VoucherInput: Clearing input due to Redux reset.");
      setInputValue("");
      setDebouncedValue("");
      setVoucherStatus(null);
      setIsFetching(false);
    }
  }, [reduxVoucherCode]);

  useEffect(() => {
    if (disabled) {
      setInputValue("");
      setDebouncedValue("");
      setVoucherStatus(null);
      setIsFetching(false);

      if (reduxVoucherCode) {
        dispatch(
          cashierActions.setVoucher({ isValid: false, value: 0, code: "" }),
        );
      }
      return;
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
  }, [inputValue, dispatch, reduxVoucherCode, disabled]);

  useEffect(() => {
    if (disabled || !debouncedValue) {
      setIsFetching(false);
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
  ]);

  const handleInputChanges = (e: ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      setInputValue(e.target.value.toUpperCase());
    }
  };

  let borderColor = "border-customDarkPink";
  let statusTextColor = "text-gray-500";
  let statusIndicator = null;
  const codeForStatusCheck = voucherStatus?.code;

  if (disabled) {
    borderColor = "border-gray-300";
    statusTextColor = "text-gray-400";
    statusIndicator = null;
  } else if (isFetching) {
    borderColor = "border-blue-500";
    statusTextColor = "text-blue-500";
    statusIndicator = <Loader2 size={14} className="animate-spin" />;
  } else if (
    voucherStatus !== null &&
    voucherStatus.code === inputValue.trim()
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
    borderColor = "border-customDarkPink";
    statusTextColor = "text-gray-500";
  } else if (
    inputValue &&
    !isFetching &&
    voucherStatus &&
    voucherStatus.code !== inputValue.trim()
  ) {
    borderColor = "border-customDarkPink";
    statusTextColor = "text-gray-500";
  }

  const labelBaseClasses =
    "absolute left-3 top-1/2 -translate-y-1/2 px-1 text-base font-medium tracking-wider transition-all duration-150 pointer-events-none";

  const labelFloatedClasses = "top-[-9px] text-xs z-10";

  return (
    <div className="mt-6 flex w-full flex-col">
      <div className="relative w-full">
        <input
          type="text"
          id="voucher-input"
          placeholder=" "
          onChange={handleInputChanges}
          disabled={isFetching || disabled}
          value={inputValue}
          className={`peer relative z-0 h-[43px] w-full rounded-md border-2 px-2 pt-1 shadow-sm outline-none transition-colors duration-150 lg:h-[50px] ${borderColor} ${
            voucherStatus?.code === inputValue.trim()
              ? statusTextColor
              : disabled
                ? "text-gray-400"
                : "text-customBlack"
          } disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70`}
          aria-describedby="voucher-status"
        />
        <label
          htmlFor="voucher-input"
          className={`${labelBaseClasses} ${statusTextColor} bg-customOffWhite peer-focus:${statusTextColor} peer-[:not(:placeholder-shown)]:${statusTextColor} peer-focus:${labelFloatedClasses} peer-[:not(:placeholder-shown)]:${labelFloatedClasses} ${disabled ? "cursor-not-allowed" : "cursor-text"} `}
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
