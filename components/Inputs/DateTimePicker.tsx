"use client";

import { ChangeEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/lib/reduxStore";
import { cashierActions } from "@/lib/Slices/CashierSlice";

// Add error prop
export default function DateTimePicker({ error }: { error?: string }) {
  const dispatch = useDispatch();
  // Select only necessary date/time strings, ensure they are strings
  const date = useSelector((state: RootState) => state.cashier.date ?? "");
  const time = useSelector((state: RootState) => state.cashier.time ?? "");

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    dispatch(cashierActions.setDateTime({ date: e.target.value, time }));
  };

  const handleTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    dispatch(cashierActions.setDateTime({ date, time: e.target.value }));
  };

  const hasError = !!error; // Boolean check for error

  return (
    <div className="mx-auto mt-8 w-[90%]">
      <div className="flex justify-between gap-4">
        {/* Date Input */}
        <div className="flex w-1/2 flex-col">
          <label htmlFor="date-picker" className="mb-1 text-sm font-medium">
            Select Date
          </label>
          <input
            id="date-picker"
            type="date"
            value={date}
            onChange={handleDateChange}
            // Apply error styling conditionally
            className={`w-full rounded-lg border-2 ${
              hasError ? "border-red-500" : "border-customDarkPink"
            } p-2 shadow-custom focus:outline-none focus:ring-2 focus:ring-blue-300 lg:min-h-[50px]`}
          />
        </div>

        {/* Time Input */}
        <div className="flex w-1/2 flex-col">
          <label htmlFor="time-picker" className="mb-1 text-sm font-medium">
            Select Time
          </label>
          <input
            id="time-picker"
            type="time"
            value={time}
            onChange={handleTimeChange}
            // Apply error styling conditionally
            className={`w-full rounded-lg border-2 ${
              hasError ? "border-red-500" : "border-customDarkPink"
            } p-2 shadow-custom focus:outline-none focus:ring-2 focus:ring-blue-300 lg:min-h-[50px]`}
          />
        </div>
      </div>
      {/* Display error message below the inputs */}
      {error && <p className="mt-1 pl-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
