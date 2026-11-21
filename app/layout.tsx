import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Ethiopic } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { ServiceWorkerRegistration } from "@components/layout/sw-register";
import { ToastProvider } from "@components/ui/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Geist has no Ethiopic glyphs; Amharic text falls back to Noto Sans Ethiopic. */
const notoEthiopic = Noto_Sans_Ethiopic({
  variable: "--font-ethiopic",
  subsets: ["ethiopic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    template: "%s | BizManager",
    default: "BizManager — Business Management",
  },
  description:
    "Simple, fast business management for retail shops. " +
    "Inventory, sales, expenses, and reports — works offline.",
  manifest: "/manifest.webmanifest",
};

/**
 * Root layout — wraps every route (auth, onboarding, protected /app subtree).
 * Must NOT perform any auth checks here; authentication is handled in
 * app/app/layout.tsx which only covers /app/* routes.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoEthiopic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}