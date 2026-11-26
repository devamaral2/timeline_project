const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "youtube-nocookie.com"]);
const ID_PATHS = new Set(["embed", "shorts", "live", "v"]);

export interface YouTubeVideoLink {
  id: string;
  /** O endereço do vídeo sem nada além do id: é por ele que o mesmo vídeo é reconhecido. */
  canonical: string;
}

/**
 * O vídeo de um endereço do YouTube (`watch?v=`, `youtu.be/`, `shorts/`,
 * `embed/`, `live/`). `null` em canal, playlist, busca ou outro site. As mesmas
 * formas que a extensão (`apps/extension/src/capture/youtube.ts`) e o leitor do
 * web (`apps/web/src/lib/notes/youtube.ts`) reconhecem.
 */
export function youtubeVideoLinkOf(href: string): YouTubeVideoLink | null {
  let url: URL;
  try {
    url = new URL(href.trim());
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
  return { id, canonical: `https://www.youtube.com/watch?v=${id}` };
}
