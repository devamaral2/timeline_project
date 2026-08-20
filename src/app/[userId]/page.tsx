import type { Metadata } from "next";
import { TimelineList } from "@/components/events/TimelineList";
import { TimelineHeader } from "@/components/layout/TimelineHeader";
import { buildDateWindow } from "@/lib/timeline/date-window";
import { dayKeyOf } from "@/lib/timeline/format-date";
import { makeListTimelineEventsUseCase } from "@/models/events/infra/factories/make-list-timeline-events-usecase";

export const dynamic = "force-dynamic";

interface UserTimelinePageProps {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: UserTimelinePageProps): Promise<Metadata> {
  const { userId } = await params;
  return {
    title: `Timeline de ${userId} — All Tracker`,
    description: "Sono, treinos, alimentação e rotina em uma timeline contínua.",
  };
}

export default async function UserTimelinePage({ params }: UserTimelinePageProps) {
  const { userId } = await params;
  const now = new Date();
  const todayKey = dayKeyOf(now);
  const firstWindow = buildDateWindow(0, now);

  const initialEvents = await makeListTimelineEventsUseCase().execute({
    userId,
    from: firstWindow.from,
    to: firstWindow.to,
  });

  return (
    <div className="min-h-screen bg-background">
      <TimelineHeader userId={userId} />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <TimelineList
          userId={userId}
          initialEvents={initialEvents}
          todayKey={todayKey}
          nowIso={now.toISOString()}
        />
      </main>
    </div>
  );
}
