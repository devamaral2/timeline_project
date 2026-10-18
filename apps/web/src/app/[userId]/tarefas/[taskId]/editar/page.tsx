import type { Metadata } from "next";
import { EditTaskRoute } from "@/components/new-item/NewItemRoutes";

export const metadata: Metadata = {
  title: "Editar tarefa — Braid",
};

export default async function Page({ params }: { params: Promise<{ userId: string; taskId: string }> }) {
  const { userId, taskId } = await params;
  return <EditTaskRoute userId={userId} taskId={taskId} />;
}
