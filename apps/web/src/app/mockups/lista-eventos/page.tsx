import type { Metadata } from "next";
import { TaskRail } from "./task-rail";

export const metadata: Metadata = {
  title: "Lista de eventos — Agente pessoal · Mockup",
  description: "Alternativa visual para a lista de eventos, com dados ilustrativos.",
  robots: { index: false, follow: false },
};

export default function TaskListMockup() {
  return <TaskRail />;
}
