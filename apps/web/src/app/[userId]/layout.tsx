import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { MockupShell } from "../mockups/eventos/mockup-shell";

const bodyFont = localFont({
  src: "../mockups/eventos/_assets/Manrope.ttf",
  variable: "--mockup-body-font",
  display: "swap",
});

const brandFont = localFont({
  src: "../mockups/eventos/_assets/Outfit.ttf",
  variable: "--mockup-brand-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agenda — Braid",
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
    <MockupShell
      fontClasses={`${bodyFont.variable} ${brandFont.variable}`}
      live
      userId={userId}
    >
      {children}
    </MockupShell>
  );
}
