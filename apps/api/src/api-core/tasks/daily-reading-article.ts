import type { DailyReadingInput } from "@repo/contracts";

/** O nome da tarefa em que as páginas lidas no dia se juntam. */
export const DAILY_READING_TASK_NAME = "Leitura diária";

const NAME_MAX = 200;

/** O que guarda o artefato de uma página lida. */
export interface ReadingArticle {
  name: string;
  /** A linha da fonte, uma linha em branco e o markdown da página. */
  body: string;
  /** O endereço como ele entra na linha da fonte: é por ele que a mesma página é reconhecida. */
  sourceUrl: string;
}

/** "Leitura Diaria" e "leitura  diária" são a mesma tarefa: sem acento, sem caixa e sem espaço sobrando. */
export function isDailyReadingName(name: string): boolean {
  return fold(name) === fold(DAILY_READING_TASK_NAME);
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * O endereço sem o trecho depois de `#`, que só aponta um lugar da mesma
 * página, e com os parênteses codificados, para caber no destino de um link
 * markdown. `null` quando não é `http(s)`.
 */
export function readingSourceUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  parsed.hash = "";
  return parsed.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/** Texto que entra entre colchetes de um link: uma linha só, sem fechar o colchete antes da hora. */
function linkLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[\\[\]]/g, "\\$&");
}

/**
 * O artefato de uma página: o título vira o nome e o corpo começa pela fonte
 * ("Fonte: [site](endereço) · autor"), para que o texto guardado diga de onde
 * veio mesmo fora da tarefa.
 */
export function composeReadingArticle(input: DailyReadingInput): ReadingArticle | null {
  const sourceUrl = readingSourceUrl(input.url);
  if (!sourceUrl) return null;
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  const site = linkLabel(input.siteName ?? "") || host;
  const byline = input.byline?.replace(/\s+/g, " ").trim();
  const source = `Fonte: [${site}](${sourceUrl})${byline ? ` · ${byline}` : ""}`;
  const name = input.title.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) || host;
  return { name, body: `${source}\n\n${input.markdown.trim()}\n`, sourceUrl };
}

const SOURCE_LINE = /^Fonte: \[(?:\\.|[^\]\\])*\]\(([^()\s]+)\)/;

/** O endereço da linha da fonte de um corpo montado por `composeReadingArticle`; `null` em qualquer outro texto. */
export function readingSourceOf(body: string): string | null {
  return SOURCE_LINE.exec(body)?.[1] ?? null;
}
