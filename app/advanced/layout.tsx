import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advanced search",
  description:
    "Filter the FMCSA census by authority date, identity, location, authority status, safety, fleet size, and cargo.",
};

export default function AdvancedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
