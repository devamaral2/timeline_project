import {
  agentStatusesBefore,
  IN_PROGRESS_AGENT_STATUSES,
  KINDS_WITHOUT_SITUATION,
  OPEN_AGENT_STATUSES,
  REVIEW_SITUATION_ON_CLOSE,
  STOPPABLE_RUNNING_STATUS,
  STOPPED_BEFORE_RUNNING,
  STOPPED_FROM_RUNNING,
} from "../../../domain/agent-status";
import type { AgentTaskStatus } from "../../../domain/sets";
import { sqlList } from "../database/schema/sets";
import { sql } from "../sqlite/sql";

/**
 * O SQL dos grupos e das politicas de status de agente, montado num lugar so. O store de pedidos e o pedido de
 * transcricao do servico local fecham tarefas de agente por aqui, para nenhum dos dois ter lista nem politica propria.
 */

/** Ainda nao terminou: pode ser cancelado. */
export const OPEN_REQUEST = sql`(${sqlList(OPEN_AGENT_STATUSES)})`;
/** Aberto e andando sozinho, esperar a transcricao incluida. */
export const IN_PROGRESS = sql`(${sqlList(IN_PROGRESS_AGENT_STATUSES)})`;
/** De onde a tabela de transicoes deixa chegar a `to`: a guarda de toda gravacao de status. */
export const before = (to: AgentTaskStatus) => sql`(${sqlList(agentStatusesBefore(to))})`;
/** Cancelar o que ainda nao comecou deixa `cancelled`; cancelar o que estava `running` deixa `interrupted`. */
export const stoppedStatus = (column: string) =>
  sql`CASE WHEN ${sql.raw(column)} = ${sqlList([STOPPABLE_RUNNING_STATUS])} THEN ${sqlList([STOPPED_FROM_RUNNING])} ELSE ${sqlList([STOPPED_BEFORE_RUNNING])} END`;
export const STOPPED_STATUS = stoppedStatus("status");
export const STOPPED_STATUS_OF_STEP = stoppedStatus("s.status");
/**
 * O fechamento do pedido grava a situacao junto com o status final (a politica de revisao esta em `agent-status`), menos
 * nas tarefas que nunca tem situacao: o passo, a execucao agendada e o conteudo guardado.
 */
export const ON_CLOSE_SITUATION = sql`CASE WHEN kind IN (${sqlList(KINDS_WITHOUT_SITUATION)}) THEN NULL ELSE ${REVIEW_SITUATION_ON_CLOSE} END`;
