"use client";

import { ArrowLeft, ChevronDown, ChevronRight, EllipsisVertical, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ICON_STROKE_WIDTH } from "@/components/tasks/task-visuals";
import page from "@/components/ui/page.module.css";
import { useChangeFlash } from "@/lib/motion/change-flash";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import styles from "./detail.module.css";

export const detailIcon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/**
 * O molde do registro aberto, numa coluna: `lead` é o resumo (voltar, data,
 * título, situação, fatos) e `children`, o conteúdo, que fecha com o campo do
 * Hermes. `type` pinta o tipo da tarefa. O shell esconde a barra inferior
 * (`data-detail`). `edit` é o
 * modo de edição: o pé da tela é o rodapé de Descartar e Salvar, não o campo do Hermes.
 */
export function DetailFrame({ type, edit = false, leadLabel, bodyLabel, lead, children }: { type?: string; edit?: boolean; leadLabel: string; bodyLabel: string; lead: ReactNode; children: ReactNode }) {
  return (
    <main id="conteudo" className={`${page.frame} ${styles.frame}`} data-detail data-edit={edit || undefined} data-type={type}>
      <section className={`${page.lead} ${styles.lead}`} aria-label={leadLabel}>{lead}</section>
      <section className={`${page.body} ${styles.body}`} aria-label={bodyLabel}>{children}</section>
    </main>
  );
}

/** O topo do registro: voltar, o título no centro (quando há) e o menu "Mais ações". */
export function DetailNav({ label, back, title, children }: { label: string; back: ReactNode; title?: string; children?: ReactNode }) {
  return (
    <nav className={styles.nav} data-titled={title ? true : undefined} aria-label={label}>
      {back}
      {title ? <span className={styles.navTitle}>{title}</span> : null}
      {children ? <div className={styles.navMenu}>{children}</div> : null}
    </nav>
  );
}

/** A legenda em mono (a data, "Atualizada hoje, 09:20") e o título serifado do registro. */
export function DetailHeading({ eyebrow, children, done = false }: { eyebrow?: ReactNode; children: ReactNode; done?: boolean }) {
  // O que o Hermes muda no registro se anuncia: o valor novo entra com um fio por baixo.
  const eyebrowRef = useChangeFlash<HTMLParagraphElement>();
  const titleRef = useChangeFlash<HTMLHeadingElement>();
  return (
    <div className={styles.heading}>
      {eyebrow ? <p ref={eyebrowRef} className={styles.eyebrow}>{eyebrow}</p> : null}
      <h1 ref={titleRef} className={styles.display} data-done={done || undefined}>{children}</h1>
    </div>
  );
}

/** Os fatos do registro (lembrete, tags, criada em): rótulo à esquerda, valor à direita. */
export function DetailFacts({ label, children }: { label: string; children: ReactNode }) {
  return <dl className={styles.facts} aria-label={label}>{children}</dl>;
}

export function DetailFact({ label, children }: { label: string; children: ReactNode }) {
  const valueRef = useChangeFlash<HTMLElement>();
  return <div className={styles.fact}><dt>{label}</dt><dd ref={valueRef}>{children}</dd></div>;
}

/** O horário na serifa: "09:00 — 10:30" e, na ponta, quanto dura. Sem `start`, só a observação. */
export function TimeRange({ start, end, minutes, note }: { start?: string | null; end?: string | null; minutes?: number | null; note?: string }) {
  if (!start) return note ? <p className={styles.timeNote}>{note}</p> : null;
  return (
    <div className={styles.timeRow}>
      <p><span>{start}</span>{end ? <><i aria-hidden>—</i><span>{end}</span></> : null}</p>
      {minutes && minutes > 0 ? (
        <p>
          {minutes >= 60 ? <><span>{Math.floor(minutes / 60)}</span><small>h</small></> : null}
          {minutes % 60 > 0 ? <><span>{minutes % 60}</span><small>min</small></> : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * De onde o registro vem (a tarefa ou a tarefa de uma nota): o quadrado com o
 * ícone, "Tarefa · hoje, 09:00 — 10:30" e o nome, com a seta. `live` marca o
 * tarefa em andamento com a borda e o ponto da marca.
 */
export function OriginLink({ href, icon, type, live = false, meta, title }: { href: string; icon: ReactNode; type?: string; live?: boolean; meta: string; title: string }) {
  return (
    <Link href={href} className={styles.originLink} data-type={type}>
      <span className={styles.originTile} data-live={live || undefined} aria-hidden>{icon}</span>
      <span className={styles.originText}><span>{meta}</span><span>{title}</span></span>
      <ChevronRight {...detailIcon} />
    </Link>
  );
}

/** Uma lista de vínculos sem o cabeçalho de grupo (a seção já diz o que são). */
export function LinkList({ children }: { children: ReactNode }) {
  return <ul className={styles.cardList}>{children}</ul>;
}

/** O contêiner de toda tela de detalhe. `type` pinta o tipo da tarefa (rotina, refeição, treino, sono). */
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

/** Voltar: com `children`, a seta e o nome do destino; só com `label`, a seta sozinha e o nome para o leitor de tela. */
export function BackLink({ href, label, children }: { href: string; label?: string; children?: ReactNode }) {
  return <Link href={href} className={styles.back} aria-label={label}><ArrowLeft {...detailIcon} />{children}</Link>;
}

export function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className={styles.back} onClick={onClick}><ArrowLeft {...detailIcon} />{children}</button>;
}

/** Fecha o que está aberto num toque fora ou no Esc. */
export function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onTask(event: Event) {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onTask);
    document.addEventListener("keydown", onTask);
    return () => {
      document.removeEventListener("pointerdown", onTask);
      document.removeEventListener("keydown", onTask);
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
        <EllipsisVertical {...detailIcon} />
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

/** A linha do tipo: ícone e nome na cor do tipo, com algo à direita (a situação da tarefa). */
export function KindRow({ icon, label, trailing }: { icon: ReactNode; label: string; trailing?: ReactNode }) {
  return <div className={styles.kindRow}><span className={styles.kind}>{icon}{label}</span>{trailing}</div>;
}

export function DetailTitle({ children, done = false }: { children: ReactNode; done?: boolean }) {
  return <h1 className={styles.title} data-done={done || undefined}>{children}</h1>;
}

export function TagPills({ tags, label }: { tags: readonly string[]; label: string }) {
  if (!tags.length) return null;
  return <ul className={styles.tags} aria-label={label}>{tags.map((tag) => <li key={tag} style={tagAccentStyle(tag)}>#{tag}</li>)}</ul>;
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
export function LinkRow({ kind, icon, title, sub, href }: { kind: "note" | "task"; icon: ReactNode; title: string; sub: string; href?: string }) {
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


/** Uma lista de linhas dentro de um cartão (relações, itens ligados). */
export function RowCard({ children }: { children: ReactNode }) {
  return <ul className={styles.card}>{children}</ul>;
}

export { styles as detailStyles };
