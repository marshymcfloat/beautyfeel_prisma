"use client";

import "../../globals.css";
import SideBar from "@/components/Navigations/SideBar";
import ReduxProvider from "@/components/Providers/ReduxProvider";

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="animate-gradient overflow-hidden bg-custom-gradient"
        id="loggedLayout"
      >
        <ReduxProvider>
          <SideBar />
          {modal}
          {children}
        </ReduxProvider>
      </body>
    </html>
  );
}
