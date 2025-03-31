import React from "react";

// Use React's built-in ButtonHTMLAttributes for better type safety
// Omit 'className' from the base attributes as we handle it separately
type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  invert?: boolean;
  children: React.ReactNode;
  className?: string; // Allow passing additional custom classes
};

export default function Button({
  invert = false,
  children,
  type = "button", // Sensible default
  className = "", // Default to empty string for custom classes
  disabled = false, // Explicitly handle disabled for clarity if needed, though ButtonHTMLAttributes covers it
  ...rest // Spread other props like onClick, title, aria-label etc.
}: ButtonProps) {
  // --- Base styles applicable to both variants ---
  const baseStyles = `
    inline-flex items-center justify-center // Good practice for aligning text/icons
    border-2 rounded-md font-medium
    transition-all duration-150 ease-in-out // Added easing function
    focus:outline-none focus:ring-2 focus:ring-offset-2 // Basic accessibility focus rings
    disabled:opacity-60 disabled:cursor-not-allowed // Adjusted disabled style slightly

    // --- Responsive Padding & Sizing ---
    px-4 py-2           // Base padding (Mobile-first) - Provides decent size
    min-h-[44px]        // Minimum height for touch targets (WCAG/iOS) - ~ Tailwind's min-h-11
    text-sm md:text-base // Slightly smaller text on mobile, base on medium+

    md:px-6 md:py-2     // Increase horizontal padding slightly on medium screens and up
    // lg:px-8 lg:py-3  // Optional: Further increase padding on large screens if desired

    // Remove fixed height (h-[40px]) and fixed min-width (min-w-[100px])
    // Width will now be determined by content + padding, or by parent container/utility classes applied externally (e.g., w-full)
  `;

  // --- Conditional styles based on the 'invert' prop ---
  const colorStyles = invert
    ? `border-customDarkPink text-customDarkPink bg-transparent hover:bg-customDarkPink hover:text-customOffWhite focus:ring-customDarkPink`
    : `border-customDarkPink bg-customDarkPink text-customOffWhite hover:bg-transparent hover:text-customDarkPink focus:ring-customDarkPink`;

  // Combine base, color, and any custom classes passed in props
  // Trim whitespace and replace multiple spaces with single ones for clean output
  const combinedClassName = `${baseStyles} ${colorStyles} ${className}`
    .trim()
    .replace(/\s+/g, " ");

  return (
    <button
      type={type}
      className={combinedClassName}
      disabled={disabled} // Pass disabled state
      {...rest} // Spread remaining attributes (onClick, title, aria-*, etc.)
    >
      {children}
    </button>
  );
}
