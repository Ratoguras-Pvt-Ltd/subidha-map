import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// globals.css maps --font-sans / --font-geist-mono in its @theme block.
const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Subidha Gas Dealer Locator — Find LPG Cylinders Near You",
    template: "%s | Subidha Gas",
  },
  description:
    "Find your nearest Subidha Gas dealer and check live LPG cylinder availability before you travel. Covering Biratnagar, Itahari, Sonapur and across eastern Nepal.",
  keywords: [
    "Subidha Gas",
    "LPG cylinder Nepal",
    "gas dealer Biratnagar",
    "gas dealer Itahari",
    "cylinder stock",
  ],
  openGraph: {
    type: "website",
    siteName: "Subidha Gas Dealer Locator",
    title: "Find Subidha Gas dealers with cylinders in stock",
    description:
      "Live cylinder availability for every Subidha Gas dealer, on one map.",
    locale: "en_NP",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
