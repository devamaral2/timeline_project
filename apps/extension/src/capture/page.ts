import { Readability } from "@mozilla/readability";
import type { DailyReadingInput } from "@repo/contracts";
import { linkLabel, toMarkdown } from "./markdown";
import { youtubeLinkOf } from "./youtube";

/**
 * O que a extensão leu de uma página:
 * - `article`: o texto principal, em markdown;
 * - `video`: uma página de vídeo do YouTube, guardada como o link dela;
 * - `link`: uma página sem texto principal reconhecível, guardada só como link.
 */
export interface CapturedPage extends DailyReadingInput {
  kind: "article" | "video" | "link";
}

/** O teto do markdown que a API aceita (`DAILY_READING_MARKDOWN_MAX` em `@repo/contracts/schemas`). */
export const MARKDOWN_MAX = 300_000;
const TITLE_MAX = 300;
const SITE_MAX = 120;
const BYLINE_MAX = 200;
/** Abaixo disto o que o leitor achou não é um texto: é menu, rodapé ou aviso de cookies. */
const ARTICLE_MIN_CHARS = 200;
const CUT_NOTE = "\n\n*Texto cortado: a página passa do tamanho que cabe em um artefato.*";

function oneLine(text: string | null | undefined, max: number): string | undefined {
  const value = text?.replace(/\s+/g, " ").trim().slice(0, max).trim();
  return value || undefined;
}

function meta(doc: Document, ...selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = oneLine(doc.querySelector(selector)?.getAttribute("content"), 1000);
    if (value) return value;
  }
  return undefined;
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** Corta no fim de um parágrafo e avisa, em vez de mandar um corpo que a API recusaria. */
export function fitMarkdown(markdown: string, max = MARKDOWN_MAX): string {
  if (markdown.length <= max) return markdown;
  const room = markdown.slice(0, max - CUT_NOTE.length);
  const paragraphEnd = room.lastIndexOf("\n\n");
  return (paragraphEnd > room.length / 2 ? room.slice(0, paragraphEnd) : room).trimEnd() + CUT_NOTE;
}

function captureVideo(doc: Document, canonical: string, withStart: string): CapturedPage {
  const title = oneLine(doc.title.replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube$/, ""), TITLE_MAX) ?? "Vídeo no YouTube";
  const channel =
    oneLine(doc.querySelector("ytd-watch-metadata ytd-channel-name a, #owner #channel-name a")?.textContent, BYLINE_MAX) ??
    oneLine(doc.querySelector('span[itemprop="author"] link[itemprop="name"]')?.getAttribute("content"), BYLINE_MAX);
  const description = meta(doc, 'meta[property="og:description"]', 'meta[name="description"]');
  // O link sozinho na primeira linha: é ele que o leitor mostra como player.
  const markdown = [`[${linkLabel(title)}](${withStart})`, description].filter(Boolean).join("\n\n");
  return { kind: "video", url: canonical, title, markdown, siteName: "YouTube", ...(channel ? { byline: channel } : {}) };
}

/**
 * Lê a página aberta. O leitor (Readability, o mesmo do modo de leitura do
 * Firefox) trabalha numa cópia do documento: a página que a pessoa vê não muda.
 */
export function capturePage(doc: Document, pageUrl: string): CapturedPage {
  const youtube = youtubeLinkOf(pageUrl);
  if (youtube) return captureVideo(doc, youtube.canonical, youtube.withStart);

  const siteName = oneLine(meta(doc, 'meta[property="og:site_name"]', 'meta[name="application-name"]'), SITE_MAX);
  const fallbackTitle = oneLine(meta(doc, 'meta[property="og:title"]') ?? doc.title, TITLE_MAX) ?? hostOf(pageUrl);

  const article = new Readability(doc.cloneNode(true) as Document).parse();
  if (article?.content && (article.textContent ?? "").trim().length >= ARTICLE_MIN_CHARS) {
    const content = new DOMParser().parseFromString(article.content, "text/html").body;
    // `baseURI` e o endereco da pagina ou o da tag <base>, quando ela tem uma.
    const markdown = toMarkdown(content, doc.baseURI || pageUrl);
    if (markdown) {
      const byline = oneLine(article.byline, BYLINE_MAX);
      const site = oneLine(article.siteName, SITE_MAX) ?? siteName;
      return {
        kind: "article",
        url: pageUrl,
        title: oneLine(article.title, TITLE_MAX) ?? fallbackTitle,
        markdown: fitMarkdown(markdown),
        ...(site ? { siteName: site } : {}),
        ...(byline ? { byline } : {}),
      };
    }
  }

  const description = meta(doc, 'meta[property="og:description"]', 'meta[name="description"]');
  return {
    kind: "link",
    url: pageUrl,
    title: fallbackTitle,
    markdown: description ?? "Página guardada só com o endereço: não havia um texto principal para ler.",
    ...(siteName ? { siteName } : {}),
  };
}
