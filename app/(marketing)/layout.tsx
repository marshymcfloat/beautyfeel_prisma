// app/layout.tsx OR app/(marketing)/layout.tsx
import React from "react";
import Link from "next/link"; // Import Link here
import Footer from "@/components/Navigations/Footer";

// Ensure your custom gradient and colors are defined in tailwind.config.js
// e.g., theme: { extend: { backgroundImage: { 'custom-gradient': '...' }, colors: { customBlack: '...', customDarkPink: '...' } } }

export default function MarketingLayout({
  children,
  loginModal, // Keep if needed, its positioning depends on its implementation
}: {
  children: React.ReactNode;
  loginModal?: React.ReactNode; // Optional is often safer
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {" "}
      {/* Base bg optional */}
      {/* Main content area: grows, centers children, provides context for login link */}
      <div className="relative flex flex-grow animate-gradient items-center justify-center bg-custom-gradient p-4">
        {" "}
        {/* Added padding here for spacing */}
        {/* Login Link: Absolutely positioned relative to the parent div */}
        <Link href={"/login"} legacyBehavior>
          <a className="absolute right-4 top-4 z-10 text-sm text-black underline transition-opacity hover:opacity-80 sm:right-6 sm:top-6">
            login
          </a>
        </Link>
        {/* The Page Content (from DashboardPage) will be rendered and centered here */}
        {children}
        {/* Render loginModal if it exists */}
        {loginModal}
      </div>
      {/* Footer: Sits below the flex-grow content */}
      <Footer />
    </div>
  );
}
