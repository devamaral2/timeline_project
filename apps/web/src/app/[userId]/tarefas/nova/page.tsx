import { redirect } from "next/navigation";

/** Não há mais criação de tarefa: é um evento, com ou sem status. */
export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  redirect(`/${userId}/eventos/novo`);
}
