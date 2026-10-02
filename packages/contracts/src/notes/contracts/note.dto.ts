export interface NoteDto {
  id: string;
  content: string;
  name: string;
  taskId?: string;
  eventId?: string;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}
