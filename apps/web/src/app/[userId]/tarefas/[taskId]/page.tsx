import { redirect } from "next/navigation";

/** O detalhe de tarefa virou o detalhe de evento: o endereço antigo leva para a rota única. */
export default async function TaskPage({ params }: { params: Promise<{ userId: string; taskId: string }> }) {
  const { userId, taskId } = await params;
  redirect(`/${userId}/eventos/${taskId}`);
}
