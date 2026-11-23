import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account access",
  description:
    "Sign in or create a Carrier Intelligence account to watch carriers and export results.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
