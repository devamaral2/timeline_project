"use client";

import { useEffect, useState } from "react";
import { DetailMessage } from "@/components/detail/detail-parts";
import { ApiError } from "@/lib/api/authed-fetch";
import { type AgentFileApi, type AgentFileNoteDto, agentFileApi, shortHash } from "@/lib/notes/agent-file-notes";
import { MarkdownView } from "./MarkdownView";
import styles from "./notes.module.css";

/** O cabecalho `---` (YAML) das skills vira um bloco de codigo; sem isso o markdown o leria como linha e titulo. */
function withFrontmatterAsCode(text: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return text;
  return `\`\`\`yaml\n${match[1]}\n\`\`\`\n\n${text.slice(match[0].length)}`;
}

/**
 * O arquivo de uma skill ou agente do Hermes: o caminho, a versao (hash) e o texto lido da pasta
 * compartilhada, so para leitura. A nota acompanha o arquivo e se atualiza sozinha quando o hash muda.
 */
export function AgentFileNoteView({ note, api = agentFileApi }: { note: AgentFileNoteDto; api?: AgentFileApi }) {
  const { path, hash, missing } = note.data;
  const [text, setText] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o hash muda quando o arquivo muda, e o texto acompanha.
  useEffect(() => {
    let cancelled = false;
    setReadError(null);
    api.read(path)
      .then((file) => { if (!cancelled) setText(file.text); })
      .catch((error: unknown) => {
        if (cancelled) return;
        setReadError(error instanceof ApiError && error.status === 403
          ? "Só o dono lê o texto das skills e dos agentes."
          : "Não foi possível ler o arquivo.");
      });
    return () => { cancelled = true; };
  }, [api, path, hash]);

  return (
    <article className={styles.noteCard} aria-label="Arquivo do Hermes">
      <p className={styles.fileMeta}>
        <code>{path}</code>
        <span>versão <code>{shortHash(note.data)}</code></span>
        {missing ? <span className={styles.fileMissing}>arquivo ausente: o último texto continua guardado</span> : null}
      </p>
      {readError ? <DetailMessage alert>{readError}</DetailMessage> : null}
      {text === null && !readError ? <DetailMessage>Lendo o arquivo…</DetailMessage> : null}
      {text !== null ? (
        <>
          <div className={styles.fileModes} role="group" aria-label="Modo de exibição">
            <button type="button" aria-pressed={!raw} onClick={() => setRaw(false)}>Markdown</button>
            <button type="button" aria-pressed={raw} onClick={() => setRaw(true)}>Texto bruto</button>
          </div>
          {raw
            ? <pre className={styles.fileText} aria-label="Texto do arquivo">{text}</pre>
            : <div className={styles.fileRendered} aria-label="Texto do arquivo"><MarkdownView source={withFrontmatterAsCode(text)} /></div>}
        </>
      ) : null}

    </article>
  );
}
