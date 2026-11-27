import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandRunner } from "./command-runner";
import { RealYtDlp } from "./ytdlp";

describe("yt-dlp de verdade (atrás de um executor de comandos falso)", () => {
  let dir: string;
  let calls: { command: string; args: string[] }[];
  let respond: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  const runner: CommandRunner = async (command, args) => {
    calls.push({ command, args });
    return respond(args);
  };
  const signal = new AbortController().signal;
  const ytdlp = () => new RealYtDlp(runner, { bin: "yt-dlp", updateCommand: ["yt-dlp", "-U"], extraArgs: ["--cookies-from-browser", "firefox"] });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "transcriber-ytdlp-"));
    calls = [];
    respond = async () => ({ stdout: "", stderr: "" });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("atualiza com o comando configurado", async () => {
    await ytdlp().update(signal);
    expect(calls).toEqual([{ command: "yt-dlp", args: ["-U"] }]);
  });

  it("lê os metadados sem baixar e leva os argumentos extras", async () => {
    respond = async () => ({ stdout: JSON.stringify({ id: "abc123", title: "t", duration: 5 }), stderr: "" });

    const meta = await ytdlp().metadata("https://www.youtube.com/watch?v=abc123", signal);

    expect(meta.id).toBe("abc123");
    const args = calls[0]?.args ?? [];
    expect(args).toContain("--skip-download");
    expect(args).toContain("--no-playlist");
    expect(args).toContain("--dump-single-json");
    expect(args).toContain("firefox");
    expect(args.at(-1)).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("baixa só o áudio, com o teto de tamanho, e devolve o arquivo e o tamanho", async () => {
    const file = join(dir, "abc123.webm");
    await writeFile(file, "12345");
    respond = async () => ({ stdout: `${file}\n`, stderr: "" });

    const audio = await ytdlp().downloadAudio({ url: "u", videoId: "abc123", dir, maxBytes: 500 * 1024 * 1024 }, signal);

    expect(audio).toEqual({ path: file, bytes: 5 });
    const args = calls[0]?.args ?? [];
    expect(args.slice(args.indexOf("-f"), args.indexOf("-f") + 2)).toEqual(["-f", "bestaudio"]);
    expect(args[args.indexOf("--max-filesize") + 1]).toBe(String(500 * 1024 * 1024));
    expect(args).toContain(`${dir}/%(id)s.%(ext)s`);
  });

  it("quando o yt-dlp pula o arquivo por ser maior que o teto, é too_large", async () => {
    respond = async () => ({ stdout: "", stderr: "[download] File is larger than max-filesize (600 bytes > 500 bytes). Aborting." });

    await expect(ytdlp().downloadAudio({ url: "u", videoId: "abc123", dir, maxBytes: 500 }, signal)).rejects.toMatchObject({
      code: "too_large",
    });
  });

  it("sem arquivo e sem explicação, a baixada falha", async () => {
    await expect(ytdlp().downloadAudio({ url: "u", videoId: "abc123", dir, maxBytes: 500 }, signal)).rejects.toThrow(/não baixou/);
  });

  it("baixa a legenda feita por alguém no idioma pedido e devolve o texto", async () => {
    respond = async (args) => {
      const template = args[args.indexOf("-o") + 1] ?? "";
      const folder = template.slice(0, template.lastIndexOf("/"));
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "subs.pt.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\noi");
      return { stdout: "", stderr: "" };
    };

    const vtt = await ytdlp().downloadSubtitles({ url: "u", language: "pt" }, signal);

    expect(vtt).toContain("oi");
    const args = calls[0]?.args ?? [];
    expect(args).toContain("--write-subs");
    expect(args).not.toContain("--write-auto-subs");
    expect(args).toContain("--skip-download");
    expect(args[args.indexOf("--sub-langs") + 1]).toBe("pt");
  });

  it("não aceita um código de idioma que o yt-dlp leria como expressão", async () => {
    await expect(ytdlp().downloadSubtitles({ url: "u", language: ".*" }, signal)).rejects.toThrow();
  });

  it("pede só os comentários mais recentes e lê a lista", async () => {
    respond = async () => ({ stdout: JSON.stringify({ id: "x", comments: [{ author: "Ana", text: "oi", like_count: 1, timestamp: 5, parent: "root" }] }), stderr: "" });

    const comments = await ytdlp().comments("u", signal);

    expect(comments).toEqual([{ author: "Ana", text: "oi", likes: 1, timestamp: 5, isReply: false }]);
    const args = calls[0]?.args ?? [];
    expect(args).toContain("--write-comments");
    expect(args.find((arg) => arg.startsWith("youtube:"))).toMatch(/comment_sort=new/);
  });

  it("a falha de um comando passa como erro, para a classificação decidir o código", async () => {
    respond = async () => {
      throw new Error("ERROR: Private video");
    };
    await expect(ytdlp().metadata("u", signal)).rejects.toThrow(/Private video/);
  });
});
