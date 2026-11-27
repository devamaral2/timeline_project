/**
 * O reconhecimento do endereço de um vídeo do YouTube, único para a extensão, o web e a API (spec #39). É JS de
 * verdade (o `index.ts` só tem tipos), por isso tem o subpath `@repo/contracts/youtube`. A porta Kotlin
 * (`domain/markdown/YouTube.kt`) é conferida por fixtures geradas a partir do web, que usa esta função.
 */

/** Um vídeo do YouTube lido de um endereço. */
export interface YouTubeVideoLink {
  id: string;
  /** O endereço do vídeo sem nada além do id: é por ele que o mesmo vídeo é reconhecido. */
  canonical: string;
  /** O instante de início como o endereço o escreveu (`t` ou `start`, `t` primeiro); `null` quando não há. */
  start: string | null;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "youtube-nocookie.com"]);
/** Os caminhos em que o id vem logo depois: `/embed/ID`, `/shorts/ID`, `/live/ID`, `/v/ID`. */
const ID_PATHS = new Set(["embed", "shorts", "live", "v"]);

/**
 * O vídeo de um endereço do YouTube (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/`, `v/`). `null` em canal,
 * playlist sem vídeo, busca, outro site ou endereço que não é `http(s)`.
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

  return {
    id,
    canonical: `https://www.youtube.com/watch?v=${id}`,
    start: url.searchParams.get("t") ?? url.searchParams.get("start"),
  };
}
