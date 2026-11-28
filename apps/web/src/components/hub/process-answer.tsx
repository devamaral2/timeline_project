import type { RequestDto } from "@repo/contracts";
import type { AgentChatEntityRef } from "@/lib/agent-chat/use-agent-chat";
import { isSuccessAgentStatus } from "@repo/contracts";
import { isOpenRequest } from "@/lib/tasks/agent-request-model";
import { EntityRows, requestEntityRef } from "./entity-rows";
import styles from "@/components/shell/shell.module.css";

interface ProcessAnswerProps {
  /** `null` até o servidor responder o primeiro estado. */
  request: RequestDto | null;
  /** Para onde leva cada registro criado ou alterado; sem ela, as linhas sao so texto. */
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
  onOpenEntity?: () => void;
}

/**
 * O que um pedido por passos (ADR 003) deixa na conversa (canvas "Chat com o Hermes — conversa limpa", opção B).
 * Enquanto roda, nada: o passo atual vai na linha de status do campo e os demais ficam na aba "Processo". No fim, a
 * resposta em texto solto, com as linhas da consulta quando houve uma, e a prévia de cada registro criado ou alterado.
 * Um pedido que falhou ou foi cancelado deixa só o que gravou antes de parar; o aviso é a mensagem de erro da conversa.
 */
export function ProcessAnswer({ request, entityHref, onOpenEntity }: ProcessAnswerProps) {
  if (!request || isOpenRequest(request.status)) return null;
  const result = request.steps.find((step) => step.result)?.result;
  const text = isSuccessAgentStatus(request.status) ? request.message : undefined;
  const entities = request.entities.map(requestEntityRef);
  if (!text && !result && entities.length === 0) return null;
  return (
    <li className={styles.chatBubble} data-role="assistant">
      {(text || result) && (
        <>
          {text && <p>{text}</p>}
          {result && (
            <section className={styles.processRows} aria-label="Resultado da consulta">
              {result.rows.length === 0 ? (
                <p>Nenhum resultado.</p>
              ) : (
                <table>
                  <thead>
                    <tr>{result.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, index) => (
                      // As linhas nao tem id; a posicao e a identidade numa tabela so de leitura.
                      // biome-ignore lint/suspicious/noArrayIndexKey: leitura apenas
                      <tr key={index}>{row.map((cell, cellIndex) => <td key={`${index}:${cellIndex}`}>{cellText(cell)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )}
              {result.truncated && <p>Mostrando só as primeiras linhas.</p>}
            </section>
          )}
        </>
      )}
      <EntityRows entities={entities} entityHref={entityHref} onOpenEntity={onOpenEntity} />
    </li>
  );
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  return typeof cell === "object" ? JSON.stringify(cell) : String(cell);
}
