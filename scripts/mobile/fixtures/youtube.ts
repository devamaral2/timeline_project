/**
 * Fixtures do leitor de documentos: as saídas de `youtubeVideoOf` (o vídeo de um endereço do YouTube) para as mesmas
 * entradas que o app Android recebe. O `null` do web é o `result` nulo da fixture.
 */
import { youtubeVideoOf } from "../../../apps/web/src/lib/notes/youtube";

const ID = "dQw4w9WgXcQ";

const HREFS = [
  `https://www.youtube.com/watch?v=${ID}`,
  `https://youtube.com/watch?feature=share&v=${ID}`,
  `https://m.youtube.com/watch?v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}`,
  `https://youtu.be/${ID}`,
  `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/embed/${ID}`,
  `https://www.youtube-nocookie.com/embed/${ID}`,
  `https://www.youtube.com/live/${ID}?si=abc`,
  `https://www.youtube.com/v/${ID}`,
  `http://www.youtube.com/watch?v=${ID}`,
  `HTTPS://WWW.YouTube.com/watch?v=${ID}`,
  `https://www.youtube.com:443/watch?v=${ID}`,
  `https://user@www.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com/watch/?v=${ID}`,
  `https://www.youtube.com/watch?v=${ID}#t=30`,
  `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`,
  `https://youtu.be/${ID}?t=90`,
  `https://youtu.be/${ID}?t=90s`,
  `https://www.youtube.com/watch?v=${ID}&t=1m30s`,
  `https://www.youtube.com/watch?v=${ID}&t=1h2m3s`,
  `https://www.youtube.com/watch?v=${ID}&t=2h`,
  `https://www.youtube.com/watch?v=${ID}&t=45s`,
  `https://www.youtube.com/embed/${ID}?start=45`,
  `https://youtu.be/${ID}?t=agora`,
  `https://youtu.be/${ID}?t=`,
  `https://youtu.be/${ID}?t=&start=5`,
  `https://youtu.be/${ID}?t=0`,
  `https://youtu.be/${ID}?t=1m`,
  `https://youtu.be/${ID}?start=12&t=7`,
  `https://www.youtube.com/watch?v=aqz-KE-bpKQ`,
  `https://www.youtube.com/watch?v=a_b-c_d-e_f`,
  "https://www.youtube.com/@canal",
  "https://www.youtube.com/playlist?list=PL123",
  "https://www.youtube.com/watch?v=curto",
  `https://www.youtube.com/watch?v=${ID}extra`,
  `https://www.youtube.com/watch?v=%64Qw4w9WgXcQ`,
  `https://www.youtube.com/results?search_query=${ID}`,
  `https://www.youtube.com/watch`,
  `https://www.youtube.com/`,
  `https://youtu.be/`,
  `https://youtube.com.evil.dev/watch?v=${ID}`,
  `https://exemplo.dev/watch?v=${ID}`,
  `https://xyoutube.com/watch?v=${ID}`,
  `https://a.m.youtube.com/watch?v=${ID}`,
  `ftp://www.youtube.com/watch?v=${ID}`,
  `mailto:youtu.be/${ID}`,
  "javascript:alert(1)",
  `youtu.be/${ID}`,
  `www.youtube.com/watch?v=${ID}`,
  "",
];

export function youtubeFixtures() {
  return {
    "youtube-functions": {
      youtubeVideoOf: HREFS.map((href) => ({ args: [href], result: youtubeVideoOf(href) })),
    },
  };
}
