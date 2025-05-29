import React from "react";

export default function DialogTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h1 className="text-center text-lg font-semibold uppercase tracking-wider text-customBlack md:text-xl">
      {children}
    </h1>
  );
}
