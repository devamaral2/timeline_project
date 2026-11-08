"use client";

import { ArrowLeft, Check, ChevronDown, ChevronRight, Ellipsis, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import { TaskStatusIcon } from "@/components/tasks/task-visuals";
import type { WorkItemStatus } from "@/lib/api/contracts";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { TASK_STATUS_ORDER, taskStatusLabels } from "@/lib/tasks/tasks-model";
import styles from "./detail.module.css";

export const detailIcon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** O contêiner de toda tela de detalhe. `type` pinta o tipo do evento (rotina, refeição, treino, sono). */
export function DetailScreen({ type, children }: { type?: string; children: ReactNode }) {
  return <div className={styles.screen} data-type={type}>{children}</div>;
}

/** Carregando e erro: a mesma frase curta nas três telas. */
export function DetailMessage({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return <p role={alert ? "alert" : "status"} className={styles.message}>{children}</p>;
}

/** A barra do topo: voltar à esquerda e, à direita, o que a tela oferece (o menu "···"). */
export function DetailTopBar({ label, back, children }: { label: string; back: ReactNode; children?: ReactNode }) {
  return <nav className={styles.topbar} aria-label={label}>{back}{children}</nav>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.back}><ArrowLeft {...detailIcon} />{children}</Link>;
}

export function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className={styles.back} onClick={onClick}><ArrowLeft {...detailIcon} />{children}</button>;
}

/** Fecha o que está aberto num toque fora ou no Esc. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onEvent(event: Event) {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onEvent);
    document.addEventListener("keydown", onEvent);
    return () => {
      document.removeEventListener("pointerdown", onEvent);
      document.removeEventListener("keydown", onEvent);
    };
  }, [open, ref, close]);
}

/** O "···" da barra: `children` recebe `close` para encerrar o menu antes de agir. */
export function DetailMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, ref, close);
  return (
    <div className={styles.anchor} ref={ref}>
      <button type="button" className={styles.iconButton} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Ellipsis {...detailIcon} />
      </button>
      {open ? <div role="menu" className={styles.menu}>{children(close)}</div> : null}
    </div>
  );
}

export function MenuItem({ icon, danger = false, disabled = false, title, onClick, children }: {
  icon: ReactNode; danger?: boolean; disabled?: boolean; title?: string; onClick: () => void; children: ReactNode;
}) {
  return (
    <button type="button" role="menuitem" data-danger={danger ? "true" : undefined} disabled={disabled} title={title} onClick={onClick}>
      {icon}{children}
    </button>
  );
}

export function DetailHead({ children }: { children: ReactNode }) {
  return <header className={styles.head}>{children}</header>;
}

/** A linha do tipo: ícone e nome na cor do tipo, com algo à direita (a situação do evento). */
export function KindRow({ icon, label, trailing }: { icon: ReactNode; label: string; trailing?: ReactNode }) {
  return <div className={styles.kindRow}><span className={styles.kind}>{icon}{label}</span>{trailing}</div>;
}

export function DetailTitle({ children, done = false }: { children: ReactNode; done?: boolean }) {
  return <h1 className={styles.title} data-done={done || undefined}>{children}</h1>;
}

