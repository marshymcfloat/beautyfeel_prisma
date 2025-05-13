import React from "react";
import "./globals.css";

import { Lora, Montserrat, Lato } from "next/font/google";
import AuthProvider from "@/components/Providers/SessionProvider";

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

const lato = Lato({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-lato",
  weight: ["300", "400", "700"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${lora.variable} ${montserrat.variable} ${lato.variable}`}
    >
      <body className="flex min-h-screen w-full flex-col overflow-x-hidden">
        <AuthProvider>{children}</AuthProvider>

        <div id="modal-root"></div>
      </body>
    </html>
  );
}
