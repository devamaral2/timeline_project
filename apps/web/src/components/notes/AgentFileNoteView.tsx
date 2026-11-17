"use client";

import type { AgentFileData } from "@repo/contracts";
import { useEffect, useState } from "react";
import { DetailMessage } from "@/components/detail/detail-parts";
import { type AgentFileEntry, readAgentFileText } from "@/lib/api/agent-files";
import { ApiRequestError } from "@/lib/api/client-request";
import { AgentFileBackups } from "./AgentFileBackups";
import { AgentFileEditBar } from "./AgentFileEditBar";
import { MarkdownView } from "./MarkdownView";
import styles from "./notes.module.css";

/*
 * O arquivo de uma skill ou agente do Hermes (ADR 0005), em partes:
 *   1. `useAgentFileRead`: lê o texto atual pela API e diz se o usuário pode lê-lo.
 *   2. `AgentFileHeader`: caminho, versão, aviso de arquivo ausente e descrição (vem do próprio artefato).
 *   3. `AgentFileBody`: o texto, em markdown ou bruto; some para quem não é o dono.
 *   4. Ações do arquivo entram depois do corpo, em `AgentFileNoteView`, sem mexer nas partes acima:
 *      backups (ticket 38, `AgentFileBackups.tsx`) e pedido de edição (ticket 39).
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

type ReadState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "forbidden" }
  | { status: "error" };

/**
 * Lê o texto do arquivo. Quem não é o dono recebe 403: isso não é erro para a tela, só fica sem texto.
 * Relê quando o hash muda (o arquivo foi editado), mantendo o texto anterior até chegar o novo.
 */
function useAgentFileRead(path: string, hash: string, revision: number): ReadState {
  const [state, setState] = useState<ReadState>({ status: "loading" });
  // biome-ignore lint/correctness/useExhaustiveDependencies: o hash muda quando o arquivo muda, e o texto acompanha.
  useEffect(() => {
    let cancelled = false;
    readAgentFileText(path).then(
      (text) => {
        if (!cancelled) setState({ status: "ready", text });
      },
      (error: unknown) => {
        if (cancelled) return;
        const forbidden = error instanceof ApiRequestError && error.kind === "forbidden";
        setState({ status: forbidden ? "forbidden" : "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, hash, revision]);
  return state;
}

/** O cabeçalho `---` (YAML) das skills e agentes: o sumário do arquivo, separado do corpo em markdown. */
function splitFrontmatter(text: string): { summary: string[]; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { summary: [], body: text };
  return { summary: match[1].split(/\r?\n/).filter((line) => line.trim() !== ""), body: text.slice(match[0].length) };
}

/** O sumário com a fonte do resto do texto, quebrando a linha ao chegar na borda do cartão (sem rolagem lateral). */
function FileSummary({ lines }: { lines: string[] }) {
  return (
    <div className={styles.fileSummary} role="group" aria-label="Sumário do arquivo">
      {lines.map((line, index) => {
        const split = /^([\w.-]+):(?:\s+(.*))?$/.exec(line);
        // biome-ignore lint/suspicious/noArrayIndexKey: as linhas do cabeçalho são fixas e podem repetir.
        return split ? <p key={index}><span>{split[1]}:</span> {split[2]}</p> : <p key={index}>{line}</p>;
      })}
    </div>
  );
}

function FileRendered({ text }: { text: string }) {
  const { summary, body } = splitFrontmatter(text);
  return (
    <div className={styles.fileRendered} aria-label="Texto do arquivo">
      {summary.length > 0 ? <FileSummary lines={summary} /> : null}
      <MarkdownView source={body} />
    </div>
  );
}

/** Caminho, versão, aviso de arquivo ausente e descrição. Tudo vem do artefato: não depende da leitura. */
function AgentFileHeader({ data }: { data: AgentFileData }) {
  return (
    <div className={styles.fileHeader}>
      <p className={styles.fileMeta}>
        <code>{data.path}</code>
        <span>versão <code>{data.hash.slice(0, 8)}</code></span>
        {data.missing ? <span className={styles.fileMissing}>O arquivo não está mais na pasta: este é o último texto conhecido.</span> : null}
      </p>
      {data.description ? <p className={styles.fileDescription}>{data.description}</p> : null}
    </div>
  );
}

/** O texto do arquivo, em markdown ou bruto. Sem texto (não é o dono), não mostra nada e não mostra erro. */
function AgentFileBody({ read }: { read: ReadState }) {
  const [raw, setRaw] = useState(false);
  if (read.status === "forbidden") return null;
  if (read.status === "error") return <DetailMessage alert>Não foi possível ler o arquivo.</DetailMessage>;
  if (read.status === "loading") return <DetailMessage>Lendo o arquivo…</DetailMessage>;
  return (
    <>
      <div className={styles.fileModes} role="group" aria-label="Modo de exibição">
        <button type="button" aria-pressed={!raw} onClick={() => setRaw(false)}>Markdown</button>
        <button type="button" aria-pressed={raw} onClick={() => setRaw(true)}>Texto bruto</button>
      </div>
      {raw
        ? <pre className={styles.fileText} aria-label="Texto do arquivo">{read.text}</pre>
        : <FileRendered text={read.text} />}
    </>
  );
}

/** A versão que a restauração devolveu: vale enquanto o artefato trouxer o mesmo hash de antes (a tela não o relê). */
interface RestoredFile {
  fromHash: string;
  hash: string;
  missing: boolean;
}

/** O arquivo de uma skill ou agente do Hermes: caminho, versão, texto (para o dono) e, depois, as ações de arquivo. */
export function AgentFileNoteView({ data }: { data: AgentFileData }) {
  const [restored, setRestored] = useState<RestoredFile | null>(null);
  // Depois de restaurar, a versão e o aviso de ausência vêm da própria resposta; trocar o hash relê o texto.
  const current = restored && restored.fromHash === data.hash ? { ...data, hash: restored.hash, missing: restored.missing } : data;
  // Sobe a cada pedido de edição que termina: o texto é relido (o `AgentFileEditBar` avisa).
  const [revision, setRevision] = useState(0);
  const read = useAgentFileRead(current.path, current.hash, revision);
  const onRestored = (entry: AgentFileEntry) => setRestored({ fromHash: data.hash, hash: entry.hash, missing: entry.missing });
  return (
    <article className={styles.noteCard} aria-label="Arquivo do Hermes">
      <AgentFileHeader data={current} />
      <AgentFileBody read={read} />
      {/* Só depois de saber que o usuário pode ler o texto: quem não é o dono não chega a pedir os backups. */}
      {read.status === "ready" || read.status === "error" ? <AgentFileBackups path={current.path} onRestored={onRestored} /> : null}
      {/* Só para o dono, que é quem lê o texto (sem leitura permitida, o campo não é montado). */}
      {read.status === "forbidden" ? null : <AgentFileEditBar path={current.path} onDone={() => setRevision((count) => count + 1)} />}
    </article>
  );
}
