export class RecurrenceValidationError extends Error {}
export class RecurrenceNotFoundError extends Error {}
export class RecurrenceOwnershipError extends Error {
  constructor() {
    super("Only the recurrence owner can modify it");
  }
}
export class RecurrenceRevisionConflictError extends Error {}
