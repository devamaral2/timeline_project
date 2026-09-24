import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
]);

/** Read only after authentication. JSON parsers must leave these media types untouched. */
export async function readAudioBody(request: Request): Promise<Uint8Array> {
  if (
    !AUDIO_TYPES.has(
      (request.headers['content-type'] ?? '').split(';')[0].trim(),
    )
  ) {
    throw new HttpException('Unsupported audio format', 415);
  }
  if (Number(request.headers['content-length']) > MAX_AUDIO_BYTES) {
    throw new HttpException('Audio is too large', 413);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_AUDIO_BYTES) {
      request.resume();
      throw new HttpException('Audio is too large', 413);
    }
    chunks.push(Buffer.from(chunk));
  }
  if (!size) throw new HttpException('Audio is empty', 400);
  return new Uint8Array(Buffer.concat(chunks));
}
