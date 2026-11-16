"use client";

import {
  Bot,
  Brain,
  ChevronRight,
  CornerDownLeft,
  LoaderCircle,
  MessageSquare,
  MessageSquareText,
  Split,
  Wrench,
} from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";
import type { AgentChatTrace, AgentTraceView } from "@/lib/agent-chat/use-agent-chat";
import type { AgentTraceEntryDto, AgentTraceKind, AgentTraceStatus } from "@repo/contracts";
import styles from "./agent-trace.module.css";

const KIND_ICONS: Record<AgentTraceKind, typeof Bot> = {
  request: MessageSquare,
  routing: Split,
  thought: Brain,
  agent: Bot,
  tool: Wrench,
  message: MessageSquareText,
  answer: CornerDownLeft,
};

/** Os nomes dos tipos de entrada, os mesmos na aba "Processo" do chat e no detalhe da tarefa de agente. */
export const KIND_NAMES: Record<AgentTraceKind, string> = {
  request: "Pedido",
  routing: "Roteamento",
  thought: "Raciocínio",
  agent: "Agente",
  tool: "Ferramenta",
  message: "Comentário",
  answer: "Resposta",
};

const STATUS_TEXT: Record<AgentTraceStatus, string> = {
  pending: "aguardando",
  running: "em andamento",
  done: "concluído",
  failed: "falhou",
};

const ROUTE_NAMES: Record<AgentChatTrace["route"], string> = { steps: "Assistente", hermes: "Hermes" };

/** As raias da linha do tempo: a conversa (o que entrou e o que saiu), o modelo e as ferramentas. */
const LANES = ["talk", "model", "tool"] as const;
type Lane = (typeof LANES)[number];
const LANE_NAMES: Record<Lane, string> = { talk: "Conversa", model: "Modelo", tool: "Ferramentas" };
const KIND_LANES: Record<AgentTraceKind, Lane> = {
  request: "talk",
  answer: "talk",
  routing: "model",
  thought: "model",
  agent: "model",
  message: "model",
  tool: "tool",
};

/** "850 ms", "1,2 s" ou "1 min 05 s". */
export function traceDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function traceClock(instant: string): string {
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? instant : clock.format(date);
}

interface TimelineBar {
  entry: AgentTraceEntryDto;
  lane: Lane;
  /** Onde a barra comeca e quanto ocupa, em fracao do pedido inteiro. */
  left: number;
  width: number;
}

/**
 * Onde cada passo cai no tempo do pedido. Um passo sem inicio (ainda na fila) nao entra; um passo em curso
 * vai ate agora, que e ate onde o pedido ja andou.
 */
export function timelineBars(trace: AgentTraceView, now: number = Date.now()): { bars: TimelineBar[]; totalMs: number } {
  const origin = trace.startedAt ? new Date(trace.startedAt).getTime() : Number.NaN;
  if (Number.isNaN(origin)) return { bars: [], totalMs: 0 };
  const placed = trace.entries.flatMap((entry) => {
    const start = entry.startedAt ? new Date(entry.startedAt).getTime() - origin : Number.NaN;
    return Number.isNaN(start) ? [] : [{ entry, start: Math.max(0, start) }];
  });
  const known = Math.max(0, ...placed.map(({ entry, start }) => start + (entry.durationMs ?? 0)));
  const elapsed = trace.status === "running" ? now - origin : 0;
  const totalMs = Math.max(trace.durationMs ?? 0, known, elapsed);
  if (totalMs <= 0) return { bars: [], totalMs: 0 };
  return {
    totalMs,
    bars: placed.map(({ entry, start }) => {
      const length = entry.durationMs ?? (entry.status === "running" ? totalMs - start : 0);
      return { entry, lane: KIND_LANES[entry.kind], left: Math.min(1, start / totalMs), width: Math.min(1, length / totalMs) };
    }),
  };
}

interface AgentTraceProps {
  traces: readonly AgentChatTrace[];
}

/**
 * A aba "Processo" do chat: para cada pedido, a linha do tempo e a lista de tudo o que a IA fez — o que pensou,
 * que agentes e ferramentas usou, o que entrou e saiu de cada um e quanto levou. Ao vivo enquanto ela
 * trabalha e, depois, o registro. Todo texto vem do servidor e e mostrado como texto: nada vira HTML.
 */
