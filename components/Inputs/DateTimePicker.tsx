"use client";

import React, { ChangeEvent, useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { cashierActions } from "@/lib/Slices/CashierSlice";

export default function DateTimePicker({
  error,
  disabled,
}: {
  error?: string;
  disabled?: boolean;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const date = useSelector((state: RootState) => state.cashier.date ?? "");
  const time = useSelector((state: RootState) => state.cashier.time ?? "");

  // Get minimum date (today) for date input
  const minDate = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const handleDateChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newDate = e.target.value;
      // Validate date is not in the past
      if (newDate && newDate < minDate) {
        return; // Don't update if date is in the past
      }
      dispatch(cashierActions.setDateTime({ date: newDate, time }));
    },
    [dispatch, time, minDate],
  );

  const handleTimeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newTime = e.target.value;
      // If date is today, validate time is not in the past
      if (date === minDate && newTime) {
        const now = new Date();
        const selectedDateTime = new Date(`${date}T${newTime}`);
        if (selectedDateTime < now) {
          return; // Don't update if time is in the past for today
        }
      }
      dispatch(cashierActions.setDateTime({ date, time: newTime }));
    },
    [dispatch, date, minDate],
  );

  const hasError = !!error;
  const inputHeight = "h-[50px]";
  const labelStyle = "mb-1 block text-sm font-medium text-customBlack/80";

  const inputBaseStyle = useMemo(
    () =>
      `w-full appearance-none rounded-md border-2 bg-white p-2 pl-3 pr-8 shadow-sm outline-none focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink ${inputHeight} disabled:cursor-not-allowed disabled:bg-gray-100 disabled:border-gray-300`,
    [inputHeight],
  );

  const errorBorderStyle = useMemo(
    () => (hasError ? "border-red-500" : "border-customDarkPink/60"),
    [hasError],
  );

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="date-picker" className={labelStyle}>
            Select Date *
          </label>
          <div className="relative">
            <input
              id="date-picker"
              type="date"
              value={date}
              onChange={handleDateChange}
              min={minDate}
              className={`${inputBaseStyle} ${errorBorderStyle}`}
              disabled={disabled}
              aria-invalid={hasError}
              aria-describedby={hasError ? "date-error" : undefined}
            />
          </div>
        </div>
        <div>
          <label htmlFor="time-picker" className={labelStyle}>
            Select Time *
          </label>
          <div className="relative">
            <input
              id="time-picker"
              type="time"
              value={time}
              onChange={handleTimeChange}
              className={`${inputBaseStyle} ${errorBorderStyle}`}
              disabled={disabled}
              aria-invalid={hasError}
              aria-describedby={hasError ? "time-error" : undefined}
            />
          </div>
        </div>
      </div>
      {error && (
        <p id="date-error" className="mt-1 pl-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
