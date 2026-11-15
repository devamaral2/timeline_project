import type { AgentTraceEntryDto } from "@repo/contracts";

/** Um passo do Hermes na conversa: uma ferramenta que ele usou ou um pensamento, tirado do rastro do pedido. */
export interface HermesStep {
  id: string;
  kind: "thought" | "tool";
  label: string;
  /** O que o Hermes mostrou (comando, busca) ou o texto do pensamento. */
  detail?: string;
  status: "running" | "done" | "failed";
}

/**
 * Os passos do Hermes a partir do rastro do pedido: pensamentos e ferramentas, na ordem em que aconteceram.
 * O que ainda não começou (`pending`) não entra; o resto segue o estado da entrada.
 */
export function hermesStepsOf(entries: AgentTraceEntryDto[] | undefined): HermesStep[] {
  return (entries ?? []).flatMap((entry): HermesStep[] => {
    if ((entry.kind !== "thought" && entry.kind !== "tool") || entry.status === "pending") return [];
    const status = entry.status === "done" || entry.status === "failed" ? entry.status : "running";
    const text = entry.kind === "thought" ? entry.sections?.map((section) => section.text).join("\n\n") : undefined;
    const detail = text || entry.summary;
    return [{ id: entry.id, kind: entry.kind, label: entry.label, ...(detail ? { detail } : {}), status }];
  });
}
