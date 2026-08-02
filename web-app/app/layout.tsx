import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import PwaRegister from "@/components/pwa-register";

const outfit = localFont({
  src: "./fonts/Outfit-Variable.woff2",
  variable: "--font-outfit",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WajahPresence",
  description: "Sistem absensi face recognition + live location",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WajahPresence",
  },
};

// Mobile-first: viewport standar + viewport-fit untuk safe-area PWA.
// Zoom tidak dikunci (aksesibilitas WCAG 1.4.4).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${outfit.variable} antialiased`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
