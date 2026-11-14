import type { Metadata } from "next";
import { EventEditRoute } from "@/components/event-detail/EventEditRoute";

export const metadata: Metadata = {
  title: "Editar evento — Agente pessoal",
};

export default async function Page({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const { userId, eventId } = await params;
  return <EventEditRoute userId={userId} eventId={eventId} />;
}
