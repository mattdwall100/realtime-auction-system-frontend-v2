import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Real-time Auction System",
  description: "Create auctions and place live bids",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <Header />
            <main className="page">{children}</main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
