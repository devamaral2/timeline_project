import { describe, expect, it } from "vitest";
import { checkAudioSize, checkDuration } from "./limits";

describe("recusa por duração", () => {
  const limit = 4 * 3600;

  it("aceita um vídeo no limite", () => {
    expect(checkDuration(limit, limit)).toBeNull();
  });

  it("recusa um vídeo acima do limite com too_large, antes de baixar", () => {
    expect(checkDuration(limit + 1, limit)?.code).toBe("too_large");
  });

  it("recusa um vídeo sem duração, como uma transmissão ao vivo", () => {
    expect(checkDuration(0, limit)?.code).toBe("unavailable");
  });
});

describe("recusa por tamanho do áudio", () => {
  const limit = 500 * 1024 * 1024;

  it("aceita o áudio no limite e aceita quando o tamanho é desconhecido", () => {
    expect(checkAudioSize(limit, limit)).toBeNull();
    expect(checkAudioSize(null, limit)).toBeNull();
  });

  it("recusa o áudio acima do limite com too_large", () => {
    expect(checkAudioSize(limit + 1, limit)?.code).toBe("too_large");
  });
});
