import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alerts & watchlist",
  description:
    "Watch carriers and review changes to authority, insurance, contact details, and census status.",
};

export default function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
