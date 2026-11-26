import { youtubeVideoLinkOf } from "@repo/contracts/youtube";

/** Um vídeo do YouTube lido de um endereço. */
export interface YouTubeVideo {
  id: string;
  /** De onde o vídeo começa, em segundos, quando o endereço diz (`t=1m30s`, `start=90`). */
  startSeconds?: number;
}

/**
 * O vídeo de um endereço do YouTube (`watch?v=`, `youtu.be/`, `shorts/`,
 * `embed/`, `live/`), ou `null` quando o endereço não é de um vídeo: canal,
 * playlist sem vídeo, busca ou outro site. O reconhecimento é o de
 * `@repo/contracts/youtube`; aqui entra só o instante de início.
 */
export function youtubeVideoOf(href: string): YouTubeVideo | null {
  const link = youtubeVideoLinkOf(href);
  if (!link) return null;
  const startSeconds = parseStart(link.start);
  return startSeconds ? { id: link.id, startSeconds } : { id: link.id };
}

/** `90`, `90s` ou `1h2m3s`. */
function parseStart(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+s?$/.test(value)) return Number.parseInt(value, 10);
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!parts) return undefined;
  const [, hours = "0", minutes = "0", seconds = "0"] = parts;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * O endereço do player. `youtube-nocookie.com` é o domínio do YouTube que não
 * grava cookies de rastreio antes de a pessoa dar o play.
 */
export function youtubeEmbedUrl(video: YouTubeVideo): string {
  const start = video.startSeconds ? `?start=${video.startSeconds}` : "";
  return `https://www.youtube-nocookie.com/embed/${video.id}${start}`;
}

/**
 * O endereço de uma mensagem que é só um link de vídeo do YouTube (espaços ao redor não contam), ou `null` quando
 * há outro texto junto, mais de um link ou o endereço não é de um vídeo. É o que manda a mensagem do chat direto
 * para o pedido de transcrição, sem passar pelo agente.
 */
export function soleYouTubeVideoLink(text: string): string | null {
  const link = text.trim();
  if (!link || /\s/.test(link)) return null;
  return youtubeVideoOf(link) ? link : null;
}
