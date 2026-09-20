export class AgentConversationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConversationValidationError";
  }
}

export class AgentConversationNotFoundError extends Error {}

export class AgentConversationOwnershipError extends Error {
  constructor() {
    super("Only the conversation owner can modify it");
  }
}

export class AgentConversationRevisionConflictError extends Error {}
