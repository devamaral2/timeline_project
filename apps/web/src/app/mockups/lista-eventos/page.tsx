import type { Metadata } from "next";
import { EventRail } from "./event-rail";

export const metadata: Metadata = {
  title: "Lista de eventos — Agente pessoal · Mockup",
  description: "Alternativa visual para a lista de eventos, com dados ilustrativos.",
  robots: { index: false, follow: false },
};

export default function EventListMockup() {
  return <EventRail />;
}
