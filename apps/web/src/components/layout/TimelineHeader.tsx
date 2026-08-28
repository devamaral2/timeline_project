'use client';

import { Logo, Wordmark } from '@/components/brand/Logo';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { NewEventButton } from '@/components/events/NewEventButton';
import { VoiceEventButton } from '@/components/events/VoiceEventButton';
import { DateNavigator } from '@/components/events/DateNavigator';
import { WeekStrip } from '@/components/events/WeekStrip';
import { useCurrentUser } from '@/lib/firebase/use-current-user';

interface TimelineHeaderProps {
  userId: string;
  selectedDayKey: string;
  todayKey: string;
  onSelectDay: (dayKey: string) => void;
}

export function TimelineHeader({
  userId,
  selectedDayKey,
  todayKey,
  onSelectDay,
}: TimelineHeaderProps) {
  const user = useCurrentUser();

  return (
    <header className="surface-glass sticky top-0 z-30">
      <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={34} />
            <Wordmark className="hidden text-lg leading-6 text-foreground sm:block" />
          </div>

          <DateNavigator
            selectedDayKey={selectedDayKey}
            todayKey={todayKey}
            onSelect={onSelectDay}
          />

          <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-2">
            {user ? <VoiceEventButton /> : null}
            {user ? <NewEventButton compactOnMobile /> : null}
            <GoogleSignInButton compactOnMobile />
          </div>
        </div>

        <div className="mt-2">
          <WeekStrip
            selectedDayKey={selectedDayKey}
            todayKey={todayKey}
            onSelect={onSelectDay}
          />
        </div>
      </div>

      {/* A linha que fecha o cabecalho. */}
      <div aria-hidden className="h-px w-full bg-border" />
    </header>
  );
}
