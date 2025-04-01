"use client";

import React from "react";

export default function Calendar() {
  const today = new Date();
  const day = today.getDate().toString().padStart(2, "0"); // Keep two digits
  const month = today.toLocaleString("en-US", { month: "long" }); // Keep full month name

  return (
    // Use custom colors, adjust sizing and padding for better proportion
    <div className="flex size-40 flex-col items-center justify-center rounded-2xl border border-customGray/30 bg-customOffWhite p-4 shadow-custom lg:size-52">
      {/* Month styling: Larger, colored, slightly less spacing */}
      <p className="mb-1 text-xl font-medium uppercase tracking-wide text-customDarkPink lg:text-2xl">
        {month}
      </p>
      {/* Day styling: Very large, primary text color */}
      <p className="text-6xl font-bold text-customBlack lg:text-8xl">{day}</p>
    </div>
  );
}
