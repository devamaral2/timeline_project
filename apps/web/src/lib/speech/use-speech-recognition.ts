"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speechErrorMessage } from "./speech-error-messages";

interface UseSpeechRecognitionOptions {
  onFinalTranscript: (transcript: string) => void;
  /**
   * Ja comeca ouvindo ao montar. So vale no primeiro render, e so para um componente que monta
   * dentro do gesto do usuario (o chat que acabou de abrir): fora dele o Safari do iOS nega o
   * microfone.
   */
  autoStart?: boolean;
  /**
   * Silencio, em ms, depois do qual a sessao que ja ouviu algo se encerra sozinha. Sem ele, so
   * o navegador decide quando a voz acabou (e o Chrome nem sempre decide).
   */
  silenceMs?: number;
  /**
   * Chamado no lugar de `onFinalTranscript` quando a sessao acabou porque a voz parou (o silencio
   * ou o proprio navegador), e nao porque a pessoa tocou em parar.
   */
  onSilenceTranscript?: (transcript: string) => void;
}

interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  interim: string;
  /** Tudo o que ja foi ouvido nesta sessao: as frases fechadas e a que ainda esta saindo. */
  heard: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Desliga o microfone sem entregar o que foi ouvido: quem chamou fica com o texto que ja tem. */
  cancel: () => void;
}

export function useSpeechRecognition({
  onFinalTranscript,
  autoStart = false,
  silenceMs = 0,
  onSilenceTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const submittedRef = useRef(false);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onSilenceTranscriptRef = useRef(onSilenceTranscript);
  const silenceMsRef = useRef(silenceMs);
  const silenceTimerRef = useRef<number | undefined>(undefined);
  const stoppedByPersonRef = useRef(false);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
    onSilenceTranscriptRef.current = onSilenceTranscript;
    silenceMsRef.current = silenceMs;
  }, [onFinalTranscript, onSilenceTranscript, silenceMs]);

  const clearSilenceTimer = useCallback(() => {
    window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = undefined;
  }, []);

  // Lido so depois da montagem: checar `window` durante o render divergiria do HTML do servidor.
  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition));
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(silenceTimerRef.current);
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
    stoppedByPersonRef.current = false;
    setInterim("");
    setHeard("");
    setError(null);

    // `event.results` e cumulativo e o Chrome reentrega finais que ja apareceram antes: no
    // Android o `resultIndex` volta a zero em quase todo evento. Reconstruir a lista inteira
    // deixa o handler idempotente. Acumular com `+=` repetia a frase uma vez por reentrega.
    recognition.onresult = (event) => {
      let final = "";
      let pending = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += `${text} `;
        else pending += text;
      }
      finalTranscriptRef.current = final;
      setInterim(pending);
      const heardNow = `${final}${pending}`.trim();
      setHeard(heardNow);

      // A voz parou: cada resultado novo recomeca a contagem; quando ela vence, encerra a sessao
      // e o `onend` entrega o que foi dito.
      window.clearTimeout(silenceTimerRef.current);
      if (silenceMsRef.current > 0 && heardNow) {
        silenceTimerRef.current = window.setTimeout(() => recognition.stop(), silenceMsRef.current);
      }
    };

    recognition.onerror = (event) => {
      setError(speechErrorMessage(event.error));
    };

    recognition.onend = () => {
      window.clearTimeout(silenceTimerRef.current);
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
      setHeard("");

      const transcript = finalTranscriptRef.current.trim();
      // O Chrome dispara o ultimo `onresult` e depois `onend`; sem a guarda sairiam dois eventos.
      if (submittedRef.current || !transcript) return;
      submittedRef.current = true;
      const onSilence = onSilenceTranscriptRef.current;
      if (onSilence && !stoppedByPersonRef.current) onSilence(transcript);
      else onFinalTranscriptRef.current(transcript);
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

  // Depois do efeito que aborta ao desmontar: no StrictMode a sessao abortada na desmontagem
  // simulada e reaberta aqui, em vez de sobrar uma instancia duplicada ou um "ouvindo" sem microfone.
  const autoStartRef = useRef(autoStart);
  useEffect(() => {
    if (autoStartRef.current) start();
  }, [start]);

  const stop = useCallback(() => {
    stoppedByPersonRef.current = true;
    clearSilenceTimer();
    recognitionRef.current?.stop();
  }, [clearSilenceTimer]);

  const cancel = useCallback(() => {
    clearSilenceTimer();
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
    setHeard("");
  }, [clearSilenceTimer]);

  return { supported, listening, interim, heard, error, start, stop, cancel };
}
