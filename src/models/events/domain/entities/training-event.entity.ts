import { Event, type EventProps } from "./event.entity";
import { EventId } from "../value-objects/event-id";
import { TagList } from "../value-objects/tag-list";

export interface TrainingEventData {
  caloriesBurned: number;
}

export class TrainingEvent extends Event<TrainingEventData> {
  private constructor(props: EventProps<TrainingEventData>) {
    super(
      props.id ?? EventId.create(),
      "training",
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

  static create(props: EventProps<TrainingEventData>): TrainingEvent {
    return new TrainingEvent(props);
  }
}
