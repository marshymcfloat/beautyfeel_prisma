"use client";

import React, { memo } from "react"; // Import React explicitly

// 1. Define Props Interface with Generic T
// Use Record<string, any> or a more specific constraint if needed
type SelectInputGroupProps<T extends Record<string, any>> = {
  label: string;
  options: T[];
  valueKey?: keyof T; // Use keyof T for keys
  labelKey?: keyof T; // Use keyof T for keys
  name: string;
  id?: string;
  value?: string; // HTML select value is always string
  onChange: (key: string, value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
};

// 2. Define the component function *internally* with the generic and typed props
// Note the <T extends Record<string, any>> on the function itself
const SelectInputGroupInternal = <T extends Record<string, any>>({
  label,
  options,
  // Provide default keys, assert type carefully or make props required
  valueKey = "id" as keyof T,
  labelKey = "title" as keyof T,
  name,
  id,
  value,
  onChange,
  placeholder = "Select an option...",
  error,
  required = false,
}: SelectInputGroupProps<T>) => {
  // Use the Props type here
  const hasError = !!error;

  return (
    <div className="relative flex w-full flex-col">
      <label htmlFor={id || name} className="mb-1 text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        name={name}
        id={id || name}
        required={required}
        value={value ?? ""} // Controlled input, default empty string
        onChange={(e) => onChange(name, e.target.value)}
        className={`w-full rounded-md border-2 ${
          hasError ? "border-red-500" : "border-customDarkPink"
        } p-2 shadow-custom outline-none focus:ring-2 focus:ring-blue-300 lg:min-h-[50px] ${
          !value ? "text-gray-500" : "" // Style placeholder state
        }`}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id || name}-error` : undefined}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {/* Type of 'option' is inferred as T, 'index' as number */}
        {options.map((option, index) => {
          // Ensure key and value are strings for React/HTML
          const keyValue = option[valueKey];
          const displayValue = option[labelKey];
          return (
            <option
              // Use String() conversion for safety, fallback to index if key value is null/undefined
              key={
                keyValue !== null && keyValue !== undefined
                  ? String(keyValue)
                  : index
              }
              // Value attribute MUST be a string
              value={
                keyValue !== null && keyValue !== undefined
                  ? String(keyValue)
                  : ""
              }
            >
              {/* Display value converted to string */}
              {displayValue !== null && displayValue !== undefined
                ? String(displayValue)
                : ""}
            </option>
          );
        })}
      </select>
      {error && (
        <p
          id={`${id || name}-error`}
          className="mt-1 pl-1 text-xs text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
};

// 3. Apply React.memo to the internal component
// TypeScript might not perfectly carry over the generic type T onto the MemoExoticComponent
// for external type checking, but it works correctly internally and during usage inference.
const SelectInputGroup = memo(SelectInputGroupInternal);

// 4. Set display name for DevTools
SelectInputGroup.displayName = "SelectInputGroup";

export default SelectInputGroup;
