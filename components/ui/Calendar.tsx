// components/ui/Calendar.tsx (or CalendarUI.tsx if that's your filename)
"use client";

import React from "react";

const CalendarComponent: React.FC = () => {
  const today = new Date();

  const phtOptionsDate: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Manila",
    day: "2-digit",
  };
  const phtOptionsMonth: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Manila",
    month: "short", // Using 'short' for mobile friendliness, e.g., "Dec"
  };

  const day = new Intl.DateTimeFormat("en-US", phtOptionsDate).format(today);
  const month = new Intl.DateTimeFormat("en-US", phtOptionsMonth)
    .format(today)
    .toUpperCase();

  return (
    // Adjust max-width and padding for modal context.
    // The parent div in AccountDashboardPage for CalendarUI might also need adjustment for mobile.
    // This component itself uses bg-customOffWhite.
    <div className="flex aspect-square w-full max-w-[150px] flex-col items-center justify-center rounded-lg border border-customGray/30 bg-customOffWhite p-2 shadow-custom sm:max-w-[160px] sm:p-3 md:max-w-[180px] lg:h-44 lg:w-44 lg:p-4">
      <p className="mb-0.5 text-xs font-medium uppercase tracking-wider text-customDarkPink sm:text-sm md:mb-1 md:text-base lg:text-lg">
        {month}
      </p>
      <p className="text-4xl font-bold text-customBlack sm:text-5xl md:text-6xl">
        {day}
      </p>
    </div>
  );
};

CalendarComponent.displayName = "Calendar";
const CalendarUI = React.memo(CalendarComponent); // Exporting as CalendarUI if that's what dashboard expects
export default CalendarUI;
