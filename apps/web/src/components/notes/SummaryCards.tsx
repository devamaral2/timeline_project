"use client";

import { ArrowUpRight, ChevronDown, Clock } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ICON_STROKE_WIDTH } from "@/components/tasks/task-visuals";
import { internalAnchorOf } from "@/lib/notes/anchors";
import {
  SUMMARY_ROWS_SHOWN, SUMMARY_TEXT_FOLD, type SummaryCard, type SummaryDocument, type SummaryRow, type SummarySection,
} from "@/lib/notes/summary-cards";
import { youtubeVideoOf } from "@/lib/notes/youtube";
import { MarkdownView, YouTubePlayer } from "./MarkdownView";
import styles from "./summary-cards.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

function isRemote(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** Um link das fichas: o externo abre em outra aba; o de um trecho (`#t-125`) é tratado pela raiz. */
function CardLink({ href, className, label, children }: { href: string; className?: string; label?: string; children: ReactNode }) {
  return (
    <a href={href} className={className} aria-label={label} {...(isRemote(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

/** O rótulo de um grupo, igual ao das seções do detalhe: a legenda em mono, a contagem e o fio. */
function GroupLabel({ id, title, count }: { id: string; title: string; count?: number }) {
  return (
    <div className={styles.group}>
      <h2 id={id}>{title}</h2>
      {count !== undefined ? <span>{count}</span> : null}
    </div>
  );
}

/** O botão que estende e recolhe o que não coube: as linhas de uma lista ou o texto de um grupo. */
function Fold({ open, onToggle, more, less }: { open: boolean; onToggle: () => void; more: string; less: string }) {
  return (
    <button type="button" className={styles.fold} aria-expanded={open} onClick={onToggle}>
      <span>{open ? less : more}</span>
      <ChevronDown {...icon} />
    </button>
  );
}

function Score({ score }: { score: SummaryDocument["score"] }) {
  return (
    <ul className={styles.score} aria-label="Em números">
      {score.map((entry) => (
        <li key={entry.label}><b>{entry.value}</b><span>{entry.label}</span></li>
      ))}
    </ul>
  );
}

function Card({ card, lead, filled, heading: Heading }: { card: SummaryCard; lead: boolean; filled: boolean; heading: "h2" | "h3" }) {
  const open = card.actions.length === 0 ? card.sources.find((link) => link.href) : undefined;
  const foot = card.due || card.sources.length > 0 || card.actions.length > 0;
  return (
    <section className={styles.card} aria-label={card.title}>
      <div className={styles.main}>
        {card.kicker ? <p className={styles.kicker}>{card.kicker}</p> : null}
        {card.from ? (
          <div className={styles.from}>
            {card.from.initials ? <span className={styles.avatar} aria-hidden>{card.from.initials}</span> : null}
            <span className={styles.sender}>{card.from.name}</span>
            {card.from.detail ? <span className={styles.when}>{card.from.detail}</span> : null}
          </div>
        ) : null}
        <Heading className={styles.title} data-size={lead ? "lg" : undefined}>{card.title}</Heading>
        {card.body ? <MarkdownView source={card.body} className={styles.text} /> : null}
      </div>
      {foot ? (
        <div className={styles.foot}>
          <div className={styles.footFacts}>
            {card.due ? (
              <span className={styles.due} data-tone={card.due.tone}>
                <Clock {...icon} />
                <span><span className={styles.srOnly}>Prazo: </span>{card.due.text}</span>
              </span>
            ) : null}
            {card.sources.length > 0 ? (
              <ul className={styles.chips} aria-label="Fontes">
                {card.sources.map((link, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a mesma fonte pode vir duas vezes; a lista não muda de ordem.
                  <li key={index}>
                    {link.href ? <CardLink href={link.href} className={styles.chipLink}><span className={styles.chip}>{link.label}</span></CardLink> : <span className={styles.chip}>{link.label}</span>}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {card.actions.length > 0 ? (
            <div className={styles.actions}>
              {card.actions.map((action, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: as ações de uma ficha não mudam de ordem.
                <CardLink key={index} href={action.href} className={filled && index === 0 ? `${styles.button} ${styles.primary}` : styles.button}>
                  {action.label}
                </CardLink>
              ))}
            </div>
          ) : null}
          {open?.href ? (
            <CardLink href={open.href} className={styles.go} label={`Abrir a matéria: ${card.title}`}><ArrowUpRight {...icon} /></CardLink>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Row({ row }: { row: SummaryRow }) {
  const content = (
    <>
      {row.time ? <span className={styles.time}>{row.time}</span> : null}
      <span className={styles.rowText}>
        {row.title ? <b>{row.title}</b> : null}
        {row.text ? <span>{row.text}</span> : null}
      </span>
    </>
  );
  return <li>{row.href ? <CardLink href={row.href} className={styles.row}>{content}</CardLink> : <div className={styles.row}>{content}</div>}</li>;
}

/** Os trechos mais assistidos na linha do vídeo: cada intervalo no lugar e no tamanho que ele tem. */
function PeakTrack({ rows, durationSeconds }: { rows: readonly SummaryRow[]; durationSeconds: number }) {
  const ranges = rows.flatMap((row) => (row.range && row.time ? [{ ...row.range, time: row.time }] : []));
  return (
    <div className={styles.trackBox}>
      <div className={styles.track} role="img" aria-label={`Onde ficam no vídeo: ${ranges.map((range) => range.time).join(", ")}`}>
        {ranges.map((range) => {
          const left = Math.min(100, (range.start / durationSeconds) * 100);
          const width = Math.max(1.5, Math.min(100 - left, ((range.end - range.start) / durationSeconds) * 100));
          return <i key={range.time} style={{ left: `${left}%`, width: `${width}%` }} />;
        })}
      </div>
      <div className={styles.axis} aria-hidden>
        <span>00:00</span>
        <span>{Math.max(1, Math.ceil(durationSeconds / 60))} min</span>
      </div>
    </div>
  );
}

function Rows({ section, labelId, durationSeconds }: { section: Extract<SummarySection, { kind: "rows" }>; labelId: string; durationSeconds: number | null }) {
  const [all, setAll] = useState(false);
  const hidden = section.rows.length - SUMMARY_ROWS_SHOWN;
  const rows = all || hidden <= 0 ? section.rows : section.rows.slice(0, SUMMARY_ROWS_SHOWN);
  return (
    <section className={styles.block} aria-labelledby={labelId}>
      <GroupLabel id={labelId} title={section.title} count={section.rows.length} />
      <div className={styles.card}>
        {section.peaks && durationSeconds ? <PeakTrack rows={section.rows} durationSeconds={durationSeconds} /> : null}
        <ul className={styles.rows}>
          {rows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: as linhas de um texto lido não mudam de ordem.
            <Row key={index} row={row} />
          ))}
        </ul>
        {hidden > 0 ? <Fold open={all} onToggle={() => setAll((value) => !value)} more={`Mostrar todas (${section.rows.length})`} less="Mostrar menos" /> : null}
      </div>
    </section>
  );
}

function TextGroup({ section, labelId }: { section: Extract<SummarySection, { kind: "text" }>; labelId: string }) {
  const long = section.body.length > SUMMARY_TEXT_FOLD;
  const [all, setAll] = useState(false);
  return (
    <section className={styles.block} aria-labelledby={labelId}>
      <GroupLabel id={labelId} title={section.title} />
      <div className={styles.card}>
        <div className={styles.main} data-clipped={long && !all ? "true" : undefined}>
          <MarkdownView source={section.body} className={styles.text} />
        </div>
        {long ? <Fold open={all} onToggle={() => setAll((value) => !value)} more="Mostrar tudo" less="Mostrar menos" /> : null}
      </div>
    </section>
  );
}

/**
 * O texto de notícias, de resumo de e-mail e de transcrição em fichas: os números no topo, a abertura, e
 * cada grupo do markdown como fichas (um título por ficha), linhas (uma lista) ou texto. A transcrição
 * fica recolhida atrás de "Ler a transcrição"; um link para um trecho (`#t-125`) a abre e rola até ele.
 */
export function SummaryCards({ document }: { document: SummaryDocument }) {
  const root = useRef<HTMLElement>(null);
  const baseId = useId();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const hasTranscript = document.sections.some((section) => section.kind === "transcript");

  // O ouvinte é do próprio nó, como no leitor de markdown: os links já são focáveis e respondem ao teclado.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const followAnchor = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      const id = internalAnchorOf(link?.getAttribute("href"));
      if (!id) return;
      event.preventDefault();
      const target = node.querySelector(`[id="${id}"]`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (hasTranscript) {
        setTranscriptOpen(true);
        setPending(id);
      }
    };
    node.addEventListener("click", followAnchor);
    return () => node.removeEventListener("click", followAnchor);
  }, [hasTranscript]);

  // O trecho pedido com a transcrição fechada: ela abre e, desenhada, a tela rola até ele.
  useEffect(() => {
    if (!pending || !transcriptOpen) return;
    root.current?.querySelector(`[id="${pending}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPending(null);
  }, [pending, transcriptOpen]);

  const video = document.source ? youtubeVideoOf(document.source.href) : null;
  // Uma ação preenchida por tela: "Ler a transcrição" quando há transcrição; senão, a primeira ação da primeira ficha.
  let fillNext = !hasTranscript;
  let leadNext = true;

  return (
    <article ref={root} className={styles.cards} aria-label="Conteúdo da nota">
      {document.source && video ? (
        <div className={styles.player}><YouTubePlayer href={document.source.href} label={document.source.label} video={video} byline={document.source.byline} /></div>
      ) : null}
      {document.source && !video ? (
        <p className={styles.source}>
          Fonte: <CardLink href={document.source.href}>{document.source.label}</CardLink>
          {document.source.byline ? ` · ${document.source.byline}` : null}
        </p>
      ) : null}
      {document.score.length > 0 ? <Score score={document.score} /> : null}
      {document.lead ? <div className={styles.card}><div className={styles.main}><MarkdownView source={document.lead} className={styles.text} /></div></div> : null}

      {document.sections.map((section, index) => {
        const labelId = `${baseId}-g${index}`;
        // biome-ignore lint/suspicious/noArrayIndexKey: os grupos de um texto lido não mudam de ordem.
        if (section.kind === "rows") return <Rows key={index} section={section} labelId={labelId} durationSeconds={document.durationSeconds} />;
        // biome-ignore lint/suspicious/noArrayIndexKey: idem.
        if (section.kind === "text") return <TextGroup key={index} section={section} labelId={labelId} />;
        if (section.kind === "transcript") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: idem.
            <section key={index} className={styles.block} aria-labelledby={transcriptOpen ? labelId : undefined} aria-label={transcriptOpen ? undefined : section.title}>
              {transcriptOpen ? (
                <>
                  <GroupLabel id={labelId} title={section.title} />
                  <div className={styles.card}><div className={styles.main}><MarkdownView source={section.body} className={styles.text} /></div></div>
                </>
              ) : null}
              <button type="button" className={transcriptOpen ? styles.wide : `${styles.wide} ${styles.primary}`} aria-expanded={transcriptOpen} onClick={() => setTranscriptOpen((value) => !value)}>
                {transcriptOpen ? "Recolher a transcrição" : "Ler a transcrição"}
              </button>
            </section>
          );
        }
        const heading = section.title === null ? "h2" : "h3";
        const cards = section.cards.map((card, cardIndex) => {
          const filled = fillNext && card.actions.length > 0;
          if (filled) fillNext = false;
          const lead = leadNext && card.kicker !== null;
          leadNext = false;
          // biome-ignore lint/suspicious/noArrayIndexKey: as fichas de um texto lido não mudam de ordem.
          return <Card key={cardIndex} card={card} lead={lead} filled={filled} heading={heading} />;
        });
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: idem.
          <section key={index} className={styles.block} aria-labelledby={section.title === null ? undefined : labelId} aria-label={section.title === null ? "Fichas" : undefined}>
            {section.title === null ? null : <GroupLabel id={labelId} title={section.title} count={section.cards.length} />}
            {section.intro ? <MarkdownView source={section.intro} className={styles.intro} /> : null}
            {cards}
          </section>
        );
      })}
    </article>
  );
}
