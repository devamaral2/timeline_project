import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AudioFile, YtDlp } from "../ports";
import { RequestFailure, type RawComment, type VideoMetadata } from "../types";
import type { CommandRunner } from "./command-runner";
import { parseComments, parseMetadata } from "./ytdlp-json";

export interface YtDlpOptions {
  bin: string;
  /** O comando que atualiza o yt-dlp (`yt-dlp -U`, `pipx upgrade yt-dlp`...). */
  updateCommand: string[];
  /** Argumentos que valem para toda chamada (cookies, proxy). */
  extraArgs: string[];
}

/** Só letras, números, hífen e sublinhado: o yt-dlp lê `--sub-langs` como expressão regular. */
const SAFE_LANGUAGE = /^[A-Za-z0-9_-]{1,32}$/;
/** Os 50 mais novos, só os de primeiro nível: `max_comments=<total>,<raízes>,<respostas>`. */
const COMMENT_ARGS = "youtube:max_comments=50,50,0;comment_sort=new";

/** O `yt-dlp` de verdade: monta os argumentos, roda e lê a saída. As partes que interpretam a saída são puras (`ytdlp-json.ts`). */
export class RealYtDlp implements YtDlp {
  constructor(
    private readonly run: CommandRunner,
    private readonly options: YtDlpOptions,
  ) {}

  async update(signal: AbortSignal): Promise<void> {
    const [command, ...args] = this.options.updateCommand;
    if (!command) return;
    await this.run(command, args, { signal });
  }

  async metadata(url: string, signal: AbortSignal): Promise<VideoMetadata> {
    const { stdout } = await this.run(this.options.bin, this.args(["--dump-single-json", "--skip-download", "--no-playlist", url]), { signal });
    return parseMetadata(JSON.parse(stdout));
  }

  async downloadAudio(input: { url: string; videoId: string; dir: string; maxBytes: number }, signal: AbortSignal): Promise<AudioFile> {
    const { stdout, stderr } = await this.run(
      this.options.bin,
      this.args([
        "--no-playlist",
        "-f",
        "bestaudio",
        "--max-filesize",
        String(input.maxBytes),
        "-o",
        `${input.dir}/%(id)s.%(ext)s`,
        "--no-progress",
        "--no-simulate",
        "--print",
        "after_move:filepath",
        // Com `--print` o yt-dlp cala o aviso de "maior que o teto"; só o modo detalhado o deixa no stderr.
        "--verbose",
        input.url,
      ]),
      { signal },
    );
    const path = stdout.trim().split("\n").at(-1)?.trim();
    if (!path) {
      if (/larger than/i.test(stderr)) throw new RequestFailure("too_large", "o yt-dlp pulou o áudio por passar do teto de tamanho");
      throw new Error("o yt-dlp não baixou o áudio");
    }
    return { path, bytes: (await stat(path)).size };
  }

  async downloadSubtitles(input: { url: string; language: string }, signal: AbortSignal): Promise<string> {
    if (!SAFE_LANGUAGE.test(input.language)) throw new Error(`código de idioma inválido: '${input.language}'`);
    const folder = await mkdtemp(join(tmpdir(), "braid-subs-"));
    try {
      await this.run(
        this.options.bin,
        this.args([
          "--skip-download",
          "--no-playlist",
          "--write-subs",
          "--sub-langs",
          input.language,
          "--sub-format",
          "vtt",
          "--convert-subs",
          "vtt",
          "-o",
          `${folder}/subs.%(ext)s`,
          "--quiet",
          input.url,
        ]),
        { signal },
      );
      const file = (await readdir(folder)).find((name) => name.endsWith(".vtt"));
      if (!file) throw new Error("o yt-dlp não baixou a legenda");
      return await readFile(join(folder, file), "utf8");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  async comments(url: string, signal: AbortSignal): Promise<RawComment[]> {
    const { stdout } = await this.run(
      this.options.bin,
      this.args(["--dump-single-json", "--skip-download", "--no-playlist", "--write-comments", "--extractor-args", COMMENT_ARGS, url]),
      { signal },
    );
    return parseComments(JSON.parse(stdout));
  }

  private args(args: string[]): string[] {
    return [...this.options.extraArgs, "--no-warnings", ...args];
  }
}
