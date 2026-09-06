import { ulid } from "ulid";

export class PlanId {
  static create(): string {
    return ulid();
  }
}
