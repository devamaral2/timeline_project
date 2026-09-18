import { ulid } from "ulid";

export class AgentChatMessageId {
  static create(): string {
    return ulid();
  }
}
