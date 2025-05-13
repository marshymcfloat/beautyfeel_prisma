import React, { Suspense } from "react";
import Link from "next/link";
import Footer from "@/components/Navigations/Footer";

export default function MarketingLayout({
  children, // This prop receives the content of the regular pages (like app/(marketing)/login/page.tsx)
  loginModal, // This prop receives the content from the @loginModal parallel route (the intercepted modal)
}: {
  children: React.ReactNode;
  loginModal: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="relative flex flex-grow animate-gradient items-center justify-center bg-custom-gradient p-4">
        <Link href={"/login"} legacyBehavior>
          <a className="absolute right-4 top-4 z-10 text-sm text-black underline transition-opacity hover:opacity-80 sm:right-6 sm:top-6">
            login
          </a>
        </Link>
        <Suspense fallback={null}>{children}</Suspense>
        <Suspense fallback={null}>{loginModal}</Suspense>{" "}
      </div>

      <Footer />
    </div>
  );
}
