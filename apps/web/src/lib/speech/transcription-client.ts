import type { AudioTranscriptionDto } from '@repo/contracts';
import { sendWithSession } from '@/lib/api/authed-fetch';

const BASE = '/api/audio/transcriptions';

export class TranscriptionError extends Error {
  constructor(
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

export async function transcriptionEnabled(
  signal: AbortSignal,
): Promise<boolean> {
  const response = await sendWithSession(`${BASE}/capabilities`, {
    signal,
    cache: 'no-store',
  });
  return response.ok && (await response.json()).enabled === true;
}

export async function cancelTranscription(id: string): Promise<void> {
  await sendWithSession(`${BASE}/${id}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

async function readResult(
  response: Response,
  id: string,
): Promise<AudioTranscriptionDto> {
  if (!response.ok) {
    const retryable =
      response.status === 404 ||
      response.status === 429 ||
      response.status >= 500;
    throw new TranscriptionError(
      retryable,
      response.status === 401
        ? 'Sua sessão expirou. Entre novamente.'
        : response.status === 413
          ? 'O áudio ficou grande demais. Grave uma mensagem menor.'
          : response.status === 429
            ? 'A transcrição está ocupada. Tente novamente em instantes.'
            : 'Não consegui transcrever. Seu áudio está disponível para tentar novamente.',
    );
  }
  const result = (await response.json()) as AudioTranscriptionDto;
  if (
    result.id !== id ||
    !['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(
      result.status,
    )
  ) {
    throw new TranscriptionError(
      true,
      'A transcrição retornou uma resposta inválida. Tente novamente.',
    );
  }
  return result;
}

export async function transcribeRecording(
  id: string,
  audio: Blob,
  signal: AbortSignal,
): Promise<string> {
  const deadline = AbortSignal.timeout(180_000);
  const combined = AbortSignal.any([signal, deadline]);
  const request = async (path: string, init: RequestInit = {}) => {
    combined.throwIfAborted();
    return readResult(
      await sendWithSession(path, {
        ...init,
        signal: AbortSignal.any([combined, AbortSignal.timeout(25_000)]),
        cache: 'no-store',
      }),
      id,
    );
  };
  let result = await request(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': audio.type,
      'X-Recording-Id': id,
    },
    body: audio,
  });
  while (result.status === 'pending' || result.status === 'processing') {
    await new Promise<void>((resolve, reject) => {
      combined.throwIfAborted();
      const abort = () => {
        clearTimeout(timer);
        reject(combined.reason);
      };
      const timer = setTimeout(() => {
        combined.removeEventListener('abort', abort);
        resolve();
      }, 750);
      combined.addEventListener('abort', abort, { once: true });
    });
    result = await request(`${BASE}/${id}`);
  }
  combined.throwIfAborted();
  if (
    result.status === 'completed' &&
    typeof result.text === 'string' &&
    result.text.trim()
  )
    return result.text.trim();
  if (result.status === 'failed') {
    const messages = {
      no_speech: 'Não identifiquei fala no áudio. Tente gravar novamente.',
      invalid_audio: 'O áudio não pôde ser lido. Grave novamente.',
      duration_exceeded:
        'A gravação ultrapassou dois minutos. Grave uma mensagem menor.',
      transcription_failed:
        'Não consegui transcrever. Tente novamente com o mesmo áudio.',
    };
    throw new TranscriptionError(
      result.error === 'transcription_failed',
      messages[result.error],
    );
  }
  throw new TranscriptionError(
    false,
    'A transcrição foi cancelada ou não retornou texto.',
  );
}
