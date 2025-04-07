// components/Inputs/GiftCertificateInput.tsx
"use client";

import React, { useState, useRef } from "react";
import Button from "@/components/Buttons/Button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react"; // Icons

interface GiftCertificateInputProps {
  onApply: (code: string) => void;
  onRemove: () => void;
  appliedCode: string | null;
  isValid: boolean; // True if applied GC status is 'valid'
  isChecking: boolean;
  error: string | null;
}

export default function GiftCertificateInput({
  onApply,
  onRemove,
  appliedCode,
  isValid,
  isChecking,
  error,
}: GiftCertificateInputProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleApplyClick = () => {
    if (code.trim()) {
      onApply(code.trim().toUpperCase()); // Apply uppercase code
    }
  };

  const handleRemoveClick = () => {
    setCode(""); // Clear input field as well
    onRemove();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Automatically convert to uppercase as user types
    setCode(e.target.value.toUpperCase());
  };

  return (
    <div className="w-full">
      <label
        htmlFor="gc-code"
        className="mb-1 block text-sm font-medium text-gray-700"
      >
        Gift Certificate Code (Optional)
      </label>
      <div className="flex items-stretch">
        {" "}
        {/* Use items-stretch */}
        <input
          ref={inputRef}
          type="text"
          id="gc-code"
          value={code}
          onChange={handleInputChange}
          placeholder="Enter GC Code"
          // Disable input if a valid GC is already applied OR while checking
          disabled={isChecking || (!!appliedCode && isValid)}
          className={`flex-grow rounded-l-md border p-2 text-sm shadow-sm ${
            appliedCode && isValid
              ? "border-green-500 bg-green-50" // Valid applied style
              : error
                ? "border-red-500" // Error style
                : "border-gray-300 focus:border-pink-500 focus:ring-pink-500" // Default style
          } disabled:cursor-not-allowed disabled:bg-gray-100`}
          style={{ textTransform: "uppercase" }} // Visual uppercase hint
        />
        {appliedCode && isValid ? (
          // Show Remove button if valid GC applied
          <Button
            type="button"
            onClick={handleRemoveClick}
            size="sm"
            className="rounded-l-none rounded-r-md border-l-0 px-3" // Adjust styles for adjacent button
            invert // Use outline style
            title={`Remove GC: ${appliedCode}`}
          >
            Remove
          </Button>
        ) : (
          // Show Apply/Checking button otherwise
          <Button
            type="button"
            onClick={handleApplyClick}
            size="sm"
            disabled={!code.trim() || isChecking || !!appliedCode} // Disable if no code, checking, or already applied (even if error)
            className="rounded-l-none rounded-r-md border-l-0 px-3" // Adjust styles
            title="Apply Gift Certificate Code"
          >
            {isChecking ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Apply"
            )}
          </Button>
        )}
      </div>
      {/* Display validation status/error */}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {appliedCode && isValid && (
        <p className="mt-1 flex items-center gap-1 text-xs text-green-600">
          <CheckCircle size={14} /> Applied: {appliedCode}
        </p>
      )}
      {/* Add message for other appliedCode statuses if needed */}
    </div>
  );
}
