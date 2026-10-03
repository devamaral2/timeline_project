/** O que a nota está presa: um evento ou uma tarefa, com o necessário para listá-la. */
export interface NoteLinkDto {
  kind: "event" | "task";
  id: string;
  name: string;
  /** Tipo do item principal do evento (routine, meal, training, sleep…); só para `kind: "event"`. */
  eventType?: string;
  /** Quando o alvo acontece: início do evento ou da tarefa, se houver. */
  at?: string;
}

export interface NoteDto {
  id: string;
  content: string;
  name: string;
  taskId?: string;
  eventId?: string;
  /** Preenchido pela API de notas; ausente nas notas que o agente devolve. */
  link?: NoteLinkDto;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}
