import React from "react";

// Define the possible size values
type ButtonSize = "sm" | "md" | "lg";

// Update ButtonProps to include the optional size prop
type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  invert?: boolean;
  children: React.ReactNode;
  className?: string; // Allow passing additional custom classes
  size?: ButtonSize; // Add the optional size prop
};

export default function Button({
  invert = false,
  children,
  type = "button",
  className = "",
  disabled = false,
  size = "md", // Default size is 'md'
  ...rest
}: ButtonProps) {
  // --- Base styles - layout, border, transition, focus, disabled, min-height ---
  // Removed padding and text-size as they are now size-dependent
  const baseStyles = `
    inline-flex items-center justify-center
    border-2 rounded-md font-medium
    transition-all duration-150 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-60 disabled:cursor-not-allowed
    min-h-[40px] // Adjusted min-height slightly, ensure it fits your smallest size well
  `;

  // --- Size-specific styles ---
  // Define padding and text size for each variant
  let sizeStyles = "";
  switch (size) {
    case "sm":
      sizeStyles = "px-3 py-1.5 text-xs"; // Small padding, extra small text
      break;
    case "lg":
      sizeStyles = "px-6 py-3 text-base"; // Large padding, base text
      break;
    case "md": // Default case
    default:
      sizeStyles = "px-4 py-2 text-sm"; // Medium padding, small text
      break;
  }

  // --- Conditional color styles based on 'invert' ---
  // Keep your existing color logic
  const colorStyles = invert
    ? `border-customDarkPink text-customDarkPink bg-transparent hover:bg-customDarkPink hover:text-customOffWhite focus:ring-customDarkPink`
    : `border-customDarkPink bg-customDarkPink text-customOffWhite hover:bg-transparent hover:text-customDarkPink focus:ring-customDarkPink`;

  // Combine base, size, color, and any custom classes
  const combinedClassName =
    `${baseStyles} ${sizeStyles} ${colorStyles} ${className}`
      .trim()
      .replace(/\s+/g, " ");

  return (
    <button
      type={type}
      className={combinedClassName}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
