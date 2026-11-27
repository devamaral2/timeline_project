"use client";

import type { AgentTaskStatus, TaskCardDto } from "@repo/contracts";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ProjectMark } from "@/components/projects/project-line";
import { AgentStatusIcon } from "@/components/tasks/agent-status-icon";
import { agentStatusNames } from "@/components/tasks/agent-status-names";
import { EXECUTION_PEEK, shownRowCount } from "@/lib/tasks/execution-runs";
import { useExecutionDrawerMode } from "@/lib/tasks/execution-drawer-mode";
import { useExecutionRuns } from "./use-execution-runs";
import styles from "./execution-drawer.module.css";

/** "1 tarefa de agente em andamento", "5 tarefas de agente em andamento". */
function runsLabel(total: number): string {
  return `${total} ${total === 1 ? "tarefa" : "tarefas"} de agente em andamento`;
}

/** Em que grupo de entrada a linha está: a primeira fica sempre; a 2ª e a 3ª somem na altura de uma linha; as demais só entram com tudo aberto. */
function tierOf(index: number): "first" | "peek" | "more" {
  if (index === 0) return "first";
  return index < EXECUTION_PEEK ? "peek" : "more";
}

/** Em que ordem as linhas que entram chegam, uma depois da outra: 1, 2 e 3 (a partir daí, todas na terceira). */
function stepOf(index: number): number {
  return index < EXECUTION_PEEK ? index : Math.min(index - EXECUTION_PEEK + 1, 3);
}

function RunRow({ card, index, userId, total, hidden }: { card: TaskCardDto; index: number; userId: string; total: number; hidden: boolean }) {
  const status = card.status as AgentTaskStatus;
  const lead = index === 0;
  return (
    <li
      className={styles.row}
      data-tier={tierOf(index)}
      data-step={index === 0 ? undefined : stepOf(index)}
      data-status={status}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
    >
      <Link href={`/${userId}/tarefas/${card.id}`} className={styles.link}>
        {lead ? (
          <span className={styles.up} aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg>
          </span>
        ) : null}
        <ProjectMark project={card.project} labelled />
        <span className={styles.title}>{card.name}</span>
        {lead && total > 1 ? <span className={styles.count}>+{total - 1}</span> : null}
        <span className={styles.status} data-status={status}>
          {/* O ícone já diz o nome por inteiro ("Agente, trabalhando"); o texto é só para quem enxerga. */}
          <span aria-hidden="true">{agentStatusNames[status]}</span>
          <AgentStatusIcon status={status} />
        </span>
      </Link>
    </li>
  );
}

/**
 * A gaveta de execução: o que os agentes estão fazendo agora, presa acima da barra de navegação nas três abas. Mostra as
 * execuções em andamento da mais recente para a mais antiga, em três alturas (uma linha, três linhas e todas). Tocar no
 * cabeçalho alterna entre três e todas, a seta dupla recolhe a uma linha e tocar na linha recolhida volta a três.
 * Sem execução em andamento ela não é desenhada. `active` diz se a tela atual tem a barra (as três abas); `covered`,
 * se o chat cobre a tela. A tela por baixo reserva no fim a altura atual da gaveta (o espaçador).
 */
export function ExecutionDrawer({ userId, active, covered = false }: { userId: string; active: boolean; covered?: boolean }) {
  const runs = useExecutionRuns(active);
  const { mode, grow, setMode } = useExecutionDrawerMode();
  if (!active || runs.length === 0) return null;

  const total = runs.length;
  const shown = shownRowCount(mode, total);
  const all = mode === "all";
  const one = mode === "one";
  const count = runsLabel(total);
  const extra = Math.max(total - EXECUTION_PEEK, 0);
  const host = { "--exec-rows": shown } as CSSProperties;

  return (
    <div className={styles.host} style={host} data-execution-host data-mode={mode} data-grow={grow ? "" : undefined}>
      <div className={styles.spacer} data-execution-spacer aria-hidden="true" />
      <div className={styles.dock} hidden={covered}>
        <section className={styles.bar} aria-label="Em andamento" data-execution-drawer data-mode={mode} data-grow={grow ? "" : undefined}>
          <div className={styles.headerWrap} aria-hidden={one || undefined} inert={one || undefined}>
            <h2 className={styles.heading}>
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={all}
                aria-label={`${count}. ${all ? "Mostrar só três" : "Mostrar todas"}`}
                onClick={() => setMode(all ? "three" : "all")}
              >
                <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
                Em andamento
                <span className={styles.total}>{total}</span>
                <span className={styles.rest}>{mode === "three" && extra > 0 ? `+${extra}` : ""}</span>
              </button>
            </h2>
            <button type="button" className={styles.collapse} aria-label="Mostrar só a tarefa mais recente" onClick={() => setMode("one")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 6 5 5 5-5M7 13l5 5 5-5" /></svg>
            </button>
          </div>
          <ul className={styles.list}>
            {runs.map((card, index) => (
              <RunRow
                key={card.id}
                card={card}
                index={index}
                userId={userId}
                total={total}
                hidden={index >= shown || (one && index === 0)}
              />
            ))}
          </ul>
          {one ? (
            <button type="button" className={styles.expand} aria-label={`${count}, a mais recente é “${runs[0].name}”. Mostrar três`} onClick={() => setMode("three")} />
          ) : null}
        </section>
      </div>
    </div>
  );
}
