import type { Metadata } from "next";
import { EventCreateRoute } from "@/components/event-detail/EventCreateRoute";

export const metadata: Metadata = {
  title: "Novo evento — Agente pessoal",
};

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <EventCreateRoute userId={userId} />;
}