export function AgentTrace({ traces }: AgentTraceProps) {
  // Um passo aberto por vez, no pedido em que ele esta.
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const lastRef = useRef<HTMLElement>(null);
  const count = traces.length;
  // Um pedido novo rola a aba ate o comeco dele: o cabecalho e a linha do tempo ficam a vista. So a aba rola
  // (ela e o proprio rolo), nunca a pagina por tras.
  useEffect(() => {
    void count;
    const root = rootRef.current;
    const last = lastRef.current;
    if (!root || !last) return;
    // O primeiro pedido fica no topo, com a folga da aba; os seguintes, no fio que os separa do anterior.
    root.scrollTop = count <= 1 ? 0 : root.scrollTop + last.getBoundingClientRect().top - root.getBoundingClientRect().top;
  }, [count]);

  if (traces.length === 0) {
    return (
      <section className={styles.trace} aria-label="Processo da IA">
        <p className={styles.empty}>
          O processo de cada pedido aparece aqui: o que a IA pensou, que agentes e ferramentas usou e quanto tempo levou.
        </p>
      </section>
    );
  }

  return (
    <section ref={rootRef} className={styles.trace} aria-label="Processo da IA">
      {traces.map((turn, index) => (
        <TraceTurn
          key={turn.id}
          ref={index === traces.length - 1 ? lastRef : undefined}
          turn={turn}
          openEntry={open?.startsWith(`${turn.id}:`) ? open.slice(turn.id.length + 1) : null}
          onToggle={(entryId) => setOpen((current) => (current === `${turn.id}:${entryId}` ? null : `${turn.id}:${entryId}`))}
        />
      ))}
    </section>
  );
}

interface TraceTurnProps {
  ref?: Ref<HTMLElement>;
  turn: AgentChatTrace;
  openEntry: string | null;
  onToggle: (entryId: string) => void;
}

