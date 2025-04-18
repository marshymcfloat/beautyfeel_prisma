import Footer from "@/components/Navigations/Footer";
import "../globals.css";

import { Lora, Montserrat } from "next/font/google";
import { Viewport } from "next";
export const metadata = {
  title: "BeautyFeel",
  description: "Welcome to beautyfeel, where our passion is your beauty!",
  icons: {
    icon: "/favicon.jpg",
  },
};

export const viewport: Viewport = {
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
  loginModal,
}: {
  children: React.ReactNode;
  loginModal: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${lora.variable} ${montserrat.variable}`}>
      <body className="flex min-h-screen w-full animate-gradient flex-col overflow-x-hidden bg-custom-gradient font-sans">
        <div className="flex-grow">
          {children}
          {loginModal}
        </div>
        <Footer />
      </body>
    </html>
  );
}
