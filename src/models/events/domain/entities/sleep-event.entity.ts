import { Event, type EventProps } from "./event.entity";
import { EventId } from "../value-objects/event-id";
import { TagList } from "../value-objects/tag-list";

export interface SleepEventData {
  trackedSleepTime: number;
  score: number;
}

export class SleepEvent extends Event<SleepEventData> {
  private constructor(props: EventProps<SleepEventData>) {
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
    );
  }

  static create(props: EventProps<SleepEventData>): SleepEvent {
    return new SleepEvent(props);
  }
}
