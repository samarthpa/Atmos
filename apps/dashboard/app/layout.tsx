import type { Metadata } from "next";
import "./globals.css";
import Dashboard from "@/components/dashboard";
export const metadata: Metadata = {
  title: "Atmos — Hotel Finance",
  description:
    "A clearer view of every property. Bills, approvals and spending in one place.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Dashboard />
        {children}
      </body>
    </html>
  );
}
