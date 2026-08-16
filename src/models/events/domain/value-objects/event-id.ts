import { ulid } from "ulid";

export class EventId {
  static create(): string {
    return ulid();
  }
}
