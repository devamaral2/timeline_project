export class ArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactValidationError";
  }
}

export class ArtifactNotFoundError extends Error {}

export class ArtifactOwnershipError extends Error {
  constructor() {
    super("Only the artifact owner can modify it");
  }
}

export class ArtifactRevisionConflictError extends Error {}
