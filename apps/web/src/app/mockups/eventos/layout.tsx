import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MockupShell } from "./mockup-shell";

export const metadata: Metadata = {
  title: "Agenda — Braid · Mockup",
  description: "Estudo visual da agenda Braid, com dados ilustrativos.",
  robots: { index: false, follow: false },
  icons: { icon: "/mockups/braid/icon.png" },
};

export default function MockupLayout({ children }: { children: ReactNode }) {
  return (
    <MockupShell>
      {children}
    </MockupShell>
  );
}
