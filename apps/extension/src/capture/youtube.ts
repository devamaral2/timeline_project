import { youtubeVideoLinkOf } from "@repo/contracts/youtube";

export interface YouTubeLink {
  /** O endereço do vídeo sem nada além do id: é por ele que a mesma página é reconhecida. */
  canonical: string;
  /** O mesmo endereço com o instante de início, quando o original trazia um. */
  withStart: string;
}

/**
 * O vídeo de um endereço do YouTube, como endereço de `watch`. `null` em canal, playlist, busca ou outro site. O
 * reconhecimento é o de `@repo/contracts/youtube`, o mesmo do leitor do Candeia (o que sai daqui vira player lá);
 * aqui entra só o instante de início que vai junto.
 */
export function youtubeLinkOf(href: string): YouTubeLink | null {
  const video = youtubeVideoLinkOf(href);
  if (!video) return null;
  const { canonical, start } = video;
  return { canonical, withStart: start && /^[0-9hms]+$/.test(start) ? `${canonical}&t=${start}` : canonical };
}
