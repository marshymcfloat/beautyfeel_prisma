import React from "react"; // Import React if not already

export default function Button({
  invert = false,
  children,
  type = "button",
  disabled = false,
  onClick,
  title, // <-- Add title here
  ...rest // <-- Add spread operator for other standard props
}: {
  invert?: boolean;
  type?: "button" | "submit" | "reset";
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void; // More specific type for onClick
  title?: string; // <-- Define the type for title
  // Allow any other standard button attributes
  [x: string]: any; // Or be more specific if needed, e.g., React.ButtonHTMLAttributes<HTMLButtonElement>
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title} // <-- Pass title to the HTML button
      className={
        invert
          ? "h-[40px] min-w-[100px] rounded-md border-2 border-customDarkPink px-3 py-1 font-medium text-customDarkPink transition-all duration-150 hover:bg-customDarkPink hover:text-customOffWhite disabled:cursor-not-allowed disabled:opacity-50" // Added padding, disabled styles
          : "h-[40px] min-w-[100px] rounded-md border-2 border-customDarkPink bg-customDarkPink px-3 py-1 font-medium text-customOffWhite transition-all duration-150 hover:bg-customOffWhite hover:text-customDarkPink disabled:cursor-not-allowed disabled:opacity-50" // Added padding, disabled styles
      }
      {...rest} // <-- Spread any other passed props (like aria-label, etc.)
    >
      {children}
    </button>
  );
}
