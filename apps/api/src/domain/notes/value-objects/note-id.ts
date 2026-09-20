import { ulid } from "ulid";

export class NoteId {
  static create(): string {
    return ulid();
  }
}
