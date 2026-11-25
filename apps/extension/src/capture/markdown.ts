import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { youtubeLinkOf } from "./youtube";

/**
 * O HTML de uma página vira markdown (GFM). O que não é texto entra como
 * endereço, nunca como arquivo:
 *
 * - imagem: `![texto alternativo](endereço)`, apontando para o original. O
 *   leitor do Candeia só a busca quando a pessoa pede;
 * - vídeo do YouTube incorporado: um link sozinho na linha, que o leitor mostra
 *   como player;
 * - outros vídeos, áudios e molduras: um link com o nome do que é.
 */

/** Atributos em que os sites guardam o endereço de uma imagem que só carrega ao rolar a página. */
const LAZY_SOURCES = ["data-src", "data-lazy-src", "data-original", "data-url", "data-hi-res-src"];

/** O endereço absoluto, só `http(s)`. O que não é (`data:`, `blob:`, `javascript:`) não entra no texto. */
export function absoluteUrl(value: string | null | undefined, base: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** O endereço como destino de um link markdown: sem espaço nem parêntese solto. */
export function linkDestination(url: string): string {
  return url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/</g, "%3C").replace(/>/g, "%3E");
}

/** Texto que entra entre colchetes: uma linha só, sem fechar o colchete antes da hora. */
export function linkLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[\\[\]]/g, "\\$&");
}

/** O maior candidato de um `srcset` ("a.jpg 480w, b.jpg 1200w"), ou o último quando nenhum diz o tamanho. */
function largestOf(srcset: string | null): string | null {
  if (!srcset) return null;
  const candidates = srcset
    .split(/,\s+/)
    .map((entry) => entry.trim().split(/\s+/))
    .filter(([url]) => Boolean(url))
    .map(([url, size]) => ({ url: url as string, size: Number.parseFloat(size ?? "") || 0 }));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => (candidate.size >= best.size ? candidate : best)).url;
}

function imageSource(image: Element, base: string): string | null {
  const candidates = [
    image.getAttribute("src"),
    ...LAZY_SOURCES.map((name) => image.getAttribute(name)),
    largestOf(image.getAttribute("srcset") ?? image.getAttribute("data-srcset")),
    // Dentro de <picture>, o endereço pode estar só nos <source>.
    largestOf(image.parentElement?.nodeName === "PICTURE" ? (image.parentElement.querySelector("source[srcset]")?.getAttribute("srcset") ?? null) : null),
  ];
  for (const candidate of candidates) {
    const url = absoluteUrl(candidate, base);
    if (url) return url;
  }
  return null;
}

/** Pixel de rastreio: uma imagem de 1 ou 2 px não é conteúdo. */
function isTrackingPixel(image: Element): boolean {
  const width = Number.parseInt(image.getAttribute("width") ?? "", 10);
  const height = Number.parseInt(image.getAttribute("height") ?? "", 10);
  return (width > 0 && width <= 2) || (height > 0 && height <= 2);
}

function imageMarkdown(image: Element, base: string): string {
  if (isTrackingPixel(image)) return "";
  const source = imageSource(image, base);
  if (!source) return "";
  const alt = linkLabel(image.getAttribute("alt") || image.getAttribute("title") || "");
  return `![${alt}](${linkDestination(source)})`;
}

function block(markdown: string): string {
  return markdown ? `\n\n${markdown}\n\n` : "";
}

/** Uma moldura (`iframe`, `embed`, `object`): vídeo do YouTube, do Vimeo ou outro conteúdo de fora. */
function embedMarkdown(node: Element, base: string): string {
  const source = absoluteUrl(node.getAttribute("src") ?? node.getAttribute("data-src") ?? node.getAttribute("data"), base);
  if (!source) return "";
  const youtube = youtubeLinkOf(source);
  if (youtube) return `[Vídeo no YouTube](${youtube.withStart})`;
  const vimeo = /^https?:\/\/player\.vimeo\.com\/video\/(\d+)/.exec(source);
  if (vimeo) return `[Vídeo no Vimeo](https://vimeo.com/${vimeo[1]})`;
  const title = linkLabel(node.getAttribute("title") ?? "");
  return `[${title || "Conteúdo incorporado"}](${linkDestination(source)})`;
}

function mediaMarkdown(node: Element, base: string): string {
  const source = absoluteUrl(node.getAttribute("src") ?? node.querySelector("source[src]")?.getAttribute("src"), base);
  if (!source) return "";
  return `[${node.nodeName === "AUDIO" ? "Áudio" : "Vídeo"}](${linkDestination(source)})`;
}

function linkMarkdown(content: string, node: Element, base: string): string {
  const text = content.trim();
  if (!text) return "";
  // Uma imagem que é só o link para ela mesma em tamanho maior: fica a imagem.
  if (node.querySelector("img") && !node.textContent?.trim()) return content;
  const raw = node.getAttribute("href") ?? "";
  const href = /^mailto:/i.test(raw) ? raw : absoluteUrl(raw, base);
  return href ? `[${text.replace(/\n+/g, " ")}](${linkDestination(href)})` : content;
}

/** O markdown de um trecho de página. `base` é o endereço da página, para os endereços relativos. */
export function toMarkdown(root: HTMLElement, base: string): string {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  service.use(gfm);
  service.remove(["script", "style", "noscript", "template", "button", "form", "input", "select", "textarea", "canvas", "source", "track"]);
  service.remove((node) => node.nodeName.toLowerCase() === "svg");

  // O item de lista do Turndown sai com tres espacos depois do marcador ("-   item"); aqui, um so.
  service.addRule("listItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const list = node.parentNode as Element | null;
      let prefix = `${options.bulletListMarker} `;
      if (list?.nodeName === "OL") {
        const start = Number.parseInt(list.getAttribute("start") ?? "1", 10) || 1;
        prefix = `${start + Array.prototype.indexOf.call(list.children, node)}. `;
      }
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n(?=[^\n])/g, `\n${" ".repeat(prefix.length)}`);
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
    },
  });
  service.addRule("image", { filter: "img", replacement: (_content, node) => imageMarkdown(node as Element, base) });
  service.addRule("caption", {
    filter: "figcaption",
    replacement: (content) => block(content.trim() ? `*${content.trim().replace(/\n+/g, " ")}*` : ""),
  });
  service.addRule("embed", {
    filter: ["iframe", "embed", "object"],
    replacement: (_content, node) => block(embedMarkdown(node as Element, base)),
  });
  service.addRule("media", {
    filter: ["video", "audio"],
    replacement: (_content, node) => block(mediaMarkdown(node as Element, base)),
  });
  service.addRule("link", {
    filter: (node) => node.nodeName === "A" && Boolean(node.getAttribute("href")),
    replacement: (content, node) => linkMarkdown(content, node as Element, base),
  });

  return service.turndown(root).replace(/\n{3,}/g, "\n\n").trim();
}
