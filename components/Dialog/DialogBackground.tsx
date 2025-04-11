// components/Dialog/DialogBackground.tsx
import React from "react";

export default function DialogBackground({
  children,
  onClick, // Allow handling backdrop clicks
}: {
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void; // Optional click handler for backdrop
}) {
  // Handler to close only when clicking the backdrop itself, not children
  const handleBackgroundClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Check if the click target is the backdrop div itself
    if (event.target === event.currentTarget && onClick) {
      onClick(event);
    }
  };

  return (
    // Use fixed positioning to cover viewport, flex to center children
    // Ensure high z-index (z-50 is usually good)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 backdrop-blur-sm"
      onClick={handleBackgroundClick} // Add backdrop click handler
      aria-labelledby="dialog-title" // Point to title if available inside children
      role="presentation" // Indicates it's just a background presentation
    >
      {/* Children (e.g., DialogForm) will be centered by flex */}
      {children}
    </div>
  );
}
