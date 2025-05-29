"use client";

import React, { useState, useRef } from "react";
import Button from "@/components/Buttons/Button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface GiftCertificateInputProps {
  onApply: (code: string) => void;
  onRemove: () => void;
  appliedCode: string | null;
  isValid: boolean;
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
      onApply(code.trim().toUpperCase());
    }
  };

  const handleRemoveClick = () => {
    setCode("");
    onRemove();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        {}
        <input
          ref={inputRef}
          type="text"
          id="gc-code"
          value={code}
          onChange={handleInputChange}
          placeholder="Enter GC Code"
          disabled={isChecking || (!!appliedCode && isValid)}
          className={`flex-grow rounded-l-md border p-2 text-sm shadow-sm ${
            appliedCode && isValid
              ? "border-green-500 bg-green-50"
              : error
                ? "border-red-500"
                : "border-gray-300 focus:border-pink-500 focus:ring-pink-500"
          } disabled:cursor-not-allowed disabled:bg-gray-100`}
          style={{ textTransform: "uppercase" }}
        />
        {appliedCode && isValid ? (
          <Button
            type="button"
            onClick={handleRemoveClick}
            size="sm"
            className="rounded-l-none rounded-r-md border-l-0 px-3"
            invert
            title={`Remove GC: ${appliedCode}`}
          >
            Remove
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleApplyClick}
            size="sm"
            disabled={!code.trim() || isChecking || !!appliedCode}
            className="rounded-l-none rounded-r-md border-l-0 px-3"
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
      {}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {appliedCode && isValid && (
        <p className="mt-1 flex items-center gap-1 text-xs text-green-600">
          <CheckCircle size={14} /> Applied: {appliedCode}
        </p>
      )}
      {}
    </div>
  );
}
