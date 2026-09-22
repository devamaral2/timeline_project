import { ulid } from "ulid";

export class AgentConversationId {
  static create(): string {
    return ulid();
  }
}