function TraceTurn({ ref, turn, openEntry, onToggle }: TraceTurnProps) {
  const { trace } = turn;
  const status = turn.running ? "running" : trace?.status === "failed" ? "failed" : trace ? "done" : "failed";
  const stateText = turn.running ? "em andamento" : status === "failed" ? "não concluído" : "concluído";
  const entries = trace?.entries ?? [];
  return (
    <article ref={ref} className={styles.turn} data-status={status} aria-label={`Pedido: ${turn.request}`}>
      <header className={styles.turnHeader}>
        <p className={styles.eyebrow}>
          {ROUTE_NAMES[turn.route]} · {stateText}
        </p>
        <h3 className={styles.request}>{turn.request}</h3>
        {trace ? (
          <dl className={styles.totals}>
            {trace.durationMs !== undefined ? <Total label="Duração" value={traceDuration(trace.durationMs)} /> : null}
            <Total label="Passos" value={String(entries.length)} />
            {trace.fields.map((field) => <Total key={field.label} label={field.label} value={field.value} />)}
          </dl>
        ) : null}
      </header>
      {trace ? <TraceTimeline trace={trace} openEntry={openEntry} onToggle={onToggle} /> : null}
      {entries.length === 0 ? (
        <p className={styles.waiting} role="status">
          {turn.running ? (
            <>
              <LoaderCircle aria-hidden data-spin />
              Esperando o primeiro passo…
            </>
          ) : "Sem detalhes deste pedido."}
        </p>
      ) : (
        <ol className={styles.entries} aria-label="Passos do pedido">
          {entries.map((entry) => (
            <TraceEntry key={entry.id} entry={entry} open={openEntry === entry.id} onToggle={() => onToggle(entry.id)} />
          ))}
        </ol>
      )}
    </article>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface TraceTimelineProps {
  trace: AgentTraceView;
  openEntry: string | null;
  onToggle: (entryId: string) => void;
}

/**
 * A linha do tempo do pedido, uma raia por tipo de trabalho. As barras repetem os passos da lista (tocar numa
 * abre o passo), por isso ficam fora da ordem do teclado: quem navega por teclado usa a lista.
 */
function TraceTimeline({ trace, openEntry, onToggle }: TraceTimelineProps) {
  const { bars, totalMs } = timelineBars(trace);
  if (bars.length === 0) return null;
  const lanes = LANES.filter((lane) => bars.some((bar) => bar.lane === lane));
  return (
    <div className={styles.timeline} role="group" aria-label={`Linha do tempo do pedido, ${traceDuration(totalMs)}`}>
      {lanes.map((lane) => (
        <div key={lane} className={styles.lane} data-lane={lane}>
          <span className={styles.laneName}>{LANE_NAMES[lane]}</span>
          <div className={styles.laneTrack}>
            {bars.filter((bar) => bar.lane === lane).map(({ entry, left, width }) => (
              <button
                key={entry.id}
                type="button"
                tabIndex={-1}
                className={styles.bar}
                data-status={entry.status}
                aria-pressed={openEntry === entry.id}
                aria-label={`${entry.label}${entry.durationMs !== undefined ? `, ${traceDuration(entry.durationMs)}` : ""}`}
                title={entry.label}
                style={{ left: `${(left * 100).toFixed(2)}%`, width: `${(width * 100).toFixed(2)}%` }}
                onClick={() => onToggle(entry.id)}
              />
            ))}
          </div>
        </div>
      ))}
      <div className={styles.axis} aria-hidden>
        <span>0</span>
        <span>{traceDuration(totalMs)}</span>
      </div>
    </div>
  );
}

interface TraceEntryProps {
  entry: AgentTraceEntryDto;
  open: boolean;
  onToggle: () => void;
}

function TraceEntry({ entry, open, onToggle }: TraceEntryProps) {
  const Icon = KIND_ICONS[entry.kind];
  const panelId = `trace-${entry.id}`;
  const ref = useRef<HTMLLIElement>(null);
  // Aberto pela linha do tempo, o passo pode estar fora da vista.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);
  return (
    <li ref={ref} className={styles.entry} data-kind={entry.kind} data-status={entry.status} data-open={open}>
      <button type="button" className={styles.row} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className={styles.mark} aria-hidden>
          {entry.status === "running" ? <LoaderCircle data-spin /> : <Icon />}
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowLabel}>{entry.label}</span>
          {entry.summary ? <span className={styles.rowSummary}>{entry.summary}</span> : null}
        </span>
        {entry.durationMs !== undefined ? <span className={styles.rowDuration}>{traceDuration(entry.durationMs)}</span> : null}
        <span className={styles.srOnly}>{STATUS_TEXT[entry.status]}</span>
        <ChevronRight className={styles.chevron} aria-hidden />
      </button>
      {open ? <TraceDetail id={panelId} entry={entry} /> : null}
    </li>
  );
}

/** O detalhe de um passo: o resumo (campos e blocos de texto) ou o registro bruto que o servidor guardou. */
function TraceDetail({ id, entry }: { id: string; entry: AgentTraceEntryDto }) {
  const [view, setView] = useState<"summary" | "raw">("summary");
  return (
    <div id={id} className={styles.detail}>
      <fieldset className={styles.detailViews} aria-label="Vista do passo">
        <button type="button" aria-pressed={view === "summary"} onClick={() => setView("summary")}>Resumo</button>
        <button type="button" aria-pressed={view === "raw"} onClick={() => setView("raw")}>Bruto</button>
      </fieldset>
      {view === "summary" ? (
        <>
          <dl className={styles.fields}>
            <Field label="Tipo" value={KIND_NAMES[entry.kind]} />
            {entry.source ? <Field label="Origem" value={entry.source} mono /> : null}
            <Field label="Estado" value={STATUS_TEXT[entry.status]} />
            {entry.startedAt ? <Field label="Início" value={traceClock(entry.startedAt)} /> : null}
            {entry.durationMs !== undefined ? <Field label="Duração" value={traceDuration(entry.durationMs)} /> : null}
            {(entry.fields ?? []).map((field) => <Field key={field.label} label={field.label} value={field.value} />)}
          </dl>
          {(entry.sections ?? []).map((section) => (
            <section key={section.title} className={styles.section}>
              <h4>{section.title}</h4>
              {section.code ? <pre>{section.text}</pre> : <p>{section.text}</p>}
            </section>
          ))}
        </>
      ) : (
        <pre className={styles.raw}>{JSON.stringify(entry.raw ?? entry, null, 2)}</pre>
      )}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-mono={mono || undefined}>{value}</dd>
    </div>
  );
}
