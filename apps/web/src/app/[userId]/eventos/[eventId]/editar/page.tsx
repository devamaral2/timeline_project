import type { Metadata } from "next";
import { TaskEditRoute } from "@/components/task-detail/TaskEditRoute";

export const metadata: Metadata = {
  title: "Editar evento — Agente pessoal",
};

export default async function Page({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const { userId, eventId: taskId } = await params;
  return <TaskEditRoute userId={userId} taskId={taskId} />;
}
