// app/(logged)/layout.tsx

// Keep globals.css import ONLY if it contains styles SPECIFICALLY needed
// by ClientLayout or other components loaded ONLY within this logged group,
// AND those styles are NOT already in the root layout's global import.
// Usually, you only need ONE global import in the root layout.
// Consider removing this line if app/layout.tsx already imports globals.css.
import "../../globals.css";

import type { Metadata } from "next";
import ClientLayout from "./ClientLayout"; // Assuming this component provides the shared UI (navbar, sidebar etc.) for logged-in users
import { Viewport } from "next";

// Metadata specific to the logged-in section (will merge with root metadata)
export const metadata: Metadata = {
  title: "Dashboard", // Example: Might be overridden by specific pages later
  description: "Dashboard for Beautyfeel employees",
  // icons might be inherited from root, or defined here if specific
};

// Viewport settings specific to the logged-in section (will override root viewport)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function LoggedInLayout({
  // Renamed function for clarity
  children,
  modal, // Assuming you have a parallel route named @modal in this group
}: {
  children: React.ReactNode; // This will be the page.tsx content
  modal: React.ReactNode; // This will be the @modal/../page.tsx content
}) {
  // --- REMOVED <html> and <body> tags ---
  // This layout renders *inside* the root layout's <body>

  return (
    // You might wrap this in a React Fragment (<>) if ClientLayout
    // or the modal-root div needs a sibling relationship, but usually
    // rendering ClientLayout directly is fine.
    <ClientLayout>
      {" "}
      {/* This component likely contains your Navbar, Sidebar etc. */}
      {children} {/* Renders the actual page content */}
      {modal} {/* Renders the content from the @modal parallel route */}
      {/* This div is likely for React Portals (e.g., Headless UI modals).
          It's okay here if portals are scoped to the logged-in section,
          or it could be moved to the root layout if portals are used globally. */}
    </ClientLayout>
  );
}
