import type { Metadata } from "next";
import { NewEventRoute } from "@/components/new-item/NewItemRoutes";

export const metadata: Metadata = {
  title: "Novo evento — Braid",
};

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <NewEventRoute userId={userId} />;
}
