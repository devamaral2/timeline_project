import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
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

/**
 * Irmao nativo de apps/web/src/lib/speech/use-speech-recognition.ts. O web
 * fala direto com a Web Speech API do navegador; aqui quem fala com o motor
 * do aparelho (SFSpeechRecognizer no iOS, SpeechRecognizer no Android) e o
 * expo-speech-recognition — mas a forma exposta pro botao e a mesma.
 *
 * Uma diferenca de modelo: la um unico evento `onresult` carrega varios
 * resultados novos desde `resultIndex`; aqui cada evento `result` carrega um
 * segmento so, com `isFinal` descrevendo o proprio evento — por isso nao ha
 * loop, so a troca do interim ou o acumulo do final.
 */
export function useSpeechRecognition({
  onFinalTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finalTranscriptRef = useRef("");
  const submittedRef = useRef(false);
  const onFinalTranscriptRef = useRef(onFinalTranscript);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    setSupported(ExpoSpeechRecognitionModule.isRecognitionAvailable());
  }, []);

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      finalTranscriptRef.current += `${transcript} `;
      setInterim("");
    } else {
      setInterim(transcript);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    setError(speechErrorMessage(event.error));
  });

  // O Android e o iOS disparam `end` tanto quando o usuario para quanto
  // quando o motor desiste sozinho (silencio, timeout) — por isso quem
  // decide se ha evento pra criar e sempre este handler, nunca o `stop()`.
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    setInterim("");

    const transcript = finalTranscriptRef.current.trim();
    if (submittedRef.current || !transcript) return;
    submittedRef.current = true;
    onFinalTranscriptRef.current(transcript);
  });

  useEffect(() => () => ExpoSpeechRecognitionModule.abort(), []);

  const start = useCallback(() => {
    finalTranscriptRef.current = "";
    submittedRef.current = false;
    setInterim("");
    setError(null);
    setListening(true);

    ExpoSpeechRecognitionModule.requestPermissionsAsync()
      .then((result) => {
        if (!result.granted) {
          setListening(false);
          setError(speechErrorMessage("not-allowed"));
          return;
        }

        ExpoSpeechRecognitionModule.start({
          lang: "pt-BR",
          interimResults: true,
          continuous: true,
          maxAlternatives: 1,
        });
      })
      .catch(() => {
        setListening(false);
        setError(speechErrorMessage("unknown"));
      });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { supported, listening, interim, error, start, stop };
}
