import { LegacyEvent, type LegacyEventProps } from "./legacy-event.entity";
import { EventId } from "../value-objects/event-id";
import { TagList } from "../value-objects/tag-list";

export interface SleepEventData {
  trackedSleepTime: number;
  score: number;
}

export class SleepEvent extends LegacyEvent<SleepEventData> {
  private constructor(props: LegacyEventProps<SleepEventData>) {
    super(
      props.id ?? EventId.create(),
      "sleep",
      props.userId,
      props.name,
      props.description,
      props.startedAt,
      props.finishedAt,
      TagList.create(props.tags),
      props.interruptions,
      props.data,
      props.missed,
      props.priority,
    );
  }

  static create(props: LegacyEventProps<SleepEventData>): SleepEvent {
    return new SleepEvent(props);
  }
}
