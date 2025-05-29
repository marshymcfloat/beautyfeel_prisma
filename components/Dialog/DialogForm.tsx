"use client";

import { X } from "lucide-react";
import React from "react";

export default function DialogForm({
  children,
  onClose,
  titleComponent,

  className = "relative m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl lg:max-h-[90vh]",
}: {
  children: React.ReactNode;
  onClose?: () => void;
  titleComponent?: React.ReactNode;
  className?: string;
}) {
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      console.warn("DialogForm closed without an onClose handler.");
    }
  };

  const handleDialogClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={className}
      onClick={handleDialogClick}
    >
      {}
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

      {}
      {titleComponent && <div className="mb-1 pr-8">{titleComponent}</div>}

      {}
      {}
      <div className={titleComponent ? "mt-4" : ""}>{children}</div>
    </div>
  );
}
