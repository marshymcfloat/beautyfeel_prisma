import React from "react";
import clsx from "clsx";

interface SpinnerProps {
  /**
   * Tailwind class for the size of the spinner element itself (e.g., 'size-8', 'h-5 w-5').
   * @default 'size-8'
   */
  size?: string;
  /**
   * Tailwind class for the height of the container wrapping the spinner and text (e.g., 'h-screen', 'h-auto').
   * Useful for centering the spinner within a specific area.
   * @default 'h-auto'
   */
  height?: string;
  /**
   * Optional text to display below the spinner.
   */
  text?: string;
  /**
   * Additional Tailwind classes for the container div.
   */
  className?: string;
  /**
   * Tailwind class for the color of the spinner's text.
   * @default 'text-gray-600'
   */
  textColor?: string;
}

export default function Spinner({
  size = "size-8",
  height = "h-auto",
  text,
  className,
  textColor = "text-gray-600",
}: SpinnerProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center",
        height,
        className,
      )}
    >
      {}
      <div
        className={clsx(
          "animate-spin rounded-full border-4 border-t-4 border-customDarkPink border-t-white",
          size,
        )}
      ></div>
      {}
      {text && (
        <p className={clsx("mt-2 text-sm font-medium", textColor)}>{text}</p>
      )}
    </div>
  );
}
