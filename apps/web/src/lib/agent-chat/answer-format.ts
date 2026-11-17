/**
 * O que a resposta do agente ganha além do markdown. O Hermes manda texto livre, sem marcação combinada com o
 * app, então tudo aqui é lido do próprio texto: as alternativas que ele pede para dizer, os termos técnicos e o
 * rótulo que abre um parágrafo.
 */

/** Um nó do markdown (mdast), só com o que este arquivo lê e escreve. */
export interface AnswerNode {
  type: string;
  value?: string;
  children?: AnswerNode[];
  data?: { hProperties?: Record<string, string> };
}

const QUOTED = /["“]([^"“”\n]{2,48})["”]/g;
const JOINER = /^\s*(?:,|ou|or|,\s*(?:ou|or))\s*$/i;
const MAX_CHOICES = 4;

/**
 * As alternativas que o texto pede para o usuário dizer: trechos entre aspas ligados por "ou" ou vírgula, como em
 * `Diga "só gmail" ou "com calendar e drive"`. Uma citação sozinha não é escolha.
 */
export function answerChoices(text: string): string[] {
  let run: string[] = [];
  let end = -1;
  for (const match of text.matchAll(QUOTED)) {
    const value = match[1].trim();
    const joined = end >= 0 && JOINER.test(text.slice(end, match.index));
    if (!joined) {
      if (run.length >= 2) break;
      run = [];
    }
    if (value && !run.includes(value)) run.push(value);
    end = match.index + match[0].length;
  }
  return run.length >= 2 ? run.slice(0, MAX_CHOICES) : [];
}

/** O rótulo do botão: a alternativa como o agente a escreveu, com a primeira letra maiúscula. */
export function choiceLabel(choice: string): string {
  return choice.charAt(0).toLocaleUpperCase("pt-BR") + choice.slice(1);
}

const SHORT_URL = 44;

/** O endereço como se lê num texto: sem protocolo, e só até o primeiro trecho do caminho quando é longo. */
export function shortUrl(href: string): string {
  const bare = href.replace(/^https?:\/\/(?:www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  if (bare.length <= SHORT_URL) return bare;
  const [host, first] = bare.split("/");
  return first ? `${host}/${first}…` : `${host}…`;
}

/** Caminhos de arquivo (`/opt/data/token.json`) e constantes (`NOT_AUTHENTICATED`): viram código sem crase. */
const TECHNICAL = /(?<![\w/.:])\/(?:[\w.-]+\/)+[\w.-]*\w|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
/** Até quatro palavras e dois-pontos no começo do parágrafo: "Uma decisão antes: …". */
const LEAD = /^([^\s:.!?][^:.!?\n]{1,36}):(?=\s+\S)/;
const LEAD_WORDS = 4;
const LABEL_LENGTH = 40;

function textOf(node: AnswerNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textOf).join("");
}

function splitTechnical(value: string): AnswerNode[] {
  const parts: AnswerNode[] = [];
  let last = 0;
  for (const match of value.matchAll(TECHNICAL)) {
    if (match.index > last) parts.push({ type: "text", value: value.slice(last, match.index) });
    parts.push({ type: "inlineCode", value: match[0] });
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return [{ type: "text", value }];
  if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
  return parts;
}

function withLead(children: AnswerNode[]): AnswerNode[] {
  const [first, ...rest] = children;
  if (first?.type !== "text" || !first.value) return children;
  const match = LEAD.exec(first.value);
  if (!match || match[1].trim().split(/\s+/).length > LEAD_WORDS) return children;
  return [
    { type: "strong", children: [{ type: "text", value: match[0] }] },
    { type: "text", value: first.value.slice(match[0].length) },
    ...rest,
  ];
}

function polish(node: AnswerNode, inLink: boolean): void {
  const children = node.children;
  if (!children) return;

  children.forEach((child, index) => {
    if (child.type !== "paragraph") return;
    const text = textOf(child).trim();
    // Um parágrafo curto que termina em dois-pontos e abre uma lista é o rótulo dela ("Os passos:").
    if (children[index + 1]?.type === "list" && text.length <= LABEL_LENGTH && text.endsWith(":") && !text.includes("\n")) {
      child.children = [{ type: "text", value: text.slice(0, -1) }];
      child.data = { hProperties: { "data-label": "true" } };
      return;
    }
    const choices = answerChoices(text);
    if (choices.length > 0) child.data = { hProperties: { "data-choices": JSON.stringify(choices) } };
    child.children = withLead(child.children ?? []);
  });

  node.children = children.flatMap((child) => {
    if (child.type === "text" && !inLink && child.value) return splitTechnical(child.value);
    if (child.type !== "code" && child.type !== "inlineCode") polish(child, inLink || child.type === "link");
    return [child];
  });
}

/** Plugin do remark que aplica a leitura acima à árvore do markdown da resposta. */
export function remarkAnswer() {
  return (tree: AnswerNode) => polish(tree, false);
}
