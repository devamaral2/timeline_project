import type { Metadata } from "next";
import { TaskDetailScreen } from "@/components/tasks/TaskDetailScreen";

export const metadata: Metadata = {
  title: "Tarefa — Braid",
};

export default async function TaskPage({ params }: { params: Promise<{ userId: string; taskId: string }> }) {
  const { userId, taskId } = await params;
  return <TaskDetailScreen userId={userId} taskId={taskId} />;
}
