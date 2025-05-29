"use client";

import React from "react";

interface CalendarComponentProps {
  className?: string;
}

const CalendarComponent: React.FC<CalendarComponentProps> = ({ className }) => {
  const today = new Date();

  const phtOptionsDate: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Manila",
    day: "2-digit",
  };
  const phtOptionsMonth: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Manila",
    month: "short",
  };

  const day = new Intl.DateTimeFormat("en-US", phtOptionsDate).format(today);
  const month = new Intl.DateTimeFormat("en-US", phtOptionsMonth)
    .format(today)
    .toUpperCase();

  const calendarClasses = `
    flex aspect-[4/3] w-full flex-col items-center justify-center
    rounded-lg border border-customGray/30 bg-customOffWhite/70 p-3 text-center
    shadow-custom transition-all duration-150 ease-in-out hover:border-customGray/50 hover:shadow-md active:scale-95
    sm:aspect-square sm:p-4 md:max-w-none
    ${className || ""} 
  `;

  return (
    <div className={calendarClasses}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-customDarkPink sm:text-xs">
        {month}
      </p>
      <p className="text-4xl font-bold text-customBlack sm:text-4xl">{day}</p>
      {}
      <div className="h-[10px] sm:h-[12px]"></div>
    </div>
  );
};

CalendarComponent.displayName = "Calendar";
const CalendarUI = React.memo(CalendarComponent);
export default CalendarUI;
