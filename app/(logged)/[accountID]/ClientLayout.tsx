"use client";

import React, { useState } from "react";
import ReduxProvider from "@/components/Providers/ReduxProvider";
import SideBar from "@/components/Navigations/SideBar";
import { Menu } from "lucide-react";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <ReduxProvider>
      <div className="flex h-screen animate-gradient bg-custom-gradient">
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
          </main>
        </div>
      </div>
    </ReduxProvider>
  );
}
