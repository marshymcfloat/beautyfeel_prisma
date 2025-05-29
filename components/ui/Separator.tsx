import clsx from "clsx";

export default function Separator({
  orientation = "horizontal",
  className = "",
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const baseStyle = "rounded-2xl bg-gray-800 shadow-2xl";

  const orientationStyle =
    orientation === "horizontal"
      ? "w-[90%] mx-auto h-[5px]"
      : "w-[5px] h-[90%] my-auto mx-auto";

  return <div className={clsx(baseStyle, orientationStyle, className)} />;
}
