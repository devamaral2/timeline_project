
/** O que a barra "/" do chat abre: os formularios de criar e a pesquisa. */
export type HubCommandId = "event" | "note" | "search" | "notifications" | "settings";

export interface HubCommand {
  id: HubCommandId;
  slug: string;
  label: string;
  hint: string;
}

export const HUB_COMMANDS: readonly HubCommand[] = [
  // Não há atalho de tarefa: o evento com status já é a tarefa.
  { id: "event", slug: "evento", label: "Criar evento", hint: "Tipo, status, início e término" },
  { id: "note", slug: "nota", label: "Criar nota", hint: "A primeira linha vira o título" },
  { id: "search", slug: "buscar", label: "Pesquisar", hint: "Eventos, tarefas e artefatos" },
  { id: "notifications", slug: "notificacoes", label: "Notificações", hint: "Avisos recentes e próximos" },
  { id: "settings", slug: "configuracoes", label: "Configurações", hint: "Tema e conta" },
];

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

export interface CommandQuery {
  /** Os comandos que ainda casam com o que foi digitado depois da barra. */
  matches: HubCommand[];
  /** O texto depois do comando (`/evento comprar pão` → `comprar pão`). */
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

const STOP_SPEECH = /^(pode |por favor )?(para|parar|pare|chega|encerrar|encerra|cancelar|cancela|stop)( de (ouvir|escutar))?( por favor)?$/;

/** A fala que pede para o chat parar de escutar ("para", "pode parar", "chega"): nao vai para a IA. */
export function isStopSpeech(transcript: string): boolean {
  return STOP_SPEECH.test(fold(transcript).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim());
}
