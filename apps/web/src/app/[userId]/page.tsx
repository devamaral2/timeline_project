import type { Metadata } from "next";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import { TimelineList } from "@/components/events/TimelineList";
import { TimelineHeader } from "@/components/layout/TimelineHeader";
import { fetchFromBackend } from "@/lib/api/backend";
import { buildDateWindow, dayKeyOf } from "@repo/timeline";

export const dynamic = "force-dynamic";

interface UserTimelinePageProps {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: UserTimelinePageProps): Promise<Metadata> {
  const { userId } = await params;
  return {
    title: `Timeline de ${userId} — Time Composure`,
    description: "Sono, treinos, alimentação e rotina em uma timeline contínua.",
  };
}

export default async function UserTimelinePage({ params }: UserTimelinePageProps) {
  const { userId } = await params;
  const now = new Date();
  const todayKey = dayKeyOf(now);
  const firstWindow = buildDateWindow(0, now);

  const query = new URLSearchParams({ userId, from: firstWindow.from, to: firstWindow.to });
  const initialEvents = await fetchFromBackend<TimelineEventCardDto[]>(
    `/api/events?${query.toString()}`,
  );

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
