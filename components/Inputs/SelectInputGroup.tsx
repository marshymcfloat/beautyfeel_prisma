// components/Inputs/SelectInputGroup.tsx
"use client";

import React, { memo } from "react"; // Import memo

type SelectInputGroupProps<T extends { [key: string]: any }> = {
  label: string;
  options: T[];
  valueKey?: keyof T;
  labelKey?: keyof T;
  name: string;
  id?: string;
  // Change this line: Allow string, null, or undefined
  value?: string | null | undefined;
  onChange: (key: string, value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
};

// No changes needed within the component function itself
const SelectInputGroupInternal = <T extends { [key: string]: any }>({
  label,
  options,
  valueKey = "id" as keyof T,
  labelKey = "title" as keyof T,
  name,
  id,
  value, // This 'value' can now be string | null | undefined
  onChange,
  placeholder = "Select...",
  error,
  required = false,
}: SelectInputGroupProps<T>) => {
  const hasError = !!error;
  const inputHeight = "h-[50px]"; // Consistent height
  const labelStyle = "mb-1 block text-sm font-medium text-customBlack/80"; // Consistent Label

  return (
    <div className="relative flex w-full flex-col">
      <label htmlFor={id || name} className={labelStyle}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        name={name}
        id={id || name}
        required={required}
        // value ?? "" correctly handles string, null, or undefined
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className={`${inputHeight} w-full appearance-none rounded-md border-2 ${hasError ? "border-red-500" : "border-customDarkPink/60"} bg-white p-2 pl-3 pr-8 shadow-sm outline-none focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink ${!value || value === "" ? "text-gray-500" : "text-customBlack"}`} // Added appearance-none, padding right for arrow
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id || name}-error` : undefined}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options && options.length > 0 ? (
          options.map((option, index) => {
            const keyVal = option[valueKey];
            const labelVal = option[labelKey];
            const optionValue = keyVal != null ? String(keyVal) : "";
            const optionLabel =
              labelVal != null ? String(labelVal) : `Option ${index + 1}`;
            if (optionValue === "") return null;
            return (
              <option key={optionValue + "-" + index} value={optionValue}>
                {optionLabel}
              </option>
            );
          })
        ) : (
          <option value="" disabled>
            No options
          </option>
        )}
      </select>
      {/* Arrow Icon */}
      <div className="pointer-events-none absolute inset-y-0 right-0 top-[calc(0.625rem+1.5rem)] flex items-center px-2 text-gray-500">
        {" "}
        {/* Adjust top based on label height + margin */}
        <svg
          className="h-4 w-4 fill-current"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
        >
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
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

const SelectInputGroup = memo(SelectInputGroupInternal);
SelectInputGroup.displayName = "SelectInputGroup";
export default SelectInputGroup;
