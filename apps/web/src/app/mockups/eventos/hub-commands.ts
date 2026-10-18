import type { AgentConversationDto } from "@/lib/api/contracts";

/** O que a barra "/" do chat abre: os formularios de criar e a pesquisa. */
export type HubCommandId = "task" | "event" | "note" | "search";

export interface HubCommand {
  id: HubCommandId;
  slug: string;
  label: string;
  hint: string;
}

export const HUB_COMMANDS: readonly HubCommand[] = [
  { id: "task", slug: "tarefa", label: "Criar tarefa", hint: "Nome, status, prioridade e dia" },
  { id: "event", slug: "evento", label: "Criar evento", hint: "Tipo, início e término" },
  { id: "note", slug: "nota", label: "Criar nota", hint: "A primeira linha vira o título" },
  { id: "search", slug: "buscar", label: "Pesquisar", hint: "Eventos, tarefas e notas" },
];

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

export interface CommandQuery {
  /** Os comandos que ainda casam com o que foi digitado depois da barra. */
  matches: HubCommand[];
  /** O texto depois do comando (`/tarefa comprar pão` → `comprar pão`). */
  argument: string;
}

/**
 * Le o campo do chat como comando quando ele comeca com "/". Sem barra, ou com
 * um comando que nao existe, devolve `null` e o texto segue para a IA.
 */
export function parseCommand(input: string): CommandQuery | null {
  if (!input.startsWith("/")) return null;
  const [, token = "", rest = ""] = /^\/(\S*)\s*([\s\S]*)$/.exec(input) ?? [];
  const typed = fold(token);
  const hasArgument = /^\/\S*\s/.test(input);
  const matches = HUB_COMMANDS.filter((command) =>
    hasArgument
      ? command.slug === typed
      : command.slug.startsWith(typed) || fold(command.label).split(" ").some((word) => word.startsWith(typed)),
  );
  return matches.length > 0 ? { matches, argument: rest.trim() } : null;
}

export interface ConversationGroup {
  label: "Hoje" | "Esta semana" | "Antes";
  items: AgentConversationDto[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Hoje, os ultimos sete dias e o resto, cada grupo do mais recente para o mais antigo. */
export function groupConversations(conversations: AgentConversationDto[], now = new Date()): ConversationGroup[] {
  const today = startOfDay(now).getTime();
  const groups: ConversationGroup[] = [
    { label: "Hoje", items: [] },
    { label: "Esta semana", items: [] },
    { label: "Antes", items: [] },
  ];
  const sorted = [...conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  for (const conversation of sorted) {
    const day = startOfDay(new Date(conversation.lastMessageAt)).getTime();
    const group = day >= today ? groups[0] : today - day < 7 * DAY_MS ? groups[1] : groups[2];
    group.items.push(conversation);
  }
  return groups.filter((group) => group.items.length > 0);
}

/** "14:32" hoje, "ter." nesta semana e "28 set." antes disso. */
export function conversationTime(lastMessageAt: string, now = new Date()): string {
  const date = new Date(lastMessageAt);
  const today = startOfDay(now).getTime();
  const day = startOfDay(date).getTime();
  if (day >= today) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (today - day < 7 * DAY_MS) return date.toLocaleDateString("pt-BR", { weekday: "short" });
  const month = date.toLocaleDateString("pt-BR", { month: "short" });
  return `${date.getDate()} ${month}`;
}
