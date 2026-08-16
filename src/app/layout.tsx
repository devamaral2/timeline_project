import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "All Tracker",
  description: "A personal timeline and daily overview.",
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
