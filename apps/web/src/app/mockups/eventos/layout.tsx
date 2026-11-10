import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = {
  title: "Agenda — Agente pessoal · Mockup",
  description: "Estudo visual da agenda, com dados ilustrativos.",
  robots: { index: false, follow: false },
};

export default function MockupLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      {children}
    </AppShell>
  );
}
