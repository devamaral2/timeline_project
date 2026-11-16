import type { Metadata } from "next";
import { TaskCreateRoute } from "@/components/task-detail/TaskCreateRoute";

export const metadata: Metadata = {
  title: "Novo evento — Agente pessoal",
};

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <TaskCreateRoute userId={userId} />;
}
