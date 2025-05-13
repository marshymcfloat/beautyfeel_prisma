// components/ui/dashboard/MobileWidgetIcon.tsx
"use client"; // Add this if it's a client component, which it is due to onClick

import React, { useCallback } from "react";
import { LucideProps, Loader2 } from "lucide-react";
import { MobileWidgetKey } from "@/lib/Types";

interface MobileWidgetIconProps {
  IconComponent: React.ElementType; // General ElementType for flexibility
  title: string;
  widgetKey: MobileWidgetKey;
  onClick: (key: MobileWidgetKey) => void;
  notificationCount?: number;
  isActive?: boolean;
  isLoading?: boolean;
}

export const MobileWidgetIcon: React.FC<MobileWidgetIconProps> = React.memo(
  ({
    IconComponent,
    title,
    widgetKey,
    onClick,
    notificationCount,
    isActive = false,
    isLoading = false,
  }) => {
    // This useCallback ensures that handleClick has a stable identity
    // as long as `onClick` (from props, which should be stable) and `widgetKey` (stable per instance)
    // do not change.
    const handleClick = useCallback(() => {
      if (!isLoading) {
        // Prevent action if already loading
        onClick(widgetKey);
      }
    }, [onClick, widgetKey, isLoading]);

    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        aria-label={title} // For accessibility
        className={`relative flex aspect-[4/3] w-full flex-col items-center justify-center space-y-1 rounded-lg border p-3 text-center transition-all duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-customDarkPink focus-visible:ring-opacity-75 sm:aspect-square sm:space-y-2 sm:p-4 ${
          isActive
            ? "scale-105 border-customDarkPink bg-customDarkPink/10 shadow-lg ring-1 ring-customDarkPink"
            : "border-customGray/30 bg-customOffWhite/70 hover:border-customGray/50 hover:shadow-md active:scale-95"
        } ${isLoading ? "animate-pulse cursor-wait opacity-60" : ""} `}
      >
        {isLoading ? (
          <Loader2
            size={28}
            className="h-7 w-7 animate-spin text-customDarkPink/80 sm:h-8 sm:w-8"
          />
        ) : (
          <IconComponent
            size={28}
            className={`mb-0.5 sm:mb-1 sm:h-8 sm:w-8 ${isActive ? "text-customDarkPink" : "text-customBlack/60"}`}
          />
        )}
        <span
          className={`line-clamp-2 text-[11px] font-medium leading-tight sm:text-xs ${isActive ? "text-customDarkPink" : "text-customBlack/70"}`}
        >
          {title}
        </span>
        {notificationCount !== undefined &&
          notificationCount > 0 &&
          !isLoading && (
            <span
              className="absolute right-1 top-1 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm sm:right-1.5 sm:top-1.5"
              aria-label={`${notificationCount} notifications`}
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
      </button>
    );
  },
);

MobileWidgetIcon.displayName = "MobileWidgetIcon"; // Good practice for dev tools
