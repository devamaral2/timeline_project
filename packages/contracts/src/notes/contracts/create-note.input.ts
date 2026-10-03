export interface CreateNoteInput {
  content: string;
  /** Sem nome, a API deriva o título da primeira linha do conteúdo. */
  name?: string;
  taskId?: string;
  eventId?: string;
  tags?: string[];
}
