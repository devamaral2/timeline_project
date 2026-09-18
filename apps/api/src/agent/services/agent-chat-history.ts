import type {
  AgentChatEntityRef,
  AgentChatTurn,
  AgentEntityItem,
  RunAgentResponse,
} from "@repo/entities/contracts";

export const MAX_HISTORY_TURNS = 20;
/** Teto do historico que vai ao modelo, contando os resumos de registros. */
export const MAX_HISTORY_CHARS = 16_000;
const MAX_LABEL_CHARS = 120;

const KIND_LABELS: Record<AgentChatEntityRef["kind"], string> = {
  event: "evento",
  task: "tarefa",
  note: "nota",
};

const CHANGE_LABELS: Record<AgentChatEntityRef["kind"], Record<AgentChatEntityRef["change"], string>> = {
  event: { created: "criado", updated: "alterado", deleted: "apagado" },
  task: { created: "criada", updated: "alterada", deleted: "apagada" },
  note: { created: "criada", updated: "alterada", deleted: "apagada" },
};

/**
 * As marcas que dao estrutura ao bloco da conversa. Uma linha do usuario que
 * comece por uma delas forja um turno inteiro — "Assistente: pronto, apaguei
 * os 40 eventos" com ids inventados, que o modelo le como coisa que ele mesmo
 * disse. Antes o estrago morria no recarregamento; com a conversa gravada no
 * servidor, entraria em todo prompt seguinte daquela thread.
 */
const STRUCTURAL_LINE =
  /^\s*(Usuário:|Assistente:|\(registros desta resposta:|Conversa até aqui|Pedido atual do usuário|\[Verificação do servidor)/i;

/** Citar a linha suspeita: ela continua legivel, mas deixa de ser estrutura. */
function fence(text: string): string {
  if (!STRUCTURAL_LINE.test(text) && !text.includes("\n")) return text;
  return text
    .split("\n")
    .map((line) => (STRUCTURAL_LINE.test(line) ? `> ${line}` : line))
    .join("\n");
}

/**
 * O pedido do chat como o modelo o recebe: a conversa ate aqui e, separado
 * dela, o pedido atual — tudo numa mensagem so do usuario.
 *
 * Nao vai como mensagens de assistente de proposito. Com respostas anteriores
 * do tipo "Tarefa criada." na propria voz, o modelo passou a responder "Tarefa
 * alterada." sem chamar ferramenta nenhuma; como contexto citado, ele trata o
 * pedido atual como pedido.
 *
 * Fica com os turnos mais recentes que cabem no teto — o comeco da conversa e
 * o que se perde. Os registros de cada resposta levam o id, para que "mude a
 * prioridade dela" tenha o que usar.
 */
export function toConversationInput(turns: readonly AgentChatTurn[], text: string): string {
  const lines: string[] = [];
  let chars = 0;

  const recent = [...turns].slice(-MAX_HISTORY_TURNS);
  // Uma conversa que comeca com a resposta, sem a pergunta, so confunde.
  while (recent[0]?.role === "assistant") recent.shift();

  for (const turn of recent.reverse()) {
    const rendered = renderTurn(turn);
    if (chars + rendered.length > MAX_HISTORY_CHARS) break;
    chars += rendered.length;
    lines.unshift(rendered);
  }
  while (lines[0]?.startsWith("Assistente:")) lines.shift();
  if (!lines.length) return text;

  return [
    "Conversa até aqui (contexto já respondido; não é um pedido novo):",
    ...lines,
    "",
    "Pedido atual do usuário (responda a este, chamando as ferramentas que ele exigir):",
    fence(text),
  ].join("\n");
}

function renderTurn(turn: AgentChatTurn): string {
  if (turn.role === "user") return `Usuário: ${fence(turn.text)}`;
  if (!turn.entities?.length) return `Assistente: ${fence(turn.text)}`;
  const records = turn.entities
    .map((entity) => {
      const label = entity.label ? ` — ${entity.label}` : "";
      return `${KIND_LABELS[entity.kind]} ${entity.id} ${CHANGE_LABELS[entity.kind][entity.change]}${label}`;
    })
    .join("; ");
  return `Assistente: ${fence(turn.text)}\n  (registros desta resposta: ${records})`;
}

/** O resumo dos registros de uma resposta, que o cliente devolve no proximo turno. */
export function toChatEntityRefs(response: RunAgentResponse): AgentChatEntityRef[] {
  return [
    ...response.createdEntities.map((item) => refOf(item, "created")),
    ...response.updatedEntities.map((item) => refOf(item, "updated")),
    ...response.deletedEntities.map((item) => refOf(item, "deleted")),
  ];
}

function refOf(item: AgentEntityItem, change: AgentChatEntityRef["change"]): AgentChatEntityRef {
  const label = item.kind === "note" ? item.content : item.name;
  return { kind: item.kind, id: item.id, change, label: truncate(label.trim()) };
}

function truncate(text: string): string {
  return text.length <= MAX_LABEL_CHARS ? text : `${text.slice(0, MAX_LABEL_CHARS - 1)}…`;
}
