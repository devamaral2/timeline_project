
/** O que a barra "/" do chat abre: os formularios de criar e a pesquisa. */
export type HubCommandId = "task" | "event" | "note" | "search" | "notifications" | "settings";

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
  { id: "notifications", slug: "notificacoes", label: "Notificações", hint: "Avisos recentes e próximos" },
  { id: "settings", slug: "configuracoes", label: "Configurações", hint: "Tema e conta" },
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
