import { Check, Circle, LoaderCircle, X } from "lucide-react";
import type { AgentChatEntityRef, AiProcessDto, AiProcessStepDto } from "@/lib/api/contracts";
import { EntityRows, processEntityRef } from "./entity-rows";
import styles from "./mockup.module.css";

const STATUS_TEXT: Record<AiProcessStepDto["status"], string> = {
  pending: "aguardando",
  running: "em andamento",
  succeeded: "concluído",
  failed: "falhou",
};

/** Antes de o servidor responder o primeiro estado a caixa ja mostra o titulo, como o servidor o escreve. */
const FALLBACK_TITLE = "Realizando processos:";

/**
 * A caixa de processo (ADR 003): o titulo e a lista de passos, com check verde ao concluir e vermelho ao
 * falhar, e, abaixo, a prévia de cada registro criado ou alterado. Todo texto vem predefinido do servidor; so a mensagem do fim (resposta do fallback ou o que falhou)
 * e livre, e so existe quando precisa.
 */
interface ProcessBoxProps {
  process: AiProcessDto | null;
  /** Para onde leva cada registro criado ou alterado; sem ela, as linhas sao so texto. */
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
  onOpenEntity?: () => void;
}

export function ProcessBox({ process, entityHref, onOpenEntity }: ProcessBoxProps) {
  const steps = process?.steps ?? [];
  const query = steps.find((step) => step.result);
  return (
    <section className={styles.processBox} aria-label="Processo" data-status={process?.status ?? "dispatching"}>
      <p className={styles.processTitle}>{process?.title ?? FALLBACK_TITLE}</p>
      {steps.length === 0 && !process?.message && (
        <p className={styles.processWaiting} role="status">
          <LoaderCircle aria-hidden />
          Entendendo o pedido…
        </p>
      )}
      <ul className={styles.processSteps} aria-label="Passos do processo">
        {steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            <span className={styles.processMark} aria-hidden>
              {step.status === "succeeded" && <Check />}
              {step.status === "failed" && <X />}
              {step.status === "running" && <LoaderCircle data-spin />}
              {step.status === "pending" && <Circle />}
            </span>
            <span>{step.label}</span>
            <span className={styles.srOnly}>{STATUS_TEXT[step.status]}</span>
          </li>
        ))}
      </ul>
      {query?.result && (
        <section className={styles.processRows} aria-label="Resultado da consulta">
          {query.result.rows.length === 0 ? (
            <p>Nenhum resultado.</p>
          ) : (
            <table>
              <thead>
                <tr>{query.result.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
              </thead>
              <tbody>
                {query.result.rows.map((row, index) => (
                  // As linhas nao tem id; a posicao e a identidade numa tabela so de leitura.
                  // biome-ignore lint/suspicious/noArrayIndexKey: leitura apenas
                  <tr key={index}>{row.map((cell, cellIndex) => <td key={`${index}:${cellIndex}`}>{cellText(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          {query.result.truncated && <p>Mostrando só as primeiras linhas.</p>}
        </section>
      )}
      <EntityRows entities={(process?.entities ?? []).map(processEntityRef)} entityHref={entityHref} onOpenEntity={onOpenEntity} />
      {process?.message && <p className={styles.processMessage}>{process.message}</p>}
    </section>
  );
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  return typeof cell === "object" ? JSON.stringify(cell) : String(cell);
}
