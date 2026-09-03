export interface TimelineEventCardDto {
  id: string;
  primaryItemId: string;
  primaryItemType: string;
  itemTypes: string[];
  /** A anotacao do usuario. O cartao so desenha o selo quando ela e true. */
  missed: boolean;
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
