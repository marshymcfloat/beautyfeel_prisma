// components/Buttons/SideBarButtons.tsx (Adjust path if needed)
import React from "react";
import clsx from "clsx"; // Remember to install: npm install clsx or yarn add clsx

type SideBarButtonProps = {
  children: React.ReactNode;
  isActive?: boolean; // To apply active styles
  className?: string; // Allow passing additional custom classes
};

export default function SideBarButtons({
  children,
  isActive = false,
  className = "",
}: SideBarButtonProps) {
  // Base classes applied always
  const baseClasses = [
    "group",
    "mx-auto my-2", // Vertical margin and horizontal centering
    "flex items-center", // Flexbox for alignment
    "transition-all duration-150 ease-in-out", // Smooth transitions for hover/active states
    "shadow-custom", // Original shadow (ensure this class is defined in your global CSS or Tailwind config)
    "cursor-pointer", // Indicate interactivity
  ];

  // Responsive shape and layout classes
  const responsiveClasses = [
    // Mobile first (default): Centered content in a circle
    "size-12 justify-center rounded-full",
    // Medium screens and up: Rectangle, start-aligned content, specific width/padding
    "md:size-auto md:w-[80%] md:min-w-[200px] md:max-w-[250px] md:rounded-3xl md:px-4 md:py-1 md:justify-start",
  ];

  // Conditional classes for background/shadow based on active state
  const stateClasses = isActive
    ? // Active state: Slightly more opaque background, matching shadow
      "bg-customWhiteBlue bg-opacity-50 shadow-custom border-4 border-black" // INCREASED opacity from 35 to 50
    : // Inactive state: Default background with hover effect
      "bg-customWhiteBlue bg-opacity-35 hover:bg-customWhiteBlue/60 hover:shadow-md "; // Default opacity, stronger shadow on hover

  // Combine all classes using clsx
  const combinedClassName = clsx(
    baseClasses,
    responsiveClasses,
    stateClasses,
    className, // Include any custom classes passed via props
  );

  return (
    // Use a single 'div' container.
    // It's not interactive itself, the child Link/button handles interaction.
    // This div provides the styled wrapper.
    <div className={combinedClassName}>
      {children} {/* Render the actual Link or Button passed from SideBar */}
    </div>
  );
}
