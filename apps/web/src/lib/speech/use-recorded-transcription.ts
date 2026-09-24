'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioCapture, recordingMimeType } from './audio-recorder';
import {
  cancelTranscription,
  transcribeRecording,
  transcriptionEnabled,
  TranscriptionError,
} from './transcription-client';

type Phase =
  'idle' | 'starting' | 'recording' | 'stopping' | 'transcribing' | 'error';
interface Session {
  id: string;
  scope: string;
  capture?: AudioCapture;
  audio?: Blob;
  request?: AbortController;
  submitted: boolean;
}

export function useRecordedTranscription({
  scope,
  onTranscript,
}: {
  scope: string | undefined;
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [settings, setSettings] = useState<MediaTrackSettings | null>(null);
  const current = useRef<Session | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  const dispose = useCallback(() => {
    const session = current.current;
    current.current = null;
    if (!session) return;
    session.capture?.cancel();
    session.request?.abort();
    if (session.audio) void cancelTranscription(session.id);
    session.audio = undefined;
  }, []);

  const cancel = useCallback(() => {
    dispose();
    setPhase('idle');
    setError(null);
    setCanRetry(false);
    setLevel(0);
    setSeconds(0);
  }, [dispose]);

  useEffect(() => {
    cancel();
    setSupported(false);
    if (!scope || !navigator.mediaDevices?.getUserMedia || !recordingMimeType())
      return;
    const controller = new AbortController();
    void transcriptionEnabled(controller.signal)
      .then((enabled) => {
        if (!controller.signal.aborted) setSupported(enabled);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [scope, cancel]);

  useEffect(() => {
    // Backgrounded mobile tabs may suspend timers/audio. Never send an interrupted recording.
    const hidden = () => {
      if (document.hidden && current.current?.capture) cancel();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      dispose();
    };
  }, [cancel, dispose]);

  const process = useCallback(async (session: Session) => {
    if (!session.audio || session.request || session.submitted) return;
    const controller = new AbortController();
    session.request = controller;
    setPhase('transcribing');
    setError(null);
    setCanRetry(false);
    try {
      const text = await transcribeRecording(
        session.id,
        session.audio,
        controller.signal,
      );
      if (
        current.current !== session ||
        scopeRef.current !== session.scope ||
        controller.signal.aborted ||
        session.submitted
      )
        return;
      session.submitted = true;
      session.audio = undefined;
      current.current = null;
      setPhase('idle');
      callback.current(text);
    } catch (failure) {
      if (
        current.current !== session ||
        scopeRef.current !== session.scope ||
        controller.signal.aborted
      )
        return;
      setPhase('error');
      setError(
        failure instanceof TranscriptionError
          ? failure.message
          : 'Não consegui concluir a transcrição. Tente novamente com o mesmo áudio.',
      );
      setCanRetry(
        !(failure instanceof TranscriptionError) || failure.retryable,
      );
    } finally {
      session.request = undefined;
    }
  }, []);

  const start = useCallback(() => {
    if (!supported || !scopeRef.current || current.current) return;
    const session: Session = {
      id: crypto.randomUUID(),
      scope: scopeRef.current,
      submitted: false,
    };
    current.current = session;
    setPhase('starting');
    setError(null);
    setCanRetry(false);
    setSeconds(0);
    setLevel(0);
    setSettings(null);
    const active = () =>
      current.current === session && scopeRef.current === session.scope;
    session.capture = new AudioCapture({
      started: (actualSettings) => {
        if (active()) {
          setSettings(actualSettings);
          setPhase('recording');
        }
      },
      progress: (duration, amplitude) => {
        if (active()) {
          setSeconds(duration);
          setLevel(amplitude);
        }
      },
      complete: (audio) => {
        session.capture = undefined;
        if (!active() || session.audio || session.submitted) return;
        session.audio = audio;
        setLevel(0);
        void process(session);
      },
      error: (message) => {
        session.capture = undefined;
        if (!active()) return;
        current.current = null;
        setPhase('error');
        setError(message);
        setLevel(0);
      },
    });
    void session.capture.start();
  }, [supported, process]);

  const stop = useCallback(() => {
    if (!current.current?.capture) return;
    setPhase('stopping');
    current.current.capture.stop();
  }, []);
  const retry = useCallback(() => {
    if (current.current && canRetry) void process(current.current);
  }, [process, canRetry]);

  return {
    supported,
    phase,
    seconds,
    level,
    error,
    canRetry,
    settings,
    start,
    stop,
    cancel,
    retry,
    busy:
      phase === 'starting' ||
      phase === 'recording' ||
      phase === 'stopping' ||
      phase === 'transcribing',
  };
}
