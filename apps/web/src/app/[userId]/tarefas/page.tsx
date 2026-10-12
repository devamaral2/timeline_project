import type { Metadata } from "next";
import { TasksScreen } from "@/components/tasks/TasksScreen";

export const metadata: Metadata = {
  title: "Tarefas — Braid",
  description: "Suas tarefas por status, com prazo, prioridade e subtarefas.",
};

/** As tarefas carregam no cliente: a leitura exige a sessão, que só o navegador sabe renovar. */
export default async function TasksPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <TasksScreen userId={userId} />;
}
