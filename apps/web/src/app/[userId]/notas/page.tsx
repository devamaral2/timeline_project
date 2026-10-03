import type { Metadata } from "next";
import { NotesScreen } from "@/components/notes/NotesScreen";

export const metadata: Metadata = {
  title: "Notas — Braid",
  description: "Suas notas, soltas ou presas a eventos e tarefas.",
};

/** As notas carregam no cliente: a leitura exige a sessão, que só o navegador sabe renovar. */
export default async function NotesPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <NotesScreen userId={userId} />;
}
