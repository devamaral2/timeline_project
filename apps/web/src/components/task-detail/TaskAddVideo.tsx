"use client";

import { Video } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ApiRequestError } from "@/lib/api/client-request";
import { requestTranscription } from "@/lib/api/transcription";
import { youtubeVideoOf } from "@/lib/notes/youtube";
import controls from "@/components/ui/controls.module.css";
import relations from "./task-relations.module.css";
import styles from "./task-add-video.module.css";

const INVALID_LINK = "Esse link não é de um vídeo do YouTube.";
const QUEUED = "O vídeo entrou na fila de transcrição. O texto chega na Leitura diária quando a transcrição terminar.";
const QUEUED_AGAIN = "Esse vídeo já estava na fila de transcrição. Nada foi duplicado.";
const FAILED = "Não foi possível pedir a transcrição. Tente novamente.";

interface TaskAddVideoProps {
  /** O pedido foi gravado: a tela relê a tarefa (o documento do vídeo já está nela). */
  onRequested: () => void;
}

/**
 * "Adicionar vídeo" no detalhe da Leitura diária: abre um campo para o link e cria o mesmo pedido de transcrição do
 * chat e da extensão (spec #39). Link que não é de vídeo do YouTube (canal, playlist, busca) é recusado antes de
 * chamar a API, com o mesmo aviso que a API daria.
 */
export function TaskAddVideo({ onRequested }: TaskAddVideoProps) {
  const fieldId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function show() {
    setNotice(null);
    setOpen(true);
  }

  function hide() {
    setOpen(false);
    setLink("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const url = link.trim();
    if (!youtubeVideoOf(url)) {
      setError(INVALID_LINK);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await requestTranscription(url);
      hide();
      setNotice(result.created ? QUEUED : QUEUED_AGAIN);
      onRequested();
    } catch (cause) {
      setError(cause instanceof ApiRequestError && cause.kind === "invalid_input" ? INVALID_LINK : FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.root}>
      {open ? (
        <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
          <label className={styles.label} htmlFor={fieldId}>Link do vídeo do YouTube</label>
          <input
            id={fieldId}
            className={styles.input}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoFocus
            placeholder="https://www.youtube.com/watch?v=…"
            value={link}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setLink(event.target.value);
              setError(null);
            }}
          />
          {error ? <p id={errorId} className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <button type="submit" className={controls.primaryButton} disabled={busy}>Pedir transcrição</button>
            <button type="button" className={controls.outlineButton} onClick={hide} disabled={busy}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" className={relations.addAction} onClick={show}>
          <Video className={relations.addIcon} aria-hidden />
          <span>Adicionar vídeo</span>
        </button>
      )}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    </div>
  );
}
