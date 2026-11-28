import type { IdempotencyClaim, IdempotencyKeyRef, IdempotencyStore } from "../../../domain/ports";

interface Entry {
  requestHash: string;
  response?: unknown;
  done: boolean;
}

/** Mesmo contrato do store do SQLite, sem a retomada de reservas abandonadas. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly entries = new Map<string, Entry>();

  private id(ref: IdempotencyKeyRef): string {
    return `${ref.userId}|${ref.scope}|${ref.key}`;
  }

  async claim(input: IdempotencyKeyRef & { requestHash: string }): Promise<IdempotencyClaim> {
    const existing = this.entries.get(this.id(input));
    if (!existing) {
      this.entries.set(this.id(input), { requestHash: input.requestHash, done: false });
      return { kind: "claimed" };
    }
    if (existing.requestHash !== input.requestHash) return { kind: "mismatch" };
    return existing.done ? { kind: "replay", response: existing.response } : { kind: "in_progress" };
  }

  async complete(input: IdempotencyKeyRef & { response: unknown }): Promise<void> {
    const entry = this.entries.get(this.id(input));
    if (entry) Object.assign(entry, { response: input.response, done: true });
  }

  async release(input: IdempotencyKeyRef): Promise<void> {
    const entry = this.entries.get(this.id(input));
    if (entry && !entry.done) this.entries.delete(this.id(input));
  }
}
