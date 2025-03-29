import Footer from "@/components/Navigations/Footer";
import "../globals.css";

export default function DashboardLayout({
  children,
  loginModal,
}: {
  children: React.ReactNode;
  loginModal: React.ReactNode;
}) {
  return (
    <html>
      <body className="animate-gradient overflow-hidden bg-custom-gradient">
        {loginModal}
        {children}
        <Footer />
      </body>
    </html>
  );
}
