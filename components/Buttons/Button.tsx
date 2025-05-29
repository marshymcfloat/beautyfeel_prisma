import React from "react";
import clsx from "clsx";

type ButtonSize = "xs" | "sm" | "md" | "lg";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  invert?: boolean;
  children?: React.ReactNode;
  className?: string;
  size?: ButtonSize;
  icon?: React.ReactNode;
  variant?: ButtonVariant;
};

export default function Button({
  invert = false,
  children,
  type = "button",
  className = "",
  disabled = false,
  size = "md",
  icon,
  variant,
  ...rest
}: ButtonProps) {
  const baseStyles = `
    inline-flex items-center justify-center
    border-2 rounded-md font-medium
    transition-all duration-150 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-60 disabled:cursor-not-allowed
  `;

  let sizeStyles = "";
  switch (size) {
    case "xs":
      sizeStyles = clsx(
        children ? "px-2 py-0.5" : "px-1.5 py-0.5",
        "text-[10px] min-h-[24px]",
      );
      break;
    case "sm":
      sizeStyles = clsx(
        children ? "px-3 py-1.5" : "px-1.5 py-1.5",
        "text-xs min-h-[30px]",
      );
      break;
    case "lg":
      sizeStyles = clsx(
        children ? "px-6 py-3" : "px-3 py-3",
        "text-base min-h-[50px]",
      );
      break;
    case "md":
    default:
      sizeStyles = clsx(
        children ? "px-4 py-2" : "px-2 py-2",
        "text-sm min-h-[40px]",
      );
      break;
  }

  let colorStyles = "";

  if (variant !== undefined) {
    switch (variant) {
      case "outline":
        colorStyles = `border-customDarkPink text-customDarkPink bg-transparent hover:bg-customDarkPink hover:text-customOffWhite focus:ring-customDarkPink`;
        break;
      case "secondary":
        colorStyles = `border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400`;
        break;
      case "ghost":
        colorStyles = `border-transparent bg-transparent text-customDarkPink hover:text-customDarkPink/80 focus:ring-customDarkPink`;

        break;
      case "primary":
      default:
        colorStyles = `border-customDarkPink bg-customDarkPink text-customOffWhite hover:bg-transparent hover:text-customDarkPink focus:ring-customDarkPink`;
        break;
    }
  } else {
    if (invert) {
      colorStyles = `border-customDarkPink text-customDarkPink bg-transparent hover:bg-customDarkPink hover:text-customOffPink focus:ring-customDarkPink`;
    } else {
      colorStyles = `border-customDarkPink bg-customDarkPink text-customOffWhite hover:bg-transparent hover:text-customDarkPink focus:ring-customDarkPink`;
    }
  }

  const iconMarginClass = children ? "mr-1.5" : "";

  const combinedClassName = clsx(
    baseStyles,
    sizeStyles,
    colorStyles,
    className,
  );

  return (
    <button
      type={type}
      className={combinedClassName}
      disabled={disabled}
      {...rest}
    >
      {icon && (
        <span className={clsx("flex-shrink-0", iconMarginClass)}>{icon}</span>
      )}
      {children} {}
    </button>
  );
}
