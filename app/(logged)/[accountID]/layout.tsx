// src/app/RootLayout.tsx
"use client";

import React, { useState } from "react";
import Head from "next/head"; // Import Head
import "../../globals.css";
import SideBar from "@/components/Navigations/SideBar";
import ReduxProvider from "@/components/Providers/ReduxProvider";
import { Menu } from "lucide-react";

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <html lang="en">
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <title>Beautyfeel Admin</title>
      </Head>
      <body
        className="animate-gradient bg-custom-gradient"
        /* style={{ backgroundSize: "200% 200%" }} */
        id="loggedLayout"
      >
        <ReduxProvider>
          <div className="flex h-screen">
            <SideBar
              isSidebarOpen={isSidebarOpen}
              setIsSidebarOpen={setIsSidebarOpen}
            />
            <div className="flex flex-1 flex-col md:pl-[250px]">
              <header className="sticky top-0 z-10 flex items-center justify-between border-b border-customGray/30 bg-customOffWhite p-3 shadow md:hidden">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="rounded-md p-2 text-customBlack/70 hover:text-customDarkPink"
                  aria-label="Open sidebar"
                >
                  <Menu size={24} />
                </button>
                <span className="font-semibold text-customBlack">Menu</span>
                <div className="w-8"></div>
              </header>
              <main
                id="main-content-area"
                className="flex-1 overflow-y-auto bg-transparent p-4 backdrop-blur-sm sm:p-6 lg:p-8"
              >
                {children}
                {modal}
              </main>
            </div>
          </div>
          <div id="modal-root"></div>
        </ReduxProvider>
      </body>
    </html>
  );
}
