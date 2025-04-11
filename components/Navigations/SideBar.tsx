// components/layout/SideBar.tsx
"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  House,
  LogOut,
  NotepadText,
  Banknote,
  Settings2,
  type LucideIcon,
  X,
} from "lucide-react";
import clsx from "clsx";

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export default function SideBar({
  isSidebarOpen,
  setIsSidebarOpen,
}: SidebarProps) {
  const { accountID: rawAccountID } = useParams();
  const pathname = usePathname();
  const accountID = Array.isArray(rawAccountID)
    ? rawAccountID[0]
    : rawAccountID;
  const baseDashboardPath = accountID ? `/${accountID}` : "#";

  const navItems: NavItem[] = accountID
    ? [
        { href: baseDashboardPath, label: "Home", icon: House },
        {
          href: `${baseDashboardPath}/cashier`,
          label: "Cashier",
          icon: Banknote,
        },
        { href: `${baseDashboardPath}/work`, label: "Work", icon: NotepadText },
        {
          href: `${baseDashboardPath}/manage`,
          label: "Manage",
          icon: Settings2,
        },
      ]
    : [];

  const handleLogout = () => console.log("Logout clicked");

  const isActive = (href: string) => {
    if (!pathname || href === "#") return false;
    if (href === baseDashboardPath) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  if (!accountID) {
    return (
      <div className="fixed left-0 top-0 z-30 flex h-screen w-[60px] flex-col items-center bg-customOffWhite shadow-lg md:w-[250px]">
        {" "}
        {/* Minimal placeholder */}{" "}
      </div>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={clsx(
          "fixed inset-0 z-20 bg-black bg-opacity-40 transition-opacity duration-300 md:hidden",
          isSidebarOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar Navigation */}
      <nav
        className={clsx(
          "fixed left-0 top-0 z-30 flex h-screen w-[250px] flex-col border-r border-customGray/30 bg-customOffWhite shadow-lg transition-transform duration-300 ease-in-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          "md:w-[250px] md:translate-x-0",
        )}
      >
        {/* Header */}
        <header className="relative flex w-full items-center justify-between border-b border-customGray/30 p-4 pt-5 md:justify-start md:px-5 md:py-6">
          <Link href={baseDashboardPath} className="flex items-center gap-3">
            <Image
              width={45}
              height={45}
              className="flex-shrink-0"
              priority
              alt="Icon"
              src={"/btfeel-icon.png"}
            />
            <h1 className="hidden text-lg font-bold uppercase tracking-wider text-customBlack md:block">
              beautyfeel
            </h1>
          </Link>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 text-customBlack/60 hover:text-customDarkPink md:hidden"
            aria-label="Close sidebar"
          >
            {" "}
            <X size={20} />{" "}
          </button>
        </header>

        {/* Navigation Links */}
        <div className="flex-grow space-y-1.5 overflow-y-auto px-3 py-4">
          {" "}
          {/* Slightly reduced space */}
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={clsx(
                  "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150", // Added group for icon hover
                  active
                    ? "bg-customDarkPink/10 font-semibold text-customDarkPink" // Active state style
                    : "text-customBlack/70 hover:bg-customGray/50 hover:text-customBlack", // Inactive state style
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon
                  size={20}
                  className={clsx(
                    "mr-3 flex-shrink-0 transition-colors duration-150",
                    active
                      ? "text-customDarkPink"
                      : "text-customBlack/60 group-hover:text-customBlack/80", // Icon colors match text state
                  )}
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Footer Section for Logout */}
        <div className="shrink-0 border-t border-customGray/30 px-3 py-3">
          <button
            onClick={handleLogout}
            className={clsx(
              "group flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
              "text-customBlack/70 hover:bg-red-100/50 hover:text-red-700",
            )}
            aria-label="Logout"
          >
            <LogOut
              size={20}
              className="mr-3 flex-shrink-0 text-customBlack/60 group-hover:text-red-700"
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
}
