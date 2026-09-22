import type { Metadata } from 'next';
import { AgendaPreview } from '../mockups/eventos/agenda-preview';
import { dayKeyOf } from '@repo/timeline';

export const dynamic = 'force-dynamic';

interface UserTimelinePageProps {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({
  params,
}: UserTimelinePageProps): Promise<Metadata> {
  const { userId } = await params;
  return {
    title: `Agenda de ${userId} — Braid`,
    description: 'Sono, treinos, refeições e rotina organizados por dia.',
  };
}

/*
 * A agenda carrega os eventos no cliente.
 *
 * A leitura exige a sessao, e quem sabe renova-la quando o access token de 15
 * minutos expira e o cliente (`authedFetch`). O que sobra para o servidor e o unico
 * dado que ele sabe melhor que o browser — que dia e hoje —, resolvido aqui
 * para que a hidratacao nao discorde do relogio da maquina.
 *
 * O `userId` da rota continua sendo rotulo e navegacao. Ele nunca entra na
 * query: quem responde por autorizacao e o token.
 */
export default async function UserTimelinePage({
  params,
}: UserTimelinePageProps) {
  const { userId } = await params;
  const todayKey = dayKeyOf(new Date());

  return <AgendaPreview userId={userId} todayKey={todayKey} />;
}
