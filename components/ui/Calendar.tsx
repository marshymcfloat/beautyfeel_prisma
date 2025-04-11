// components/ui/Calendar.tsx
"use client";

import React from "react";

export default function Calendar() {
  const today = new Date();
  const day = today.getDate().toString().padStart(2, "0");
  const month = today.toLocaleString("en-US", { month: "long" });

  return (
    // Apply card styling and theme colors
    // - w-full: Takes full width on small screens
    // - max-w-xs: Limits width on small screens and up (adjust xs, sm, md as needed)
    // - mx-auto: Centers the component horizontally within its grid column when max-width applies
    <div className="mx-auto flex aspect-square w-full max-w-xs flex-col items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 shadow-custom sm:max-w-sm">
      {" "}
      {/* Adjusted max-width */}
      {/* Month styling: Use customDarkPink */}
      {/* Reduced text sizes slightly for smaller max-width */}
      <p className="mb-1 text-base font-medium uppercase tracking-wide text-customDarkPink sm:text-lg md:mb-1.5 md:text-xl lg:text-2xl">
        {month}
      </p>
      {/* Day styling: Use customBlack */}
      {/* Reduced text sizes slightly */}
      <p className="text-4xl font-bold text-customBlack sm:text-5xl md:text-6xl lg:text-7xl">
        {day}
      </p>
    </div>
  );
}
