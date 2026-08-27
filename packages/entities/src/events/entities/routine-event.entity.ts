import { Event, type EventProps } from "./event.entity";
import { EventId } from "../value-objects/event-id";
import { TagList } from "../value-objects/tag-list";

export interface RoutineEventData {}

export class RoutineEvent extends Event<RoutineEventData> {
  private constructor(props: EventProps<RoutineEventData>) {
    super(
      props.id ?? EventId.create(),
      "routine",
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

  static create(props: EventProps<RoutineEventData>): RoutineEvent {
    return new RoutineEvent(props);
  }
}
