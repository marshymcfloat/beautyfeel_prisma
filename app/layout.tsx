// app/layout.tsx
import React from "react";
import "./globals.css"; // Import global styles here

import { Lora, Montserrat } from "next/font/google";

export const metadata = {
  title: "BeautyFeel",
  description: "Welcome to beautyfeel, where our passion is your beauty!",
  icons: {
    icon: "/favicon.jpg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const lora = Lora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-lora",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
  weight: ["300", "400", "500", "700"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${lora.variable} ${montserrat.variable}`}>
      <body className="flex min-h-screen w-full flex-col overflow-x-hidden font-sans">
        {children}
        <div id="modal-root"></div>
      </body>
    </html>
  );
}
