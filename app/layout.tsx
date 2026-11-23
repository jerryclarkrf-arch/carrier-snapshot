import type { Metadata, Viewport } from "next";
import {
  Barlow_Condensed,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Carrier Intelligence — FMCSA carrier lookup",
    template: "%s — Carrier Intelligence",
  },
  description:
    "Look up a USDOT or MC carrier: authority, insurance, roadside inspections, crashes, fleet, and contact records from FMCSA public data.",
  applicationName: "Carrier Intelligence",
  keywords: [
    "FMCSA",
    "USDOT",
    "MC number",
    "carrier lookup",
    "motor carrier",
    "authority",
    "insurance",
    "SAFER",
  ],
};

export const viewport: Viewport = {
  themeColor: "#15191e",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}