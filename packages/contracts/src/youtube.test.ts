import { describe, expect, test } from "vitest";
import { youtubeVideoLinkOf } from "./youtube";

const ID = "dQw4w9WgXcQ";
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

describe("youtubeVideoLinkOf", () => {
  test.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?feature=share&v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://www.youtube.com/live/${ID}?si=abc`],
    [`https://www.youtube.com/v/${ID}`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`HTTPS://WWW.YouTube.com/watch?v=${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])("reconhece %s e devolve o endereço canônico", (href) => {
    expect(youtubeVideoLinkOf(href)).toMatchObject({ id: ID, canonical: CANONICAL });
  });

  test("devolve o instante de início como o endereço o escreveu, preferindo `t` a `start`", () => {
    expect(youtubeVideoLinkOf(`https://youtu.be/${ID}?t=90`)?.start).toBe("90");
    expect(youtubeVideoLinkOf(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)?.start).toBe("1h2m3s");
    expect(youtubeVideoLinkOf(`https://www.youtube.com/embed/${ID}?start=45`)?.start).toBe("45");
    expect(youtubeVideoLinkOf(`https://youtu.be/${ID}?start=12&t=7`)?.start).toBe("7");
    expect(youtubeVideoLinkOf(`https://youtu.be/${ID}`)?.start).toBeNull();
  });

  test.each([
    ["https://www.youtube.com/@canal"],
    ["https://www.youtube.com/playlist?list=PL123"],
    ["https://www.youtube.com/watch?v=curto"],
    [`https://www.youtube.com/watch?v=${ID}extra`],
    ["https://www.youtube.com/results?search_query=dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch"],
    ["https://youtu.be/"],
    [`https://youtube.com.evil.dev/watch?v=${ID}`],
    [`https://exemplo.dev/watch?v=${ID}`],
    [`https://a.m.youtube.com/watch?v=${ID}`],
    [`ftp://www.youtube.com/watch?v=${ID}`],
    ["javascript:alert(1)"],
    [`youtu.be/${ID}`],
    [""],
  ])("recusa %s", (href) => {
    expect(youtubeVideoLinkOf(href)).toBeNull();
  });
});
