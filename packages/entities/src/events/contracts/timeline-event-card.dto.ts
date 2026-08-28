import type { EventType } from "../types/event-type";

export interface TimelineEventCardDto {
  id: string;
  type: EventType;
  /** A anotacao do usuario. O cartao so desenha o selo quando ela e true. */
  missed: boolean;
  accentColor: string;
  iconName: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  durationLabel: string;
  tags: string[];
  interruptions: Array<{
    name: string;
    description: string;
    durationLabel: string;
  }>;
}
