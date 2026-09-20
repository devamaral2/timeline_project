import { ulid } from "ulid";

export class TaskId {
  static create(): string {
    return ulid();
  }
}
