export class PlanValidationError extends Error {}

export class PlanNotFoundError extends Error {}

export class PlanOwnershipError extends Error {
  constructor() {
    super("Only the plan owner can modify it");
  }
}

export class PlanRevisionConflictError extends Error {}
