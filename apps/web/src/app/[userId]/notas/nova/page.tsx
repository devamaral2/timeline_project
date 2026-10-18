import type { Metadata } from "next";
import { NewNoteRoute } from "@/components/new-item/NewItemRoutes";

export const metadata: Metadata = {
  title: "Nova nota — Braid",
};

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <NewNoteRoute userId={userId} />;
}
