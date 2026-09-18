export interface NoteDto {
  id: string;
  content: string;
  taskId?: string;
  eventId?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
