export interface InterruptionProps {
  name: string;
  description: string;
  startedAt: Date;
  finishedAt: Date;
}

export class Interruption {
  private constructor(
    readonly name: string,
    readonly description: string,
    readonly startedAt: Date,
    readonly finishedAt: Date,
  ) {}

  static create(props: InterruptionProps): Interruption {
    return new Interruption(props.name, props.description, props.startedAt, props.finishedAt);
  }
}
