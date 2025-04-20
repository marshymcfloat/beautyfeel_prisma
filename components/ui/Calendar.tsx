// components/ui/Calendar.tsx
"use client";

import React from "react";

export default function Calendar() {
  const today = new Date();
  const day = today.getDate().toString().padStart(2, "0");
  const month = today.toLocaleString("en-US", { month: "long" });

  return (
    <div className="mx-auto flex aspect-square w-full max-w-xs flex-col items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-4 shadow-custom sm:max-w-sm lg:size-44">
      <p className="mb-1 text-base font-medium uppercase tracking-wide text-customDarkPink sm:text-lg md:mb-1.5 md:text-xl lg:text-2xl">
        {month}
      </p>
      <p className="text-7xl font-bold text-customBlack sm:text-5xl md:text-6xl">
        {day}
      </p>
    </div>
  );
}
