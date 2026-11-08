import type { Metadata } from "next";
import { EditEventRoute } from "@/components/new-item/NewItemRoutes";

export const metadata: Metadata = {
  title: "Editar evento — Agente pessoal",
};

export default async function Page({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const { userId, eventId } = await params;
  return <EditEventRoute userId={userId} eventId={eventId} />;
}
