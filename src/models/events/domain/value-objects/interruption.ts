import { ulid } from "ulid";

export interface InterruptionProps {
  id?: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt: Date;
}

export class Interruption {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    readonly startedAt: Date,
    readonly finishedAt: Date,
  ) {}

  static create(props: InterruptionProps): Interruption {
    if (props.finishedAt < props.startedAt) {
      throw new Error("finishedAt must be equal to or after startedAt");
    }

    return new Interruption(
      props.id ?? ulid(),
      props.name,
      props.description,
      props.startedAt,
      props.finishedAt,
    );
  }
}
