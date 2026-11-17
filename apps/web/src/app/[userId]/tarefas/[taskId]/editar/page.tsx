import type { Metadata } from "next";
import { TaskEditRoute } from "@/components/task-detail/TaskEditRoute";

export const metadata: Metadata = {
  title: "Editar tarefa — Agente pessoal",
};

export default async function Page({ params }: { params: Promise<{ userId: string; taskId: string }> }) {
  const { userId, taskId } = await params;
  return <TaskEditRoute userId={userId} taskId={taskId} />;
}
