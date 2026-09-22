export class NoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteValidationError";
  }
}

export class NoteNotFoundError extends Error {}

export class NoteOwnershipError extends Error {
  constructor() {
    super("Only the note owner can modify it");
  }
}

export class NoteRevisionConflictError extends Error {}
