import type { ScopedSqlOutcome, ScopedSqlQuery } from "../../../domain/ports";

export class StubScopedSqlQuery implements ScopedSqlQuery {
  readonly calls: Array<{ userId: string; sql: string }> = [];

  constructor(
    private readonly outcome: ScopedSqlOutcome = { ok: true, columns: [], rows: [], truncated: false },
  ) {}

  describeSchema(): string {
    return "tasks: Tarefas do usuario.";
  }

  async run(input: { userId: string; sql: string }): Promise<ScopedSqlOutcome> {
    this.calls.push(input);
    return this.outcome;
  }
}
