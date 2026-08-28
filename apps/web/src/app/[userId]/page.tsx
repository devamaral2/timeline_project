import type { Metadata } from 'next';
import type { TimelineEventCardDto } from '@repo/entities/contracts';
import { TimelineList } from '@/components/events/TimelineList';
import { fetchFromBackend } from '@/lib/api/backend';
import { dayEventsUrl, dayKeyOf } from '@repo/timeline';

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
    description: 'Sono, treinos, alimentação e rotina organizados por dia.',
  };
}

export default async function UserTimelinePage({
  params,
}: UserTimelinePageProps) {
  const { userId } = await params;
  const now = new Date();
  const todayKey = dayKeyOf(now);
  const initialEvents = await fetchFromBackend<TimelineEventCardDto[]>(
    dayEventsUrl(userId, todayKey),
  );

  return (
    // Sem fundo proprio: o brilho ambiente do globals.css fica atras do
    // body, e um bloco opaco aqui o apagaria.
    <div className="min-h-screen">
      <TimelineList
        userId={userId}
        initialEvents={initialEvents}
        todayKey={todayKey}
      />
    </div>
  );
}
