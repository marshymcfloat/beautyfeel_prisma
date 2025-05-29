"use client";

import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";

type ModalSize =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  | "full";

interface ModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  backgroundClassName?: string;
  containerClassName?: string;
  size?: ModalSize;
  hideDefaultHeader?: boolean;
  hideDefaultCloseButton?: boolean;
  titleClassName?: string;
  contentClassName?: string;
}

const getSizeClass = (size?: ModalSize): string => {
  switch (size) {
    case "sm":
      return "max-w-sm";
    case "md":
      return "max-w-md";
    case "lg":
      return "max-w-lg";
    case "xl":
      return "max-w-xl";
    case "2xl":
      return "max-w-2xl";
    case "3xl":
      return "max-w-3xl";
    case "4xl":
      return "max-w-4xl";
    case "5xl":
      return "max-w-5xl";
    case "full":
      return "max-w-full h-full";
    default:
      return "max-w-lg";
  }
};

export default function Modal({
  children,
  isOpen,
  onClose,
  title,
  backgroundClassName = "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 backdrop-blur-sm",
  containerClassName = "relative m-auto max-h-[90vh] w-full bg-customOffWhite rounded-lg shadow-xl flex flex-col",
  size,
  hideDefaultHeader = false,
  hideDefaultCloseButton = false,
  titleClassName = "flex-shrink-0 border-b border-customGray/30 p-4",
  contentClassName = "flex-grow overflow-y-auto p-4 sm:p-6",
}: ModalProps) {
  const [portalNode, setPortalNode] = useState<Element | null>(null);
  const originalBodyOverflowRef = useRef<string | null>(null);
  const originalHtmlOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    let node = document.getElementById("modal-root");
    if (!node) {
      node = document.createElement("div");
      node.setAttribute("id", "modal-root");
      document.body.appendChild(node);
    }
    setPortalNode(node);

    return () => {
      if (node && node.parentNode && node.getAttribute("created-by-modal")) {
      }
    };
  }, []);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    if (isOpen) {
      if (originalBodyOverflowRef.current === null)
        originalBodyOverflowRef.current = body.style.overflow;
      if (originalHtmlOverflowRef.current === null)
        originalHtmlOverflowRef.current = html.style.overflow;
      body.style.overflow = "hidden";
      html.style.overflow = "hidden";
    } else {
      if (originalBodyOverflowRef.current !== null)
        body.style.overflow = originalBodyOverflowRef.current;
      if (originalHtmlOverflowRef.current !== null)
        html.style.overflow = originalHtmlOverflowRef.current;
      originalBodyOverflowRef.current = null;
      originalHtmlOverflowRef.current = null;
    }

    return () => {
      if (originalBodyOverflowRef.current !== null)
        body.style.overflow = originalBodyOverflowRef.current;
      if (originalHtmlOverflowRef.current !== null)
        html.style.overflow = originalHtmlOverflowRef.current;
      originalBodyOverflowRef.current = null;
      originalHtmlOverflowRef.current = null;
    };
  }, [isOpen]);

  const handleBackgroundClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
  const handleDialogClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const finalContainerClassName = `${containerClassName} ${getSizeClass(size)}`;

  const modalContent = (
    <div
      className={backgroundClassName}
      onClick={handleBackgroundClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          typeof title === "string" ? "dialog-title-id" : undefined
        }
        className={finalContainerClassName}
        onClick={handleDialogClick}
      >
        {!hideDefaultHeader && title && (
          <div className={`flex items-start justify-between ${titleClassName}`}>
            {typeof title === "string" ? (
              <h2
                id="dialog-title-id"
                className="text-lg font-semibold text-customBlack"
              >
                {title}
              </h2>
            ) : (
              title
            )}
            {!hideDefaultCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="-m-1.5 ml-4 flex-shrink-0 rounded-full p-1.5 text-customBlack/60 transition-colors hover:bg-customGray/50 hover:text-customBlack"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  );

  if (!isOpen || !portalNode) return null;
  return ReactDOM.createPortal(modalContent, portalNode);
}
