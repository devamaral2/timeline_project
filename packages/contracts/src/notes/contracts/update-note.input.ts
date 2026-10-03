export interface UpdateNoteInput {
  noteId: string;
  expectedRevision: number;
  name?: string;
  content?: string;
  /** `null` solta a nota do alvo. */
  taskId?: string | null;
  eventId?: string | null;
  tags?: string[];
}
