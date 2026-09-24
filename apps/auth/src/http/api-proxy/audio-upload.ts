import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

export function isAudioPath(path: string): boolean {
  return (
    path === '/api/audio/transcriptions' ||
    path.startsWith('/api/audio/transcriptions/')
  );
}

/** The gateway must not JSON.stringify audio. Buffer only this bounded, authorized upload. */
export async function audioUpload(request: Request): Promise<Uint8Array> {
  const limit = 20 * 1024 * 1024;
  const type = (request.headers['content-type'] ?? '').split(';')[0].trim();
  if (!['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'].includes(type)) {
    throw new HttpException('Unsupported audio format', 415);
  }
  if (Number(request.headers['content-length']) > limit)
    throw new HttpException('Audio is too large', 413);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      request.resume();
      throw new HttpException('Audio is too large', 413);
    }
    chunks.push(Buffer.from(chunk));
  }
  if (!size) throw new HttpException('Audio is empty', 400);
  return new Uint8Array(Buffer.concat(chunks));
}
