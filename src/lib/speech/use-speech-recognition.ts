"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speechErrorMessage } from "./speech-error-messages";

interface UseSpeechRecognitionOptions {
  onFinalTranscript: (transcript: string) => void;
}

interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSpeechRecognition({
  onFinalTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const submittedRef = useRef(false);
  const onFinalTranscriptRef = useRef(onFinalTranscript);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  // Lido so depois da montagem: checar `window` durante o render divergiria do HTML do servidor.
  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition));
  }, []);

  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    },
    [],
  );

  // Criado dentro do clique, nunca em efeito: o StrictMode duplicaria a instancia e o Safari do
  // iOS so autoriza o microfone quando `start()` roda dentro do gesto do usuario.
  const start = useCallback(() => {
    if (recognitionRef.current) return;
    const SpeechRecognitionConstructor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) return;

    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";
    recognition.maxAlternatives = 1;

    finalTranscriptRef.current = "";
    submittedRef.current = false;
    setInterim("");
    setError(null);

    recognition.onresult = (event) => {
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalTranscriptRef.current += `${text} `;
        else pending += text;
      }
      setInterim(pending);
    };

    recognition.onerror = (event) => {
      setError(speechErrorMessage(event.error));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterim("");

      const transcript = finalTranscriptRef.current.trim();
      // O Chrome dispara o ultimo `onresult` e depois `onend`; sem a guarda sairiam dois eventos.
      if (submittedRef.current || !transcript) return;
      submittedRef.current = true;
      onFinalTranscriptRef.current(transcript);
    };

    recognitionRef.current = recognition;
    setListening(true);

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError(speechErrorMessage("unknown"));
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { supported, listening, interim, error, start, stop };
}
