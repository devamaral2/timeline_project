import type { Metadata } from "next";
import { TaskListScreen } from "@/components/task-list/TaskListScreen";

export const metadata: Metadata = {
  title: "Tarefas — Agente pessoal",
  description: "Suas tarefas por status, com prazo e prioridade.",
};

/** As tarefas carregam no cliente: a leitura exige a sessão, que só o navegador sabe renovar. */
export default async function TasksPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <TaskListScreen userId={userId} />;
}
