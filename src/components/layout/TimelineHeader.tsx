"use client";

import { Sparkles } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { NewEventButton } from "@/components/events/NewEventButton";
import { VoiceEventButton } from "@/components/events/VoiceEventButton";
import { useCurrentUser } from "@/lib/firebase/use-current-user";

interface TimelineHeaderProps {
  userId: string;
}

export function TimelineHeader({ userId }: TimelineHeaderProps) {
  const user = useCurrentUser();

  return (
    <header className="border-b border-border bg-card/60 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
              Routine Tracker
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {user ? <VoiceEventButton /> : null}
          {user ? <NewEventButton /> : null}
          <GoogleSignInButton />
        </div>
      </div>
    </header>
  );
}
