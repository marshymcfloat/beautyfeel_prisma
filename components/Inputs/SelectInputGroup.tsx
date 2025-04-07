"use client";

import React, { memo } from "react"; // Import React explicitly and memo

// 1. Define Props Interface with Generic T
// Added constraint: T must have string-indexable keys
type SelectInputGroupProps<T extends { [key: string]: any }> = {
  label: string;
  options: T[];
  valueKey?: keyof T;
  labelKey?: keyof T;
  name: string;
  id?: string;
  value?: string; // Controlled select value (must be string)
  onChange: (key: string, value: string) => void; // Ensure value is string
  placeholder?: string;
  error?: string;
  required?: boolean;
};

// 2. Internal component function
const SelectInputGroupInternal = <T extends { [key: string]: any }>({
  label,
  options,
  valueKey = "id" as keyof T, // Default keys
  labelKey = "title" as keyof T,
  name,
  id,
  value,
  onChange,
  placeholder = "Select an option...",
  error,
  required = false,
}: SelectInputGroupProps<T>) => {
  const hasError = !!error;

  // --- Debugging Log ---
  // console.log(`SelectInputGroup (${name}): Value=${value}, Options=`, options);
  // --- End Debugging Log ---

  return (
    <div className="relative flex w-full flex-col">
      <label
        htmlFor={id || name}
        className="mb-1 text-sm font-medium text-gray-700"
      >
        {" "}
        {/* Use theme color */}
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        name={name}
        id={id || name}
        required={required}
        value={value ?? ""} // Ensure controlled value is always string or ""
        onChange={(e) => onChange(name, e.target.value)} // e.target.value is always string
        className={`w-full rounded-md border-2 ${
          hasError ? "border-red-500" : "border-customDarkPink" // Use theme color
        } p-2 shadow-custom outline-none focus:ring-2 focus:ring-pink-500 lg:min-h-[50px] ${
          // Use theme color focus ring
          !value || value === "" ? "text-gray-500" : "text-customBlack" // Style placeholder vs selected text color
        }`}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id || name}-error` : undefined}
      >
        {/* Placeholder Option */}
        <option value="" disabled>
          {placeholder}
        </option>

        {/* Map Options - with checks for key existence and null/undefined */}
        {options && options.length > 0 ? ( // Check if options array exists and is not empty
          options.map((option, index) => {
            // --- Robust Key/Label Access ---
            const keyVal = option[valueKey]; // Get value using the specified key
            const labelVal = option[labelKey]; // Get label using the specified key

            // Ensure value attribute is a non-empty string
            const optionValue =
              keyVal !== null && keyVal !== undefined ? String(keyVal) : "";
            // Ensure label content is a string
            const optionLabel =
              labelVal !== null && labelVal !== undefined
                ? String(labelVal)
                : `Option ${index + 1}`; // Fallback label

            // --- Debugging Log per Option ---
            // console.log(`  Option ${index}: keyVal=${keyVal}, labelVal=${labelVal}, optionValue=${optionValue}, optionLabel=${optionLabel}`);
            // --- End Debugging Log ---

            // Skip rendering if optionValue is empty (might happen if id/key is null/undefined)
            if (optionValue === "") {
              console.warn(
                `SelectInputGroup (${name}): Skipping option at index ${index} due to empty valueKey ('${String(valueKey)}'). Option data:`,
                option,
              );
              return null;
            }

            return (
              <option
                key={optionValue + "-" + index} // More robust key using value and index
                value={optionValue}
              >
                {optionLabel}
              </option>
            );
          })
        ) : (
          // Optional: Render a disabled option if the options array is empty/null
          <option value="" disabled>
            No options available
          </option>
        )}
      </select>
      {error && (
        <p
          id={`${id || name}-error`}
          className="mt-1 pl-1 text-xs text-red-600" // Use theme error color if desired
        >
          {error}
        </p>
      )}
    </div>
  );
};

// 3. Apply React.memo
const SelectInputGroup = memo(SelectInputGroupInternal);

// 4. Set display name
SelectInputGroup.displayName = "SelectInputGroup";

export default SelectInputGroup;
