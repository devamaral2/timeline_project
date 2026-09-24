import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import type { AudioTranscriptionDto } from '@repo/contracts';
import { getServerEnv } from '../../config/env';

const resultSchema = z.discriminatedUnion('status', [
  z.object({ id: z.string().uuid(), status: z.literal('pending') }),
  z.object({ id: z.string().uuid(), status: z.literal('processing') }),
  z.object({ id: z.string().uuid(), status: z.literal('cancelled') }),
  z.object({
    id: z.string().uuid(),
    status: z.literal('completed'),
    text: z.string().max(16000),
    durationSeconds: z.number().nonnegative().max(120),
  }),
  z.object({
    id: z.string().uuid(),
    status: z.literal('failed'),
    error: z.enum([
      'invalid_audio',
      'duration_exceeded',
      'no_speech',
      'transcription_failed',
    ]),
  }),
]);

export class TranscriptionGateway {
  constructor(
    private readonly env = getServerEnv(),
    private readonly send: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return (
      this.env.AUDIO_TRANSCRIPTION_ENABLED === 'true' &&
      Boolean(
        this.env.AUDIO_TRANSCRIPTION_URL && this.env.AUDIO_TRANSCRIPTION_KEY,
      )
    );
  }

  async request(
    userId: string,
    id: string,
    method: 'POST' | 'GET' | 'DELETE',
    audio?: Uint8Array,
    contentType?: string,
  ): Promise<AudioTranscriptionDto> {
    const url = this.env.AUDIO_TRANSCRIPTION_URL;
    if (!this.enabled || !url)
      throw new HttpException('Transcription is unavailable', 503);
    try {
      const response = await this.send(
        `${url.replace(/\/$/, '')}/v1/transcriptions/${id}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${this.env.AUDIO_TRANSCRIPTION_KEY}`,
            'X-Transcription-User': encodeURIComponent(userId),
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
          body: audio
            ? new Blob([audio as Uint8Array<ArrayBuffer>])
            : undefined,
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!response.ok) {
        const status = [400, 404, 409, 413, 415, 429].includes(response.status)
          ? response.status
          : 503;
        throw new HttpException('Transcription request failed', status);
      }
      const result = resultSchema.parse(await response.json());
      if (result.id !== id) throw new Error('Mismatched recording');
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Provider errors can include request data: never log/forward their message.
      throw new HttpException('Transcription is unavailable', 503);
    }
  }
}
