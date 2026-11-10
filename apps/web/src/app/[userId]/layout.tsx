import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = {
  title: "Agenda — Agente pessoal",
  description: "Sono, treinos, refeições e rotina organizados por dia.",
};

export default function UserLayout({ children, params }: { children: ReactNode; params: Promise<{ userId: string }> }) {
  return (
    <UserShell params={params}>
      {children}
    </UserShell>
  );
}

async function UserShell({ children, params }: { children: ReactNode; params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <AppShell live userId={userId}>
      {children}
    </AppShell>
  );
}
