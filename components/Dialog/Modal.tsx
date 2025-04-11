// components/Modal.tsx
"use client";

import React, { useEffect, useState, useRef } from "react"; // Added useRef
import ReactDOM from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  backgroundClassName?: string;
  containerClassName?: string;
}

export default function Modal({
  children,
  isOpen,
  onClose,
  title,
  backgroundClassName = "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 backdrop-blur-sm",
  // Make sure default container doesn't force overflow itself unless intended by the specific modal's class override
  containerClassName = "relative m-auto max-h-[90vh] w-full max-w-lg bg-customOffWhite rounded-lg shadow-xl flex flex-col", // Use flex-col, REMOVED overflow-y-auto here
}: ModalProps) {
  const [portalNode, setPortalNode] = useState<Element | null>(null);
  // useRef to store original styles persistently across re-renders
  const originalBodyOverflowRef = useRef<string | null>(null);
  const originalHtmlOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    // Find portal root on client mount
    const node = document.getElementById("modal-root");
    setPortalNode(node || null); // Ensure it's null if not found
  }, []);

  // --- UPDATED Body Scroll Lock Effect ---
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    if (isOpen) {
      // Store original styles ONLY if they haven't been stored yet
      if (originalBodyOverflowRef.current === null) {
        originalBodyOverflowRef.current = body.style.overflow;
      }
      if (originalHtmlOverflowRef.current === null) {
        originalHtmlOverflowRef.current = html.style.overflow;
      }

      // Apply lock only if not already locked (by potentially another modal)
      // Or force it if this component should take precedence
      body.style.overflow = "hidden";
      html.style.overflow = "hidden";
      // console.log(`Modal ${title || 'untitled'}: Locking scroll`);
    } else {
      // Restore original styles IF this modal instance had stored them
      if (originalBodyOverflowRef.current !== null) {
        body.style.overflow = originalBodyOverflowRef.current;
        originalBodyOverflowRef.current = null; // Reset ref after restoring
      }
      if (originalHtmlOverflowRef.current !== null) {
        html.style.overflow = originalHtmlOverflowRef.current;
        originalHtmlOverflowRef.current = null; // Reset ref after restoring
      }
      // console.log(`Modal ${title || 'untitled'}: Unlocking scroll`);
    }

    // Cleanup function on unmount
    return () => {
      // console.log(`Modal ${title || 'untitled'}: Cleanup effect`);
      // Restore based on stored refs if component unmounts while open
      if (originalBodyOverflowRef.current !== null) {
        body.style.overflow = originalBodyOverflowRef.current;
        originalBodyOverflowRef.current = null;
        // console.log(`Modal ${title || 'untitled'}: Restored body scroll on unmount`);
      }
      if (originalHtmlOverflowRef.current !== null) {
        html.style.overflow = originalHtmlOverflowRef.current;
        originalHtmlOverflowRef.current = null;
        // console.log(`Modal ${title || 'untitled'}: Restored html scroll on unmount`);
      }
    };
  }, [isOpen]); // Re-run only when isOpen changes
  // --- END UPDATED Effect ---

  const handleBackgroundClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleDialogClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  // Modal Content JSX
  const modalContent = (
    <div
      className={backgroundClassName}
      onClick={handleBackgroundClick}
      role="presentation"
    >
      {/* The main modal container passed via props */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          typeof title === "string" ? "dialog-title-id" : undefined
        }
        className={containerClassName}
        onClick={handleDialogClick}
      >
        {/* Header Area (Optional - Render Title and Close Button) */}
        {/* Added flex-shrink-0 to prevent header/footer shrinking */}
        <div className="flex flex-shrink-0 items-start justify-between border-b border-customGray/30 p-4">
          {title &&
            (typeof title === "string" ? (
              <h2
                id="dialog-title-id"
                className="text-lg font-semibold text-customBlack"
              >
                {title}
              </h2>
            ) : (
              title /* Render component title */
            ))}
          <button
            type="button"
            onClick={onClose}
            className="-m-1.5 rounded-full p-1.5 text-customBlack/60 transition-colors hover:bg-customGray/50 hover:text-customBlack"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Children Content Area - THIS SHOULD SCROLL */}
        {/* Added flex-grow, overflow-y-auto, and padding */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-6">{children}</div>

        {/* Optional Footer Area - Example */}
        {/* You might pass footer content as a prop if needed */}
        {/* <div className="flex-shrink-0 border-t border-customGray/30 p-4 flex justify-end space-x-3">
            <button onClick={onClose}>Close</button>
           </div> */}
      </div>
    </div>
  );

  if (!isOpen || !portalNode) return null;
  return ReactDOM.createPortal(modalContent, portalNode);
}
