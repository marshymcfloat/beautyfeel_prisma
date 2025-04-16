// components/Dialog/DialogTitle.tsx
import React from "react";

export default function DialogTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  // This styling is applied when you use <DialogTitle> within your custom title structure
  return (
    <h1 className="text-center text-lg font-semibold uppercase tracking-wider text-customBlack md:text-xl">
      {children}
    </h1>
  );
}
