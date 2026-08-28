"use client";

import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { useVoiceEventQueue } from "@/lib/voice-events/use-voice-event-queue";
import { destructiveButtonClass, primaryButtonClass } from "@/components/ui/button-styles";
import { VoiceJobStatus } from "./VoiceJobStatus";

interface VoiceEventButtonProps {
  onCreated?: () => void;
}

export function VoiceEventButton({
  onCreated = () => window.location.reload(),
}: VoiceEventButtonProps) {
  const { jobs, enqueue, retry, dismiss } = useVoiceEventQueue({ onAllDone: onCreated });
  const { supported, listening, interim, error, start, stop } = useSpeechRecognition({
    onFinalTranscript: enqueue,
  });

  // O Firefox nao implementa a Web Speech API: sem suporte, nem mostramos o botao.
  if (!supported) return null;

  const hint = error ?? (listening ? interim : "");

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={listening ? stop : start}
          aria-label={listening ? "Parar gravação" : "Gravar evento por voz"}
          aria-pressed={listening}
          className={cn(
            listening ? destructiveButtonClass : primaryButtonClass,
            // Parado, o botao e so o microfone, redondo; gravando, ele abre
            // para caber o rotulo e pulsa.
            listening ? "animate-pulse" : "w-10 px-0",
          )}
        >
          {listening ? (
            <>
              <Square aria-hidden className="size-3.5 fill-current" />
              {/* O rotulo carrega o estado sozinho: globals.css desliga animacoes em
                  prefers-reduced-motion, e so o pulso nao comunicaria nada. */}
              Ouvindo...
            </>
          ) : (
            <Mic aria-hidden className="size-4" />
          )}
        </button>

        {hint ? (
          <p
            aria-live="polite"
            className={cn(
              "surface-glass absolute right-0 top-12 z-40 max-w-[16rem] truncate rounded-xl border border-border px-3 py-2 text-xs shadow-card-hover duration-200 animate-in fade-in slide-in-from-top-1",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>

      <VoiceJobStatus jobs={jobs} onRetry={retry} onDismiss={dismiss} />
    </>
  );
}
