import { LegacyEvent, type LegacyEventProps } from "./legacy-event.entity";
import { EventId } from "../value-objects/event-id";
import { TagList } from "../value-objects/tag-list";

export interface RoutineEventData {}

export class RoutineEvent extends LegacyEvent<RoutineEventData> {
  private constructor(props: LegacyEventProps<RoutineEventData>) {
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
      props.missed,
      props.priority,
    );
  }

  static create(props: LegacyEventProps<RoutineEventData>): RoutineEvent {
    return new RoutineEvent(props);
  }
}
