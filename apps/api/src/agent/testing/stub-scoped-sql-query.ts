import type { ScopedSqlOutcome, ScopedSqlQuery } from "@repo/entities/ports";

export class StubScopedSqlQuery implements ScopedSqlQuery {
  readonly calls: Array<{ userId: string; sql: string }> = [];

  constructor(
    private readonly outcome: ScopedSqlOutcome = { ok: true, columns: [], rows: [], truncated: false },
  ) {}

  describeSchema(): string {
    return "events: Eventos da timeline.";
  }

  async run(input: { userId: string; sql: string }): Promise<ScopedSqlOutcome> {
    this.calls.push(input);
    return this.outcome;
  }
}
