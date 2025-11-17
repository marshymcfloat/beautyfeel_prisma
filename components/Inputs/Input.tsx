"use client";

import React from "react";

// Define a more specific type for the name prop if you often use it for form data keys.
// This is optional but can improve type safety if your form data structures are well-defined.
// type FormDataKeys = "price" | "quantity" | "discount" | string; // Example

interface InputProps {
  type?: React.HTMLInputTypeAttribute; // Use standard HTML input types
  name: string; // Keep name as string for general use
  id?: string;
  label: string;
  value: string | number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  isError?: boolean;
  errorMsg?: string;
  className?: string;
  min?: string | number;
  step?: string | number;
  // Add other standard input attributes as needed
  disabled?: boolean;
  readOnly?: boolean;
  // ... any other common HTMLInputElement attributes
}

export default function Input({
  type = "text",
  name,
  id,
  label,
  value,
  onChange,
  placeholder = " ", // Default for floating label trick
  isError = false,
  errorMsg,
  className = "",
  min,
  step,
  ...rest // Spread any other HTML input props
}: InputProps) {
  const inputId = id || name; // Ensure id is always present for the label

  return (
    <div className={`relative w-full ${isError ? "mb-6" : "mb-1"}`}>
      <input
        type={type}
        name={name}
        id={inputId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        step={step}
        className={`peer h-[50px] w-full rounded-md border-2 px-2 shadow-custom outline-none ${
          isError ? "border-red-500" : "border-customDarkPink"
        } focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
        {...rest} // Apply other passed-in props like disabled, readOnly
      />
      <label
        htmlFor={inputId}
        className={`absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-gray-600 transition-all duration-150 ease-in-out peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base peer-focus:top-[-10px] peer-focus:-translate-y-0 peer-focus:text-xs peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:-translate-y-0 peer-[&:not(:placeholder-shown)]:text-xs peer-[&:not(:placeholder-shown)]:tracking-widest ${
          isError
            ? "text-red-600 peer-focus:text-red-600"
            : "peer-focus:text-blue-500"
        } `}
      >
        {label}
      </label>
      {isError && errorMsg && (
        <p className="absolute bottom-[-20px] left-3 text-xs text-red-600">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
