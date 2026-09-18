import type { ScopedSqlOutcome, ScopedSqlQuery, ScopedSqlScope } from "@repo/entities/ports";

export class StubScopedSqlQuery implements ScopedSqlQuery {
  readonly calls: Array<{ userId: string; sql: string; scope: ScopedSqlScope }> = [];
  readonly describedScopes: ScopedSqlScope[] = [];

  constructor(
    private readonly outcome: ScopedSqlOutcome = { ok: true, columns: [], rows: [], truncated: false },
  ) {}

  describeSchema(scope: ScopedSqlScope): string {
    this.describedScopes.push(scope);
    return scope.includeChat
      ? "events: Eventos da timeline.\n\nchat_messages: Mensagens das conversas."
      : "events: Eventos da timeline.";
  }

  async run(input: { userId: string; sql: string; scope: ScopedSqlScope }): Promise<ScopedSqlOutcome> {
    this.calls.push(input);
    return this.outcome;
  }
}
