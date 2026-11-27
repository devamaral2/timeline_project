import { describe, expect, it } from "vitest";
import { RequestFailure } from "../types";
import { classifyFailure } from "./failure";

describe("falha do yt-dlp vira um código fechado", () => {
  it.each([
    ["ERROR: [youtube] abc: Private video. Sign in if you've been granted access", "private"],
    ["ERROR: [youtube] abc: Join this channel to get access to members-only content", "private"],
    ["ERROR: [youtube] abc: Video unavailable", "unavailable"],
    ["ERROR: [youtube] abc: This video has been removed by the uploader", "unavailable"],
    ["ERROR: [youtube] abc: The uploader has not made this video available in your country", "unavailable"],
    ["ERROR: [youtube] abc: Requested format is not available", "no_audio"],
    ["[download] File is larger than max-filesize (600000000 bytes > 524288000 bytes). Aborting.", "too_large"],
    ["ERROR: algo que ninguém previu", "failed"],
  ])("%s -> %s", (message, code) => {
    expect(classifyFailure(new Error(message)).code).toBe(code);
  });

  it("mantém a falha que o serviço já decidiu", () => {
    const decided = new RequestFailure("no_audio", "sem faixa de áudio");
    expect(classifyFailure(decided)).toBe(decided);
  });

  it("não vaza a mensagem crua no código", () => {
    expect(Object.keys(classifyFailure(new Error("segredo")))).not.toContain("raw");
    expect(classifyFailure("texto solto").code).toBe("failed");
  });
});
