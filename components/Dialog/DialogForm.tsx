// components/Dialog/DialogForm.jsx (or your path)
"use client";

import { X } from "lucide-react";
// Removed imports for router, dispatch, cashierActions as they are too specific

export default function DialogForm({
  children,
  onClose, // <-- Add onClose prop
  titleComponent, // Optional: Prop for a title element
  // Removed action prop as it's not always needed
}: {
  children: React.ReactNode;
  onClose?: () => void; // Make onClose optional but HIGHLY recommended
  titleComponent?: React.ReactNode; // To use your DialogTitle
}) {
  // Handle close, calling the passed function if provided
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      // Provide a default behavior or warning if no handler is passed
      console.warn("DialogForm closed without an onClose handler.");
      // Avoid hardcoding router.back() or dispatch here
    }
  };

  return (
    // Using <dialog> is good. Keep 'open'.
    // Adjust positioning: remove absolute/translate, rely on parent centering (DialogBackground)
    // Added 'm-auto' to help centering within flex/grid parent. Added relative for absolute positioning of X.
    <dialog
      open
      className="relative m-auto max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl lg:max-h-[95vh]"
    >
      {/* Close Button - Calls the generic handler */}
      {/* Render the button only if onClose is provided */}
      {onClose && (
        <button
          type="button" // Important: Prevents form submission if wrapped in one
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 cursor-pointer rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          aria-label="Close dialog" // Accessibility
        >
          <X size={20} />
        </button>
      )}

      {/* Render optional title component passed as prop */}
      {titleComponent}

      {/* Render children. Removed the <form> wrapper. */}
      {/* Let the child component decide if it needs a form. */}
      {/* If ManageServicesDialog needed form submission, wrap its content */}
      <div className="mt-4">
        {" "}
        {/* Add margin if title exists */}
        {children}
      </div>
    </dialog>
  );
}
