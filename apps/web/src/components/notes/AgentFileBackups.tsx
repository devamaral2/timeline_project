"use client";

import { TIMELINE_TIME_ZONE } from "@repo/timeline";
import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { outlineButtonClass, primaryButtonClass } from "@/components/ui/button-styles";
import { dialogOverlayClass, dialogPanelClass, dialogTitleClass } from "@/components/ui/dialog-styles";
import {
  type AgentFileBackup,
  type AgentFileEntry,
  listAgentFileBackups,
  restoreAgentFileBackup,
} from "@/lib/api/agent-files";
import { cn } from "@/lib/utils";
import styles from "./agent-file-backups.module.css";

/*
 * Os backups de um arquivo do Hermes (ticket 38). Só o dono chega aqui: `AgentFileNoteView` não monta esta
 * seção quando a leitura do texto veio como `forbidden`. A API não devolve o texto de um backup, então a lista
 * mostra só data e tamanho; restaurar pede confirmação e, depois dela, avisa quem chamou com a entrada nova do
 * arquivo (a versão muda e o texto é relido). O texto substituído vira um backup novo: a restauração se desfaz.
 */

const whenFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: TIMELINE_TIME_ZONE });
const decimalFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function whenLabel(iso: string): string {
  return whenFormat.format(new Date(iso));
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${decimalFormat.format(bytes / 1024)} KB`;
  return `${decimalFormat.format(bytes / (1024 * 1024))} MB`;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; backups: AgentFileBackup[] }
  | { status: "error" };

/** A confirmação de restaurar: o mesmo diálogo de exclusão das notas, com o botão principal no lugar do destrutivo. */
function RestoreBackupDialog({ when, busy, error, onCancel, onConfirm }: {
  when: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, busy]);

  return createPortal(
    <div
      className={dialogOverlayClass}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(click) => {
        if (click.target === click.currentTarget && !busy) onCancel();
      }}
    >
      <div className={cn(dialogPanelClass, "max-w-sm")}>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <AlertTriangle aria-hidden className="size-5 text-foreground" />
            <h2 id={titleId} className={dialogTitleClass}>Restaurar backup</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            O texto atual do arquivo será substituído pelo backup de {when}. O texto atual fica guardado como um
            backup novo, então a restauração pode ser desfeita.
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} disabled={busy} className={outlineButtonClass}>Cancelar</button>
            <button type="button" onClick={onConfirm} disabled={busy} className={primaryButtonClass}>
              {busy ? "Restaurando..." : "Restaurar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A seção "Backups" do arquivo: a lista do mais novo para o mais antigo e, em cada linha, "Restaurar".
 * `onRestored` recebe a entrada do arquivo que a API devolve depois da restauração (versão e aviso de ausência).
 */
export function AgentFileBackups({ path, onRestored }: { path: string; onRestored: (entry: AgentFileEntry) => void }) {
  const labelId = useId();
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [pending, setPending] = useState<AgentFileBackup | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reloadKey` refaz a carga depois de uma restauração.
  useEffect(() => {
    let cancelled = false;
    listAgentFileBackups(path).then(
      (backups) => {
        if (!cancelled) setLoad({ status: "ready", backups });
      },
      () => {
        if (!cancelled) setLoad({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, reloadKey]);

  async function restore(backup: AgentFileBackup) {
    setRestoring(true);
    setError(null);
    try {
      const files = await restoreAgentFileBackup(path, backup.id);
      const entry = files.find((file) => file.path === path);
      setPending(null);
      setRestoring(false);
      if (entry) onRestored(entry);
      setReloadKey((key) => key + 1);
    } catch {
      setError("Não foi possível restaurar este backup. Tente novamente.");
      setRestoring(false);
    }
  }

  const backups = load.status === "ready" ? load.backups : [];

  return (
    <DetailSection title="Backups" count={load.status === "ready" ? backups.length : undefined} labelId={labelId}>
      {load.status === "loading" ? <DetailMessage>Carregando backups…</DetailMessage> : null}
      {load.status === "error" ? <DetailMessage alert>Não foi possível carregar os backups.</DetailMessage> : null}
      {load.status === "ready" && backups.length === 0 ? <DetailMessage>Nenhum backup ainda.</DetailMessage> : null}
      {load.status === "ready" && backups.length > 0 ? (
        <ul className={styles.list}>
          {backups.map((backup) => {
            const when = whenLabel(backup.createdAt);
            return (
              <li key={backup.id} className={styles.row}>
                <div className={styles.text}>
                  <span className={styles.when}>{when}</span>
                  <span className={styles.size}>{sizeLabel(backup.sizeBytes)}</span>
                </div>
                <button
                  type="button"
                  className={styles.restore}
                  aria-label={`Restaurar backup de ${when}`}
                  onClick={() => {
                    setError(null);
                    setPending(backup);
                  }}
                >
                  Restaurar
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {pending ? (
        <RestoreBackupDialog
          when={whenLabel(pending.createdAt)}
          busy={restoring}
          error={error}
          onCancel={() => setPending(null)}
          onConfirm={() => void restore(pending)}
        />
      ) : null}
    </DetailSection>
  );
}
