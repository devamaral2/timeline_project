import type { Metadata } from 'next';
import { TimelineList } from '@/components/events/TimelineList';
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
    title: `Timeline de ${userId} — Time Composure`,
    description: 'Sono, treinos, refeições e rotina organizados por dia.',
  };
}

/*
 * A pagina nao le mais eventos.
 *
 * A leitura passou a exigir o ID token do Firebase, e um Server Component nao
 * tem nenhum: o token vive no cliente. O que sobra para o servidor e o unico
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

  return (
    // Sem fundo proprio: o brilho ambiente do globals.css fica atras do
    // body, e um bloco opaco aqui o apagaria.
    <div className="min-h-screen">
      <TimelineList userId={userId} todayKey={todayKey} />
    </div>
  );
}
