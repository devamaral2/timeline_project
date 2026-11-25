const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "youtube-nocookie.com"]);
const ID_PATHS = new Set(["embed", "shorts", "live", "v"]);

export interface YouTubeLink {
  /** O endereço do vídeo sem nada além do id: é por ele que a mesma página é reconhecida. */
  canonical: string;
  /** O mesmo endereço com o instante de início, quando o original trazia um. */
  withStart: string;
}

/**
 * O vídeo de um endereço do YouTube (`watch?v=`, `youtu.be/`, `shorts/`,
 * `embed/`, `live/`), como endereço de `watch`. `null` em canal, playlist,
 * busca ou outro site. As mesmas formas que o leitor do Candeia reconhece
 * (`apps/web/src/lib/notes/youtube.ts`): o que sai daqui vira player lá.
 */
export function youtubeLinkOf(href: string): YouTubeLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const [first, second] = url.pathname.split("/").filter(Boolean);
  let id: string | null | undefined;
  if (host === "youtu.be") id = first;
  else if (HOSTS.has(host)) id = first === "watch" ? url.searchParams.get("v") : ID_PATHS.has(first ?? "") ? second : null;
  if (!id || !VIDEO_ID.test(id)) return null;

  const canonical = `https://www.youtube.com/watch?v=${id}`;
  const start = url.searchParams.get("t") ?? url.searchParams.get("start");
  return { canonical, withStart: start && /^[0-9hms]+$/.test(start) ? `${canonical}&t=${start}` : canonical };
}
