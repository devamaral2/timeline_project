import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "All Tracker",
  description: "Temporary placeholder frontend.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
