// components/Buttons/Button.tsx
import React from "react";
import clsx from "clsx";

// Define the possible size values - ADD 'xs'
type ButtonSize = "xs" | "sm" | "md" | "lg"; // Added "xs"

type ButtonVariant = "primary" | "secondary" | "outline";

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  invert?: boolean;
  children: React.ReactNode;
  className?: string;
  size?: ButtonSize;
  icon?: React.ReactNode;
  variant?: ButtonVariant;
};

export default function Button({
  invert = false,
  children,
  type = "button",
  className = "",
  disabled = false,
  size = "md", // Default size is 'md'
  icon,
  variant,
  ...rest
}: ButtonProps) {
  const baseStyles = `
    inline-flex items-center justify-center
    border-2 rounded-md font-medium
    transition-all duration-150 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-60 disabled:cursor-not-allowed
  `;

  let sizeStyles = "";
  switch (size) {
    case "xs": // New "xs" size
      sizeStyles = "px-2 py-1 text-[10px] min-h-[26px]"; // Example for xs
      break;
    case "sm":
      sizeStyles = "px-3 py-1.5 text-xs min-h-[30px]";
      break;
    case "lg":
      sizeStyles = "px-6 py-3 text-base min-h-[50px]";
      break;
    case "md":
    default:
      sizeStyles = "px-4 py-2 text-sm min-h-[40px]";
      break;
  }

  let colorStyles = "";
  if (variant !== undefined) {
    switch (variant) {
      case "outline":
        colorStyles = `border-customDarkPink text-customDarkPink bg-transparent hover:bg-customDarkPink hover:text-customOffWhite focus:ring-customDarkPink`;
        break;
      case "secondary":
        colorStyles = `border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400`;
        break;
      case "primary":
      default:
        colorStyles = `border-customDarkPink bg-customDarkPink text-customOffWhite hover:bg-transparent hover:text-customDarkPink focus:ring-customDarkPink`;
        break;
    }
  } else {
    if (invert) {
      colorStyles = `border-customDarkPink text-customDarkPink bg-transparent hover:bg-customDarkPink hover:text-customOffWhite focus:ring-customDarkPink`;
    } else {
      colorStyles = `border-customDarkPink bg-customDarkPink text-customOffWhite hover:bg-transparent hover:text-customDarkPink focus:ring-customDarkPink`;
    }
  }

  const combinedClassName = clsx(
    baseStyles,
    sizeStyles, // Base size styles applied first
    colorStyles,
    className, // Custom className can override or add to size/color styles
  );

  return (
    <button
      type={type}
      className={combinedClassName}
      disabled={disabled}
      {...rest}
    >
      {icon && (
        <span className={clsx("flex-shrink-0", children ? "mr-1.5" : "")}>
          {icon}
        </span>
      )}{" "}
      {/* Adjusted margin for icon-only buttons */}
      {children}
    </button>
  );
}
