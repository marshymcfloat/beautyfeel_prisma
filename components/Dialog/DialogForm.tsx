// components/Dialog/DialogForm.tsx
"use client";

import { X } from "lucide-react";
import React from "react"; // Import React

export default function DialogForm({
  children,
  onClose,
  titleComponent,
  // Add optional className prop for further styling
  className = "relative m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl lg:max-h-[90vh]",
}: {
  children: React.ReactNode;
  onClose?: () => void;
  titleComponent?: React.ReactNode;
  className?: string; // Allow passing custom classes
}) {
  // Handle close, calling the passed function if provided
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      console.warn("DialogForm closed without an onClose handler.");
    }
  };

  // Function to stop clicks inside the dialog from closing it via the backdrop
  const handleDialogClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    // Replace <dialog> with <div>
    // Add role="dialog" and aria-modal="true" for accessibility
    <div
      role="dialog"
      aria-modal="true"
      // Add aria-labelledby="dialog-title-id" if titleComponent has id="dialog-title-id"
      className={className} // Use passed or default classes
      onClick={handleDialogClick} // Prevent backdrop close on content click
    >
      {/* Close Button */}
      {onClose && (
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 cursor-pointer rounded-full p-1 text-customBlack/60 transition-colors hover:bg-customGray/50 hover:text-customBlack"
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      )}

      {/* Optional Title: Add padding-right to avoid overlap with close button */}
      {titleComponent && <div className="mb-1 pr-8">{titleComponent}</div>}

      {/* Render children */}
      {/* Add margin-top if title exists */}
      <div className={titleComponent ? "mt-4" : ""}>{children}</div>
    </div>
  );
}
