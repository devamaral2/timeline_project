import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AudioCache } from "./audio-cache";

const DAY = 24 * 3600 * 1000;
const NOW = new Date("2026-11-26T12:00:00Z");

describe("cache de áudio", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "transcriber-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function put(name: string, ageDays: number, content = "audio") {
    const path = join(dir, name);
    await writeFile(path, content);
    const at = new Date(NOW.getTime() - ageDays * DAY);
    await utimes(path, at, at);
    return path;
  }

  it("apaga só o que passou de 7 dias", async () => {
    await put("velho.webm", 7.1);
    await put("quase.webm", 6.9);
    await put("novo.m4a", 0);
    const cache = new AudioCache(dir, 7 * DAY);

    const removed = await cache.cleanup(NOW);

    expect(removed).toEqual(["velho.webm"]);
    expect((await readdir(dir)).sort()).toEqual(["novo.m4a", "quase.webm"]);
  });

  it("apaga também a baixada pela metade que ficou para trás", async () => {
    await put("abc.webm.part", 8);
    expect(await new AudioCache(dir, 7 * DAY).cleanup(NOW)).toEqual(["abc.webm.part"]);
  });

  it("cria a pasta que ainda não existe e não falha sem nada a limpar", async () => {
    const missing = join(dir, "ainda", "nao", "existe");
    const cache = new AudioCache(missing, 7 * DAY);
    expect(await cache.cleanup(NOW)).toEqual([]);
    expect(await readdir(missing)).toEqual([]);
  });

  it("não mexe em subpastas", async () => {
    await mkdir(join(dir, "pasta"));
    expect(await new AudioCache(dir, 7 * DAY).cleanup(NOW)).toEqual([]);
  });

  it("acha o áudio de um vídeo pelo id, com o tamanho, e ignora o que está pela metade", async () => {
    await put("abc123.webm", 1, "12345");
    await put("outro.webm", 1);
    await put("abc999.m4a.part", 1);
    const cache = new AudioCache(dir, 7 * DAY);

    expect(await cache.find("abc123")).toEqual({ path: join(dir, "abc123.webm"), bytes: 5 });
    expect(await cache.find("abc999")).toBeNull();
    expect(await cache.find("naoexiste")).toBeNull();
  });

  it("recusa um id que sairia da pasta", async () => {
    const cache = new AudioCache(dir, 7 * DAY);
    await expect(cache.find("../etc/passwd")).rejects.toThrow();
  });
});