export function TagPills({ tags, label }: { tags: readonly string[]; label: string }) {
  if (!tags.length) return null;
  return <ul className={styles.tags} aria-label={label}>{tags.map((tag) => <li key={tag} style={tagColorStyle(tag)}>#{tag}</li>)}</ul>;
}

export function Stamp({ children }: { children: ReactNode }) {
  return <p className={styles.stamp}>{children}</p>;
}

export function Rule() {
  return <hr className={styles.rule} />;
}

/** As linhas de informação (quando, onde, lembretes): ícone e, ao lado, uma ou duas linhas. */
export function MetaList({ label, tight = false, children }: { label: string; tight?: boolean; children: ReactNode }) {
  return <ul className={`${styles.meta} ${tight ? styles.tight : ""}`} aria-label={label}>{children}</ul>;
}

export function MetaRow({ icon, main, sub, live = false }: { icon: ReactNode; main: ReactNode; sub?: ReactNode; live?: boolean }) {
  return (
    <li className={styles.metaRow}>
      {icon}
      <div><span className={styles.metaMain} data-live={live || undefined}>{main}</span>{sub ? <span className={styles.metaSub}>{sub}</span> : null}</div>
    </li>
  );
}

export function Reminders({ labels }: { labels: readonly string[] }) {
  return <ul className={styles.reminders} aria-label="Lembretes">{labels.map((label) => <li key={label}>{label}</li>)}</ul>;
}

export function DateLines({ children }: { children: ReactNode }) {
  return <div className={styles.dateLines}>{children}</div>;
}

/** Texto corrido com "Ler mais" quando passa de três linhas. */
export function Prose({ children, clamp = false }: { children: string; clamp?: boolean }) {
  const [open, setOpen] = useState(false);
  const long = clamp && (children.length > 180 || children.split("\n").length > 3);
  return (
    <div className={styles.descriptionBlock}>
      <p className={styles.prose} data-clamped={long && !open}>{children}</p>
      {long ? <button type="button" className={styles.readMore} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Ler menos" : "Ler mais"}</button> : null}
    </div>
  );
}

export function DetailSection({ title, count, labelId, children, className }: {
  title: string; count?: ReactNode; labelId: string; children: ReactNode; className?: "links";
}) {
  return (
    <section className={`${styles.section} ${className ? styles[className] : ""}`} aria-labelledby={labelId}>
      <div className={styles.sectionHead}><h2 className={styles.label} id={labelId}>{title}</h2>{count !== undefined ? <span className={styles.count}>{count}</span> : null}</div>
      {children}
    </section>
  );
}

/** "Vínculos": cada tipo de vínculo num grupo com a contagem ao lado do título. */
export function LinkGroup({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  return (
    <fieldset className={styles.linkGroup} aria-labelledby={id}>
      <h3 className={styles.linkGroupHead} id={id}>{title}<span className={styles.count}>{count}</span></h3>
      <ul className={styles.cardList}>{children}</ul>
    </fieldset>
  );
}

/** Uma linha de vínculo: ícone do tipo, título, detalhe e a seta; sem `href` fica só como leitura. */
export function LinkRow({ kind, icon, title, sub, href }: { kind: "note" | "event" | "task"; icon: ReactNode; title: string; sub: string; href?: string }) {
  const content = (
    <>
      {icon}
      <span className={styles.linkText}><span className={styles.linkTitle}>{title}</span><span className={styles.linkSub}>{sub}</span></span>
      {href ? <ChevronRight {...detailIcon} /> : <span />}
    </>
  );
  return (
    <li>
      {href ? <Link href={href} className={styles.linkRow} data-kind={kind}>{content}</Link> : <span className={styles.linkRow} data-kind={kind} data-readonly="true">{content}</span>}
    </li>
  );
}

/** Uma linha de aviso dentro de um grupo de vínculos (carregando, falha). */
export function LinkMessage({ children }: { children: ReactNode }) {
  return <li><p className={styles.message}>{children}</p></li>;
}

/** Uma linha de tarefa vinculada: o círculo de status troca o status; o resto abre a tarefa. */
export function TaskLinkRow({ name, status, sub, href, busy = false, onStatusChange }: {
  name: string; status: WorkItemStatus; sub: string; href: string; busy?: boolean; onStatusChange: (status: WorkItemStatus) => void;
}) {
  return (
    <li className={styles.taskRow}>
      <TaskStatusPicker status={status} name={name} busy={busy} onChange={onStatusChange} />
      <Link href={href} className={styles.linkMain}>
        <span className={styles.linkText}><span className={styles.linkTitle}>{name}</span><span className={styles.linkSub}>{sub}</span></span>
        <ChevronRight {...detailIcon} />
      </Link>
    </li>
  );
}

/** O círculo de status de uma tarefa e a lista dos seis status que ele abre. */
export function TaskStatusPicker({ status, name, busy, onChange }: { status: WorkItemStatus; name: string; busy: boolean; onChange: (status: WorkItemStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  return (
    <div className={styles.anchor} ref={ref}>
      <button
        type="button"
        className={styles.statusMini}
        data-status={status}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${taskStatusLabels[status]}. Trocar status de ${name}`}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <TaskStatusIcon status={status} size={20} />
      </button>
      {open ? (
        <div role="listbox" aria-label="Status da tarefa" className={`${styles.menu} ${styles.statusMenu}`}>
          {TASK_STATUS_ORDER.map((option) => (
            <button key={option} type="button" role="option" aria-selected={option === status} onClick={() => { setOpen(false); if (option !== status) onChange(option); }}>
              <TaskStatusIcon status={option} />
              {taskStatusLabels[option]}
              {option === status ? <Check className={styles.selectedMark} {...detailIcon} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** O status grande do cabeçalho da tarefa (mesmo seletor, com o nome do status ao lado). */
export function TaskStatusButton({ status, busy, onChange }: { status: WorkItemStatus; busy: boolean; onChange: (status: WorkItemStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  return (
    <div className={styles.anchor} ref={ref}>
      <button
        type="button"
        className={styles.statusButton}
        data-status={status}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${taskStatusLabels[status]}. Trocar status`}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <TaskStatusIcon status={status} />
        <span>{taskStatusLabels[status]}</span>
        <ChevronDown className={styles.caret} {...detailIcon} />
      </button>
      {open ? (
        <div role="listbox" aria-label="Status da tarefa" className={`${styles.menu} ${styles.statusMenuBig}`}>
          {TASK_STATUS_ORDER.map((option) => (
            <button key={option} type="button" role="option" aria-selected={option === status} data-status={option} onClick={() => { setOpen(false); if (option !== status) onChange(option); }}>
              <TaskStatusIcon status={option} />
              {taskStatusLabels[option]}
              {option === status ? <Check className={styles.selectedMark} {...detailIcon} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StatusRow({ children }: { children: ReactNode }) {
  return <div className={styles.statusRow}>{children}</div>;
}

/** Um passo do que o Hermes fez: o texto, a ferramenta (opcional) e quanto demorou. */
export interface DetailOriginStep {
  id: string;
  label: string;
  tool?: string;
  seconds?: number;
}

/**
 * De onde a entidade veio. Só aparece quando quem a criou deixou rastro (hoje,
 * nenhuma entidade traz esse dado: a tela passa `undefined` e o bloco some).
 */
export interface DetailOriginData {
  title: string;
  subtitle: string;
  quote?: string;
  steps: DetailOriginStep[];
  idempotencyKey?: string;
}

const secondsFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function DetailOrigin({ origin, id }: { origin?: DetailOriginData; id: string }) {
  const [open, setOpen] = useState(false);
  if (!origin) return null;
  const bodyId = `${id}-origin-body`;
  return (
    <section className={styles.origin} aria-label="Origem">
      <button type="button" className={styles.originHead} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
        <span className={styles.originIcon}><Sparkles {...detailIcon} /></span>
        <span><span className={styles.originTitle}>{origin.title}</span><span className={styles.originSub}>{origin.subtitle}</span></span>
        <span className={styles.originChevron}><ChevronDown {...detailIcon} /></span>
      </button>
      <div className={styles.originBody} id={bodyId} hidden={!open}>
        {origin.quote ? <p className={styles.quote}>“{origin.quote}”</p> : null}
        <ol className={styles.steps} aria-label="Passos do Hermes">
          {origin.steps.map((step) => (
            <li key={step.id} className={styles.step}>
              {step.tool ? <Wrench {...detailIcon} /> : <Sparkles {...detailIcon} />}
              <span><span className={styles.stepLabel}>{step.label}</span>{step.tool ? <span className={styles.stepTool}>{step.tool}</span> : null}</span>
              {step.seconds !== undefined ? <span className={styles.stepTime}>{secondsFormat.format(step.seconds)} s<span className={styles.srOnly}> · concluído</span></span> : null}
            </li>
          ))}
        </ol>
        {origin.idempotencyKey ? <p className={styles.originKey}>Chave de idempotência · <code>{origin.idempotencyKey}</code></p> : null}
      </div>
    </section>
  );
}


/** Uma lista de linhas dentro de um cartão (depende de, subtarefas, libera). */
export function RowCard({ children }: { children: ReactNode }) {
  return <ul className={styles.card}>{children}</ul>;
}

/** Uma tarefa que se relaciona com esta: o círculo mostra o status e a linha abre a tarefa. */
export function RelationRow({ href, name, status, meta }: { href: string; name: string; status: WorkItemStatus; meta: string }) {
  return (
    <li>
      <Link href={href} className={styles.relation}>
        <span className={styles.relationIcon} role="img" aria-label={taskStatusLabels[status]}><TaskStatusIcon status={status} size={20} /></span>
        <span className={styles.relationText}><span className={styles.relationName}>{name}</span><span className={styles.relationMeta}>{meta}</span></span>
        <ChevronRight {...detailIcon} />
      </Link>
    </li>
  );
}

export { styles as detailStyles };
