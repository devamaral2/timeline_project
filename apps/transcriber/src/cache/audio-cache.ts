import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AudioFile, AudioStore } from "../ports";

const SAFE_ID = /^[\w-]{1,64}$/;
const PARTIAL = /\.(part|ytdl|tmp|temp)$/;

/**
 * Os áudios baixados, numa pasta, pelo id do vídeo (`<id>.<ext>`). Um pedido de um vídeo que já está aqui não baixa
 * de novo. Passou do prazo (7 dias, pela data de gravação), o arquivo sai: ao subir e uma vez por dia.
 */
export class AudioCache implements AudioStore {
  constructor(
    readonly dir: string,
    private readonly ttlMs: number,
  ) {}

  async find(videoId: string): Promise<AudioFile | null> {
    if (!SAFE_ID.test(videoId)) throw new Error(`id de vídeo inválido: '${videoId}'`);
    await mkdir(this.dir, { recursive: true });
    const name = (await readdir(this.dir)).find((entry) => entry.startsWith(`${videoId}.`) && !PARTIAL.test(entry));
    if (!name) return null;
    const path = join(this.dir, name);
    const info = await stat(path);
    return info.isFile() ? { path, bytes: info.size } : null;
  }

  /** Apaga os arquivos mais velhos que o prazo e devolve os nomes. Subpastas não são tocadas. */
  async cleanup(now: Date): Promise<string[]> {
    await mkdir(this.dir, { recursive: true });
    const removed: string[] = [];
    for (const name of await readdir(this.dir)) {
      const path = join(this.dir, name);
      const info = await stat(path);
      if (!info.isFile() || now.getTime() - info.mtimeMs <= this.ttlMs) continue;
      await unlink(path);
      removed.push(name);
    }
    return removed;
  }
}
