import type { Metadata } from "next";
import { NoteDetailScreen } from "@/components/notes/NoteDetailScreen";

export const metadata: Metadata = {
  title: "Nota — Braid",
};

export default async function NotePage({ params }: { params: Promise<{ userId: string; noteId: string }> }) {
  const { userId, noteId } = await params;
  return <NoteDetailScreen userId={userId} noteId={noteId} />;
}
