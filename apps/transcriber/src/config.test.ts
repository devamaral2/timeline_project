import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

const base = { TRANSCRIBER_API_URL: "https://auth.exemplo.com/", TRANSCRIBER_DEVICE_KEY: "bdk_segredo", HOME: "/home/rafa" };

describe("configuração do serviço", () => {
  it("usa os padrões da spec: 4 h, 500 MB, 7 dias", () => {
    const config = loadConfig(base);

    expect(config.apiUrl).toBe("https://auth.exemplo.com");
    expect(config.deviceKey).toBe("bdk_segredo");
    expect(config.service.limits).toEqual({ maxDurationSeconds: 4 * 3600, maxAudioBytes: 500 * 1024 * 1024 });
    expect(config.cacheTtlMs).toBe(7 * 24 * 3600 * 1000);
    expect(config.cacheDir).toBe("/home/rafa/.cache/braid-transcriber");
  });

  it("deixa a duração, o tamanho e o prazo do cache configuráveis", () => {
    const config = loadConfig({
      ...base,
      TRANSCRIBER_MAX_DURATION_HOURS: "2.5",
      TRANSCRIBER_MAX_AUDIO_MB: "100",
      TRANSCRIBER_CACHE_DAYS: "3",
      TRANSCRIBER_CACHE_DIR: "/dados/cache",
      TRANSCRIBER_POLL_SECONDS: "10",
    });

    expect(config.service.limits).toEqual({ maxDurationSeconds: 9000, maxAudioBytes: 100 * 1024 * 1024 });
    expect(config.cacheTtlMs).toBe(3 * 24 * 3600 * 1000);
    expect(config.cacheDir).toBe("/dados/cache");
    expect(config.service.pollMs).toBe(10_000);
  });

  it("respeita XDG_CACHE_HOME", () => {
    expect(loadConfig({ ...base, XDG_CACHE_HOME: "/xdg" }).cacheDir).toBe("/xdg/braid-transcriber");
  });

  it("lista tudo o que falta de uma vez, sem repetir a chave", () => {
    const failure = (() => {
      try {
        loadConfig({ HOME: "/home/rafa" });
      } catch (cause) {
        return cause;
      }
    })();
    expect(failure).toBeInstanceOf(ConfigError);
    expect((failure as Error).message).toContain("TRANSCRIBER_API_URL");
    expect((failure as Error).message).toContain("TRANSCRIBER_DEVICE_KEY");
  });

  it.each([["TRANSCRIBER_MAX_DURATION_HOURS", "0"], ["TRANSCRIBER_MAX_AUDIO_MB", "abc"], ["TRANSCRIBER_CACHE_DAYS", "-1"]])(
    "recusa %s=%s",
    (name, value) => {
      expect(() => loadConfig({ ...base, [name]: value })).toThrow(ConfigError);
    },
  );

  it("recusa uma URL que não é http(s) e uma chave que não é de dispositivo", () => {
    expect(() => loadConfig({ ...base, TRANSCRIBER_API_URL: "ftp://x" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, TRANSCRIBER_DEVICE_KEY: "token-de-sessao" })).toThrow(ConfigError);
  });

  it("não deixa a chave aparecer na mensagem de erro", () => {
    try {
      loadConfig({ ...base, TRANSCRIBER_API_URL: "ftp://x", TRANSCRIBER_DEVICE_KEY: "bdk_segredo" });
    } catch (cause) {
      expect((cause as Error).message).not.toContain("bdk_segredo");
    }
  });

  it("separa o comando de atualização do yt-dlp em palavras", () => {
    expect(loadConfig(base).ytdlpUpdate).toEqual(["yt-dlp", "-U"]);
    expect(loadConfig({ ...base, TRANSCRIBER_YTDLP_UPDATE: "pipx upgrade yt-dlp" }).ytdlpUpdate).toEqual(["pipx", "upgrade", "yt-dlp"]);
  });
});
