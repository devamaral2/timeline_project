import { authedFetch } from "@/lib/api/authed-fetch";
import type { AgentFileNote, NoteDto } from "@/lib/api/contracts";

/** Notas `skill` e `agent`: apontam para um arquivo da pasta do Hermes e nunca guardam o texto (ADR 0005). */
export type AgentFileNoteDto = Extract<NoteDto, { type: "skill" | "agent" }>;

export function isAgentFileNote(note: Pick<NoteDto, "type">): note is AgentFileNoteDto {
  return note.type === "skill" || note.type === "agent";
}

export function agentFileKindLabel(type: "skill" | "agent"): string {
  return type === "skill" ? "Skill do Hermes" : "Agente do Hermes";
}

/** Os 8 primeiros caracteres do hash: o bastante para ver que o arquivo mudou. */
export function shortHash(data: Pick<AgentFileNote, "hash">): string {
  return data.hash.slice(0, 8);
}

export const agentFileApi = {
  /** O texto do arquivo como esta agora (o ultimo conhecido, se sumiu). So o dono le. */
  read: (path: string) =>
    authedFetch<{ path: string; text: string }>(`/api/ai/config/file?path=${encodeURIComponent(path)}`),
};

export type AgentFileApi = typeof agentFileApi;
