// components/Dialog/DialogTitle.tsx (Ensure React is imported)
import React from "react";

export default function DialogTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  // Apply styling directly here
  return (
    <h1 className="text-center text-lg font-semibold uppercase tracking-wider text-customBlack md:text-xl">
      {children}
    </h1>
  );
}
