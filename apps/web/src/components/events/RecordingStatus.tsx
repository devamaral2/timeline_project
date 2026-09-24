import type { useRecordedTranscription } from '@/lib/speech/use-recorded-transcription';
import styles from './recording-status.module.css';

export function RecordingStatus({
  voice,
}: {
  voice: ReturnType<typeof useRecordedTranscription>;
}) {
  if (voice.phase === 'idle') return null;
  const seconds = Math.floor(voice.seconds);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const label =
    voice.phase === 'starting'
      ? 'Acessando microfone…'
      : voice.phase === 'recording'
        ? 'Gravando'
        : voice.phase === 'stopping'
          ? 'Finalizando gravação…'
          : voice.phase === 'transcribing'
            ? 'Transcrevendo…'
            : null;
  return (
    <div className={styles.status}>
      {label && <span role="status">{label}</span>}
      {voice.phase === 'recording' && (
        <>
          <span role="timer" aria-label="Duração da gravação">
            {duration} / 2:00
          </span>
          <meter
            aria-label="Nível do microfone"
            min={0}
            max={1}
            value={voice.level}
          />
        </>
      )}
      {voice.error && <span role="alert">{voice.error}</span>}
      {voice.canRetry && (
        <button type="button" onClick={voice.retry}>
          Tentar transcrever novamente
        </button>
      )}
      <button type="button" onClick={voice.cancel}>
        {voice.phase === 'error' ? 'Descartar' : 'Cancelar gravação'}
      </button>
    </div>
  );
}
