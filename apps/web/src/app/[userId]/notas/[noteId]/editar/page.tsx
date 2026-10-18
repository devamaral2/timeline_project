import type { Metadata } from "next";
import { EditNoteRoute } from "@/components/new-item/NewItemRoutes";

export const metadata: Metadata = {
  title: "Editar nota — Braid",
};

export default async function Page({ params }: { params: Promise<{ userId: string; noteId: string }> }) {
  const { userId, noteId } = await params;
  return <EditNoteRoute userId={userId} noteId={noteId} />;
}
