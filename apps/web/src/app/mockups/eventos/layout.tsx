import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { MockupShell } from "./mockup-shell";

const bodyFont = localFont({
  src: "./_assets/Manrope.ttf",
  variable: "--mockup-body-font",
  display: "swap",
});

const brandFont = localFont({
  src: "./_assets/Outfit.ttf",
  variable: "--mockup-brand-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agenda — Braid · Mockup",
  description: "Estudo visual da agenda Braid, com dados ilustrativos.",
  robots: { index: false, follow: false },
  icons: { icon: "/mockups/braid/icon.png" },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function MockupLayout({ children }: { children: ReactNode }) {
  return (
    <MockupShell fontClasses={`${bodyFont.variable} ${brandFont.variable}`}>
      {children}
    </MockupShell>
  );
}
