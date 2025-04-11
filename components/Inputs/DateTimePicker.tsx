// components/Inputs/DateTimePicker.tsx
"use client";

import React, { ChangeEvent } from "react"; // Import React
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { cashierActions } from "@/lib/Slices/CashierSlice";

export default function DateTimePicker({ error }: { error?: string }) {
  const dispatch = useDispatch<AppDispatch>();
  const date = useSelector((state: RootState) => state.cashier.date ?? "");
  const time = useSelector((state: RootState) => state.cashier.time ?? "");

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) =>
    dispatch(cashierActions.setDateTime({ date: e.target.value, time }));
  const handleTimeChange = (e: ChangeEvent<HTMLInputElement>) =>
    dispatch(cashierActions.setDateTime({ date, time: e.target.value }));

  const hasError = !!error;
  const inputHeight = "h-[50px]"; // Consistent height
  const labelStyle = "mb-1 block text-sm font-medium text-customBlack/80";
  const inputBaseStyle = `w-full appearance-none rounded-md border-2 bg-white p-2 pl-3 pr-8 shadow-sm outline-none focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink ${inputHeight}`; // Added appearance-none, padding
  const errorBorderStyle = hasError
    ? "border-red-500"
    : "border-customDarkPink/60";

  return (
    // Removed outer margin/width
    <div className="w-full">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {" "}
        {/* Use grid */}
        <div>
          {" "}
          {/* Date */}
          <label htmlFor="date-picker" className={labelStyle}>
            Select Date *
          </label>
          {/* Add relative positioning for potential icon */}
          <div className="relative">
            <input
              id="date-picker"
              type="date"
              value={date}
              onChange={handleDateChange}
              className={`${inputBaseStyle} ${errorBorderStyle}`}
            />
            {/* Optional: Add calendar icon absolutely positioned */}
          </div>
        </div>
        <div>
          {" "}
          {/* Time */}
          <label htmlFor="time-picker" className={labelStyle}>
            Select Time *
          </label>
          {/* Add relative positioning for potential icon */}
          <div className="relative">
            <input
              id="time-picker"
              type="time"
              value={time}
              onChange={handleTimeChange}
              className={`${inputBaseStyle} ${errorBorderStyle}`}
            />
            {/* Optional: Add clock icon absolutely positioned */}
          </div>
        </div>
      </div>
      {error && <p className="mt-1 pl-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
