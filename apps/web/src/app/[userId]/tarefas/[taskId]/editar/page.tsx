import { redirect } from "next/navigation";

/** A edição de tarefa virou a edição do evento: o endereço antigo leva para a rota única. */
export default async function Page({ params }: { params: Promise<{ userId: string; taskId: string }> }) {
  const { userId, taskId } = await params;
  redirect(`/${userId}/eventos/${taskId}/editar`);
}
