import "../../globals.css";

import type { Metadata } from "next";
import ClientLayout from "./ClientLayout";
import { Viewport } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Dashboard for Beautyfeel employees",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function LoggedInLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <ClientLayout>
      {children}
      {modal}
    </ClientLayout>
  );
}
