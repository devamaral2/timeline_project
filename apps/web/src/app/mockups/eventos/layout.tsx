import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MockupShell } from "./mockup-shell";

export const metadata: Metadata = {
  title: "Agenda — Agente pessoal · Mockup",
  description: "Estudo visual da agenda, com dados ilustrativos.",
  robots: { index: false, follow: false },
};

export default function MockupLayout({ children }: { children: ReactNode }) {
  return (
    <MockupShell>
      {children}
    </MockupShell>
  );
}
