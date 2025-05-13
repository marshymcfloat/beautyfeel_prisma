"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  House,
  LogOut,
  NotepadText,
  Banknote,
  Settings2,
  type LucideIcon,
  X,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { Role } from "@prisma/client"; // Import Role enum

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredRoles?: Role[];
}

export default function SideBar({
  isSidebarOpen,
  setIsSidebarOpen,
}: SidebarProps) {
  const { accountID: rawAccountID } = useParams();
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();

  const accountID = Array.isArray(rawAccountID)
    ? rawAccountID[0]
    : rawAccountID;

  const loggedInUserId = session?.user?.id;
  const userRoles: Role[] = session?.user?.role || [];

  const baseDashboardPath = loggedInUserId ? `/${loggedInUserId}` : "#";

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  const allNavItems: NavItem[] = useMemo(
    () => [
      {
        href: baseDashboardPath,
        label: "Home",
        icon: House,
        requiredRoles: [],
      },
      {
        href: loggedInUserId ? `/${loggedInUserId}/cashier` : "#",
        label: "Cashier",
        icon: Banknote,
        requiredRoles: [Role.CASHIER, Role.OWNER],
      },
      {
        href: loggedInUserId ? `/${loggedInUserId}/work` : "#",
        label: "Work",
        icon: NotepadText,
        requiredRoles: [Role.WORKER, Role.OWNER],
      },
      {
        href: loggedInUserId ? `/${loggedInUserId}/manage` : "#",
        label: "Manage",
        icon: Settings2,
        requiredRoles: [Role.OWNER, Role.ATTENDANCE_CHECKER],
      },
    ],
    [baseDashboardPath, loggedInUserId],
  );

  const visibleNavItems = useMemo(() => {
    if (!loggedInUserId || userRoles.length === 0) {
      return [];
    }
    return allNavItems.filter((item) => {
      if (item.href === "#") return false;
      if (!item.requiredRoles || item.requiredRoles.length === 0) {
        return true;
      }
      return userRoles.some((role) => item.requiredRoles!.includes(role));
    });
  }, [loggedInUserId, userRoles, allNavItems]);

  // Corrected isActive function
  const isActive = useCallback(
    (href: string) => {
      if (sessionStatus === "loading" || href === "#") return false;

      // 1. Exact match has the highest priority and works for all links.
      if (pathname === href) {
        return true;
      }

      // 2. For the Home link (baseDashboardPath), it should ONLY be active on an exact match.
      // If we've reached this point and href is baseDashboardPath, it means pathname !== href,
      // so the Home link is not active.
      if (href === baseDashboardPath) {
        return false;
      }

      // 3. For other links (non-Home, non-"#"), check if the current pathname
      // starts with the link's href followed by a '/', indicating a sub-page.
      // Example: href="/[id]/manage", pathname="/[id]/manage/users"
      if (href !== "#" && pathname.startsWith(href + "/")) {
        return true;
      }

      return false;
    },
    [sessionStatus, baseDashboardPath, pathname],
  );

  useEffect(() => {
    if (navigatingTo) {
      // If we are in a "navigating to" state
      if (isActive(navigatingTo)) {
        // And the target has become active
        setNavigatingTo(null); // Clear it - success
      } else if (
        pathname !== navigatingTo &&
        !pathname.startsWith(navigatingTo + "/")
      ) {
        // Or, if the current path is NEITHER the target NOR a subpath of the target
        // (e.g., browser back, redirect, new nav click before old one finished)
        // Clear the stale navigatingTo state.
        setNavigatingTo(null);
      }
    }
  }, [pathname, navigatingTo, isActive]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    console.log("Attempting logout...");
    try {
      await signOut({ callbackUrl: "/" });
      console.log("SignOut initiated, redirecting...");
    } catch (error) {
      console.error("Logout failed:", error);
      setIsLoggingOut(false);
    }
  };

  if (sessionStatus === "loading") {
    return (
      <div className="fixed left-0 top-0 z-30 flex h-screen w-[60px] flex-col items-center bg-customOffWhite shadow-lg md:w-[250px]">
        <div className="p-4 pt-5 md:px-5 md:py-6">
          <Loader2 className="h-8 w-8 animate-spin text-customDarkPink/50" />
        </div>
      </div>
    );
  }

  return (
    <>
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
      <nav
        className={clsx(
          "fixed left-0 top-0 z-30 flex h-screen w-[250px] flex-col border-r border-customGray/30 bg-customOffWhite shadow-lg transition-transform duration-300 ease-in-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          "md:w-[250px] md:translate-x-0",
        )}
      >
        <header className="relative flex w-full items-center justify-between border-b border-customGray/30 p-4 pt-5 md:justify-start md:px-5 md:py-6">
          <Link
            href={loggedInUserId ? baseDashboardPath : "/"}
            className="flex items-center gap-3"
            onClick={() => {
              if (
                loggedInUserId &&
                baseDashboardPath !== "#" &&
                !isActive(baseDashboardPath)
              ) {
                setNavigatingTo(baseDashboardPath);
              }
            }}
          >
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
            <X size={20} />
          </button>
        </header>

        <div className="flex-grow space-y-1.5 overflow-y-auto px-3 py-4">
          {visibleNavItems.map((item) => {
            const active = isActive(item.href);
            const isCurrentlyNavigating = navigatingTo === item.href && !active;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={clsx(
                  "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-customDarkPink/10 font-semibold text-customDarkPink"
                    : "text-customBlack/70 hover:bg-customGray/50 hover:text-customBlack",
                  item.href === "#" || isCurrentlyNavigating
                    ? "pointer-events-none opacity-70"
                    : "",
                )}
                aria-current={active ? "page" : undefined}
                aria-disabled={item.href === "#" || isCurrentlyNavigating}
                aria-busy={isCurrentlyNavigating ? "true" : undefined}
                onClick={(e) => {
                  if (item.href === "#") {
                    e.preventDefault();
                    return;
                  }
                  if (!active && navigatingTo !== item.href) {
                    setNavigatingTo(item.href);
                  }
                }}
              >
                {isCurrentlyNavigating ? (
                  <Loader2
                    size={20}
                    className="mr-3 h-5 w-5 flex-shrink-0 animate-spin text-customDarkPink"
                    aria-hidden="true"
                  />
                ) : (
                  <item.icon
                    size={20}
                    className={clsx(
                      "mr-3 flex-shrink-0 transition-colors duration-150",
                      active
                        ? "text-customDarkPink"
                        : "text-customBlack/60 group-hover:text-customBlack/80",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="whitespace-nowrap">
                  {isCurrentlyNavigating ? "Loading..." : item.label}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-customGray/30 px-3 py-3">
          {loggedInUserId && (
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={clsx(
                "group flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                "text-customBlack/70 hover:bg-red-100/50 hover:text-red-700",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
              aria-label="Logout"
            >
              {isLoggingOut ? (
                <Loader2
                  size={20}
                  className="mr-3 h-5 w-5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <LogOut
                  size={20}
                  className="mr-3 flex-shrink-0 text-customBlack/60 group-hover:text-red-700"
                  aria-hidden="true"
                />
              )}
              <span className="whitespace-nowrap">
                {isLoggingOut ? "Logging out..." : "Logout"}
              </span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
