"use client";

import React, { memo } from "react";
import Spinner from "@/components/ui/Spinner";

type SelectInputGroupProps<T extends { [key: string]: any }> = {
  label: string;
  options: T[];
  valueKey?: keyof T;
  labelKey?: keyof T;
  name: string;
  id?: string;
  value?: string | number | null | undefined;
  onChange: (key: string, value: string) => void;
  placeholder?: string;
  error?: string | null | undefined;
  required?: boolean;
  isLoading?: boolean;

  disabled?: boolean;

  className?: string;
};

const SelectInputGroupInternal = <T extends { [key: string]: any }>({
  label,
  options,
  valueKey = "id" as keyof T,
  labelKey = "title" as keyof T,
  name,
  id,
  value,
  onChange,
  placeholder = "Select...",
  error,
  required = false,
  isLoading = false,
  disabled = false,
  className,
}: SelectInputGroupProps<T>) => {
  const hasError = !!error;
  const inputHeight = "h-[50px]";
  const labelStyle = "block text-sm font-medium text-customBlack/80";

  const selectValue = value != null ? String(value) : "";

  return (
    <div className={`relative flex w-full flex-col ${className}`}>
      <label htmlFor={id || name} className={labelStyle}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {isLoading ? (
        <div
          className={`flex ${inputHeight} items-center justify-center rounded-md border-2 border-customGray bg-gray-50`}
        >
          {}
          {}
          <Spinner />
        </div>
      ) : (
        <select
          name={name}
          id={id || name}
          required={required}
          value={selectValue}
          onChange={(e) => onChange(name, e.target.value)}
          disabled={disabled}
          className={`${inputHeight} w-full appearance-none rounded-md border-2 ${hasError ? "border-red-500" : "border-gray-300"} bg-white p-2 pl-3 pr-8 shadow-sm outline-none focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink ${!selectValue ? "text-gray-500" : "text-customBlack"} disabled:cursor-not-allowed disabled:bg-gray-100`}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id || name}-error` : undefined}
        >
          <option value="" disabled>
            {placeholder}
          </option>

          {options && options.length > 0
            ? options.map((option, index) => {
                const keyVal = option[valueKey];
                const labelVal = option[labelKey];
                const optionValue = keyVal != null ? String(keyVal) : "";
                const optionLabel =
                  labelVal != null ? String(labelVal) : `Option ${index + 1}`;

                if (optionValue === "" && placeholder) {
                  return null;
                }

                return (
                  <option key={`${optionValue}-${index}`} value={optionValue}>
                    {optionLabel}
                  </option>
                );
              })
            : !isLoading && (
                <option value="" disabled>
                  No options
                </option>
              )}
        </select>
      )}

      {!isLoading && (
        <div className="pointer-events-none absolute inset-y-0 bottom-0 right-0 top-0 flex items-center px-2 text-gray-500">
          <svg className="h-4 w-4 fill-current" xmlns="" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      )}

      {hasError && (
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

const SelectInputGroup = memo(SelectInputGroupInternal) as <
  T extends { [key: string]: any },
>(
  props: SelectInputGroupProps<T>,
) => React.JSX.Element;

export default SelectInputGroup;
