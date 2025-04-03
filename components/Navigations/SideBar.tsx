// components/layout/SideBar.tsx (Adjust path if needed)
"use client";

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
} from "lucide-react";
import clsx from "clsx"; // Import clsx here too

import Separator from "../ui/Separator"; // Assuming path is correct
import SideBarButtons from "../Buttons/SideBarButtons"; // Assuming path is correct

// Define the structure for a navigation item
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export default function SideBar() {
  const { accountID: rawAccountID } = useParams();
  const pathname = usePathname(); // Get the current path

  // Ensure accountID is a string or handle the case where it might not be
  const accountID = Array.isArray(rawAccountID)
    ? rawAccountID[0]
    : rawAccountID;

  // Define navigation items in an array
  const navItems: NavItem[] = accountID
    ? [
        { href: `/${accountID}`, label: "Home", icon: House },
        { href: `/${accountID}/cashier`, label: "Cashier", icon: Banknote },
        { href: `/${accountID}/work`, label: "Work", icon: NotepadText },
        {
          href: `/${accountID}/manage`,
          label: "Manage",
          icon: Settings2,
        },
      ]
    : [];

  const handleLogout = () => {
    // Implement your logout logic here
    console.log("Logout clicked");
    // e.g., clear session, dispatch logout action, router.push('/login');
  };

  // Helper function to check for active link
  const isActive = (href: string) => {
    if (!pathname) return false;
    // Exact match
    if (pathname === href) return true;
    // Check if it's a parent route (excluding the base '/' route condition)
    if (href !== `/${accountID}` && pathname.startsWith(href + "/"))
      return true;
    return false;
  };

  // Loading/Error state if accountID is missing
  if (!accountID) {
    // Render a loading state or null/error message
    // This prevents errors if the component renders before accountID is available
    return null; // Or optionally a loading indicator
  }

  return (
    // Single navigation structure handling responsiveness internally
    // Ensure 'bg-white' or your desired sidebar background color is applied
    // Added 'fixed' and 'z-20' for potential overlay scenarios, adjust as needed
    <nav className="fixed left-0 top-0 z-20 flex h-screen w-[60px] flex-col items-center shadow-lg md:w-[25%] md:max-w-[300px]">
      {/* Header */}
      <header className="relative flex w-full flex-col items-center justify-center p-3 py-4 md:flex-row md:items-center md:justify-start md:p-6 md:py-8">
        <Image
          width={55}
          height={55}
          className="flex-shrink-0 md:mr-4" // Added flex-shrink-0
          priority
          alt="Beautyfeel Icon"
          src={"/btfeel-icon.png"} // Ensure this path is correct in your public folder
        />
        <h1 className="hidden flex-grow font-bold uppercase text-gray-800 md:block lg:text-[20px] lg:tracking-widest">
          beautyfeel
        </h1>
        {/* Separator */}
        <div className="absolute bottom-0 left-1/2 h-[2px] w-[80%] -translate-x-1/2 transform bg-gray-800/50 md:w-[90%]"></div>
      </header>

      {/* Navigation Links */}
      <div className="flex w-full flex-grow flex-col overflow-y-auto px-2 pt-4 md:px-4">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            // Pass active state to SideBarButtons
            <SideBarButtons key={item.href} isActive={active}>
              <Link
                href={item.href}
                className="flex w-full items-center justify-center p-2 md:justify-start md:p-0"
                aria-label={item.label} // Accessibility for mobile
              >
                <item.icon
                  size={24}
                  aria-hidden="true"
                  // Use clsx for conditional styling of icon color
                  className={clsx(
                    "flex-shrink-0 transition-colors duration-150 md:mr-3",
                    active
                      ? "text-gray-900" // Dark icon when active
                      : "text-gray-600 group-hover:text-gray-800", // Default/hover icon color
                  )}
                />
                {/* Label visible only on medium+ screens */}
                <span
                  className={clsx(
                    "hidden whitespace-nowrap transition-colors duration-150 md:inline",
                    active
                      ? "font-semibold text-gray-900" // Dark, bold text when active
                      : "text-gray-700 group-hover:text-gray-800", // Default/hover text color
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </SideBarButtons>
          );
        })}
      </div>

      {/* Footer Section for Logout */}
      <div className="relative w-full shrink-0 px-2 pb-4 pt-2 md:px-4">
        {/* Separator */}
        <div className="absolute left-1/2 top-0 h-[2px] w-[80%] -translate-x-1/2 transform bg-gray-800/50 md:w-[90%]"></div>
        {/* Use SideBarButtons for consistent styling wrapper */}
        <SideBarButtons>
          <button
            onClick={handleLogout}
            // Apply group styling directly to the button content
            className="group flex w-full items-center justify-center p-2 md:justify-start md:p-0"
            aria-label="Logout"
          >
            <LogOut
              size={24}
              aria-hidden="true"
              className="flex-shrink-0 text-gray-600 transition-colors duration-150 group-hover:text-gray-800 md:mr-3"
            />
            <span className="hidden whitespace-nowrap text-gray-700 transition-colors duration-150 group-hover:text-gray-800 md:inline">
              Logout
            </span>
          </button>
        </SideBarButtons>
      </div>
    </nav>
  );
}
