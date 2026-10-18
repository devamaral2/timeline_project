import type { Metadata } from "next";
import { NewTaskRoute } from "@/components/new-item/NewItemRoutes";

export const metadata: Metadata = {
  title: "Nova tarefa — Braid",
};

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <NewTaskRoute userId={userId} />;
}
