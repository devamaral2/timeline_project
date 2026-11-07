import type { Metadata } from "next";
import { EventRail } from "./event-rail";

export const metadata: Metadata = {
  title: "Lista de eventos — Braid · Mockup",
  description: "Alternativa visual para a lista de eventos, com dados ilustrativos.",
  robots: { index: false, follow: false },
  icons: { icon: "/mockups/braid/icon.png" },
};

export default function EventListMockup() {
  return <EventRail />;
}
