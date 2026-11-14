import type { AgentEventStatus, RequestDto } from "@repo/contracts";
import { Check, Circle, LoaderCircle, X } from "lucide-react";
import type { AgentChatEntityRef } from "@/lib/api/contracts";
import { isRequestOpen } from "@/lib/agent-chat/use-agent-chat";
import { EntityRows, requestEntityRef } from "./entity-rows";
import styles from "@/components/shell/shell.module.css";

/** Como a caixa mostra cada passo: a marca, o estado nos dados (`data-status`) e o texto que o leitor de tela ouve. */
const STEP_VIEW: Record<AgentEventStatus, { state: "pending" | "running" | "succeeded" | "failed" | "cancelled"; text: string }> = {
  queued: { state: "pending", text: "aguardando" },
  waiting: { state: "pending", text: "aguardando" },
  running: { state: "running", text: "em andamento" },
  done: { state: "succeeded", text: "concluído" },
  failed: { state: "failed", text: "falhou" },
  cancel: { state: "cancelled", text: "cancelado" },
};

/** O titulo da caixa e fixo: o texto do pedido ja aparece na mensagem do usuario. */
const TITLE = "Realizando processos:";

/**
 * A caixa de processo (ADR 003): o titulo e a lista de passos, com check verde ao concluir e vermelho ao
 * falhar, e, abaixo, a prévia de cada registro criado ou alterado. Todo texto vem predefinido do servidor; so a
 * resposta (quando o pedido termina) e livre. Enquanto o pedido esta aberto, um botão cancela.
 */
interface ProcessBoxProps {
  request: RequestDto | null;
  /** Para onde leva cada registro criado ou alterado; sem ela, as linhas sao so texto. */
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
  onOpenEntity?: () => void;
  /** Cancela o pedido enquanto ele esta aberto; sem ele, a caixa nao mostra o botão. */
  onCancel?: () => void;
}

export function ProcessBox({ request, entityHref, onOpenEntity, onCancel }: ProcessBoxProps) {
  const steps = request?.steps ?? [];
  const query = steps.find((step) => step.result);
  const open = request === null || isRequestOpen(request);
  return (
    <section className={styles.processBox} aria-label="Processo" data-status={request?.status ?? "queued"}>
      <p className={styles.processTitle}>{TITLE}</p>
      {steps.length === 0 && open && (
        <p className={styles.processWaiting} role="status">
          <LoaderCircle aria-hidden />
          Entendendo o pedido…
        </p>
      )}
      <ul className={styles.processSteps} aria-label="Passos do processo">
        {steps.map((step) => {
          const view = STEP_VIEW[step.status];
          return (
            <li key={step.id} data-status={view.state}>
              <span className={styles.processMark} aria-hidden>
                {view.state === "succeeded" && <Check />}
                {view.state === "failed" && <X />}
                {view.state === "running" && <LoaderCircle data-spin />}
                {(view.state === "pending" || view.state === "cancelled") && <Circle />}
              </span>
              <span>{step.label}</span>
              <span className={styles.srOnly}>{view.text}</span>
            </li>
          );
        })}
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
      <EntityRows entities={(request?.entities ?? []).map(requestEntityRef)} entityHref={entityHref} onOpenEntity={onOpenEntity} />
      {request?.status === "done" && request.message && <p className={styles.processMessage}>{request.message}</p>}
      {onCancel && request && isRequestOpen(request) && (
        <button type="button" className={styles.processCancel} onClick={onCancel}>
          Cancelar pedido
        </button>
      )}
    </section>
  );
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  return typeof cell === "object" ? JSON.stringify(cell) : String(cell);
}
