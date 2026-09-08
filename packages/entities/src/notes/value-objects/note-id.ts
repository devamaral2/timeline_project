export class NoteId {
  private constructor(readonly value: string) {}

  static create(id?: string): NoteId {
    return new NoteId(id ?? crypto.randomUUID());
  }

  toString(): string {
    return this.value;
  }

  equals(other: NoteId): boolean {
    return this.value === other.value;
  }
}
