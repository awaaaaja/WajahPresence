import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const firaSans = localFont({
  src: [
    { path: "./fonts/FiraSans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/FiraSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/FiraSans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/FiraSans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-fira-sans",
  display: "swap",
});
const firaCode = localFont({
  src: "./fonts/FiraCode-Variable.woff2",
  variable: "--font-fira-code",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WajahPresence Admin",
  description: "Admin dashboard sistem absensi face recognition + live location",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${firaSans.variable} ${firaCode.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
