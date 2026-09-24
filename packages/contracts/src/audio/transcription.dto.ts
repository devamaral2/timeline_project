/** One recording, one result. Audio is transient and never creates chat messages itself. */
export type AudioTranscriptionError =
  'invalid_audio' | 'duration_exceeded' | 'no_speech' | 'transcription_failed';

export type AudioTranscriptionDto = { id: string } & (
  | { status: 'pending' | 'processing' | 'cancelled' }
  | { status: 'completed'; text: string; durationSeconds: number }
  | { status: 'failed'; error: AudioTranscriptionError }
);
