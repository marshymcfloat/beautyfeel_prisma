import React from "react";
import clsx from "clsx";

type SideBarButtonProps = {
  children: React.ReactNode;
  isActive?: boolean;
  className?: string;
};

export default function SideBarButtons({
  children,
  isActive = false,
  className = "",
}: SideBarButtonProps) {
  const baseClasses = [
    "group",
    "mx-auto my-2",
    "flex items-center",
    "transition-all duration-150 ease-in-out",
    "shadow-custom",
    "cursor-pointer",
  ];

  const responsiveClasses = [
    "size-12 justify-center rounded-full",

    "md:size-auto md:w-[80%] md:min-w-[200px] md:max-w-[250px] md:rounded-3xl md:px-4 md:py-1 md:justify-start",
  ];

  const stateClasses = isActive
    ? "bg-customWhiteBlue bg-opacity-50 shadow-custom border-4 border-black"
    : "bg-customWhiteBlue bg-opacity-35 hover:bg-customWhiteBlue/60 hover:shadow-md ";

  const combinedClassName = clsx(
    baseClasses,
    responsiveClasses,
    stateClasses,
    className,
  );

  return (
    <div className={combinedClassName}>
      {children} {}
    </div>
  );
}
