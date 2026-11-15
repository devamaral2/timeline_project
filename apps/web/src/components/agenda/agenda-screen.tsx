"use client";

import {
  dayKeyRange, dayNumber, isSameMonth, longDate, monthGridOf,
  monthLabel, shiftDayKey, shiftMonthKey, weekOf, weekday, zonedDayEnd, zonedDayStart,
} from "@repo/timeline";
import type { EventCardDto, HumanEventStatus } from "@repo/contracts";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WeekStrip } from "@/components/events/WeekStrip";
import { requestHubOpen } from "@/components/hub/hub-events";
import page from "@/components/ui/page.module.css";
import { ApiRequestError } from "@/lib/api/client-request";
import { listAgenda, updateEvent } from "@/lib/api/events";
import { hasOpenAgentEvent } from "@/lib/events/agent-request-model";
import { statusPatch } from "@/lib/events/event-read-model";
import { useOpenAgentRefresh } from "@/lib/events/use-open-agent-refresh";
import { slideIn } from "@/lib/motion/enter";
import { reflow } from "@/lib/motion/view-transition";
import { briefDate } from "@/lib/dates/day-labels";
import { useNow } from "@/lib/events/use-now";
import { useViewMode } from "@/lib/events/view-mode";
import { usePublishSectionMenu } from "@/lib/navigation/section-menu";
import { useSessionState } from "@/lib/session/use-session";
import { AgendaDay } from "./agenda-day";
import { AgendaStatusPicker } from "./agenda-status-picker";
import { AgendaOptions, type AgendaViewMode } from "./agenda-options";
import { agendaEventsByDay } from "./agenda-data";
import { EXAMPLE_NOW, EXAMPLE_TODAY, type ExampleEvent, type ExampleTask, exampleEventsOn } from "./agenda-examples";
import { agendaRefreshEvent } from "./agenda-refresh";
import { type AgendaScrollBoundary, agendaScrollBoundaryFromAttempt } from "./agenda-scroll-boundary";
import { EventTaskDialog, type SelectedEvent } from "./task-controls";
import styles from "./agenda.module.css";

type ViewMode = AgendaViewMode;

/** Onde a escolha "mostrar o tempo livre" fica guardada, por navegador. */
const FREE_TIME_STORAGE_KEY = "braid-agenda-free-time";

/** Aviso quando a troca de status de um evento de referência não é gravada. A revisão velha recarrega a agenda. */
const STALE_STATUS_MESSAGE = "Este evento mudou em outro lugar. Carregamos a versão atual; confira e tente de novo.";
const FAILED_STATUS_MESSAGE = "Não foi possível trocar o status. Tente novamente.";

/** Quanto a linha recém-chegada fica marcada, o tempo do banho escorrer. */
const FRESH_MS = 2000;

/** Dias carregados a cada vez que a rolagem infinita chega a uma borda. */
const INFINITE_STEP_DAYS = 7;
/** Teto de dias para cada lado, para a lista não crescer sem fim. */
const INFINITE_MAX_DAYS = 364;

/** "Setembro" no ano corrente; "Setembro de 2027" quando se navega para outro ano. */
function monthName(dayKey: string, todayKey: string) {
  return dayKey.slice(0, 4) === todayKey.slice(0, 4) ? monthLabel(dayKey).replace(/ de \d{4}$/, "") : monthLabel(dayKey);
}

/** "5 eventos · 3 h 50 planejadas": quanto do dia já tem dono. */
export function daySummary(events: readonly ExampleEvent[]) {
  if (events.length === 0) return "Nenhum evento";
  const count = `${events.length} ${events.length === 1 ? "evento" : "eventos"}`;
  const minutes = events.reduce((total, event) => total + event.minutes, 0);
  if (minutes === 0) return count;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${count} · ${rest} min planejados`;
  if (rest === 0) return `${count} · ${hours} h ${hours === 1 ? "planejada" : "planejadas"}`;
  return `${count} · ${hours} h ${String(rest).padStart(2, "0")} planejadas`;
}

/** Minúsculas e sem acento, para a busca do menu achar "cafe" em "Café". */
function plain(text: string) {
  return text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function AgendaScreen({ userId, todayKey = EXAMPLE_TODAY }: { userId?: string; todayKey?: string }) {
  const { user, ready } = useSessionState();
  const realNow = useNow();
  const [clockStartedAt] = useState(Date.now);
  // A prévia usa a data ilustrativa; os segundos avançam com o relógio compartilhado.
  const now = userId
    ? (realNow?.getTime() ?? Date.now())
    : EXAMPLE_NOW + (realNow ? Math.max(0, realNow.getTime() - clockStartedAt) : 0);
  const [tasks, setTasks] = useState<Record<string, ExampleTask>>({});
  const [missedEvents, setMissedEvents] = useState<Record<string, boolean>>({});
  const [eventsByDay, setEventsByDay] = useState<Record<string, ExampleEvent[]>>({});
  const [loadState, setLoadState] = useState<"idle" | "loading" | "failed">("idle");
  const [refreshVersion, setRefreshVersion] = useState(0);
  // O modo em uso filtra a agenda pelo executor; trocá-lo relê a janela.
  const viewMode = useViewMode();
  // Com evento de agente em aberto na janela, a agenda se relê sozinha. A releitura é silenciosa: troca os dados
  // sem voltar ao estado de carregando, para a tela não piscar nem perder a rolagem.
  const silentReload = useRef(false);
  const agentOpen = hasOpenAgentEvent(Object.values(eventsByDay).flat().flatMap((event) => (event.card ? [event.card] : [])));
  useOpenAgentRefresh(Boolean(userId && user && ready && agentOpen), () => {
    silentReload.current = true;
    setRefreshVersion((version) => version + 1);
  });
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  // O evento de referência cujo ponto azul foi tocado, e o aviso da última troca que falhou.
  const [statusCard, setStatusCard] = useState<EventCardDto | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("day");
  const [showFreeTime, setShowFreeTime] = useState(true);
  // A busca do menu da barra inferior: filtra pelo nome os eventos já carregados (a rota da agenda não tem texto).
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [navigation, setNavigation] = useState({ dayKey: todayKey });
  const [dayRange, setDayRange] = useState({ before: 0, after: 0 });
  const [monthOpen, setMonthOpen] = useState(false);
  const [browsingMonth, setBrowsingMonth] = useState(EXAMPLE_TODAY);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  // O que já está na tela, para a recarga saber o que é novo; e o último dia
  // escolhido, para o seguinte entrar pelo lado certo.
  const eventsRef = useRef(eventsByDay);
  eventsRef.current = eventsByDay;
  const shownDay = useRef(todayKey);
  const controlsRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef<HTMLElement>(null);
  const touchY = useRef<number | null>(null);
  const scrollFrame = useRef(0);
  const lastExtendAt = useRef(0);
  const pageDays = mode === "day"
    ? weekOf(navigation.dayKey)
    : dayKeyRange(shiftDayKey(navigation.dayKey, -dayRange.before), dayRange.before + dayRange.after + 1);
  const rangeStart = pageDays[0] ?? todayKey;
  const rangeEnd = pageDays[pageDays.length - 1] ?? todayKey;

  // A chave do tempo livre é uma preferência do navegador; lê-se depois de montar.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(FREE_TIME_STORAGE_KEY) === "off") setShowFreeTime(false);
    } catch {}
  }, []);

  /** Só evento de referência (sem status) abre a escolha; o de pessoa com status segue sem ação aqui. */
  function openStatusPicker(card: EventCardDto) {
    if (card.status === undefined) setStatusCard(card);
  }

  /** Grava o status com a revisão que a agenda leu. Revisão velha avisa e recarrega; o recarregamento traz a linha nova. */
  async function changeReferenceStatus(card: EventCardDto, status: HumanEventStatus) {
    setStatusCard(null);
    setStatusNote(null);
    try {
      await updateEvent(card.id, statusPatch(card, status, new Date()));
      window.dispatchEvent(new Event(agendaRefreshEvent));
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
        window.dispatchEvent(new Event(agendaRefreshEvent));
        setStatusNote(STALE_STATUS_MESSAGE);
      } else {
        setStatusNote(FAILED_STATUS_MESSAGE);
      }
    }
  }

  function changeShowFreeTime(show: boolean) {
    // As linhas de tempo livre somem ou voltam e as outras deslizam para o lugar.
    reflow(daysRef.current, () => setShowFreeTime(show));
    try {
      window.localStorage.setItem(FREE_TIME_STORAGE_KEY, show ? "on" : "off");
    } catch {}
  }

  useEffect(() => {
    function refresh() {
      setRefreshVersion((version) => version + 1);
    }
    window.addEventListener(agendaRefreshEvent, refresh);
    return () => window.removeEventListener(agendaRefreshEvent, refresh);
  }, []);

  useEffect(() => {
    void refreshVersion;
    if (!userId || !user || !ready) return;
    let cancelled = false;
    // A releitura do evento de agente não mostra o carregando; uma falha nela mantém a agenda que já está na tela.
    const silent = silentReload.current;
    silentReload.current = false;
    if (!silent) setLoadState("loading");

    async function loadEvents() {
      try {
        const from = zonedDayStart(rangeStart).toISOString();
        const to = zonedDayEnd(rangeEnd).toISOString();
        const loaded = await listAgenda({ from, to, actor: viewMode.actor });

        if (cancelled) return;
        // Um evento que veio da noite anterior tambem tem chave fora da janela; esse dia
        // so e completo quando a propria janela dele carrega.
        // Todo dia da janela ganha a sua chave, mesmo vazio: é ela que diz que o dia já chegou.
        const byDay = agendaEventsByDay(loaded);
        const next: Record<string, ExampleEvent[]> = {};
        for (let dayKey = rangeStart; dayKey <= rangeEnd; dayKey = shiftDayKey(dayKey, 1)) next[dayKey] = byDay[dayKey] ?? [];
        // Numa recarga, o evento que não estava no dia é novo (o Hermes acabou de criar).
        const known = eventsRef.current;
        const fresh = Object.entries(next).flatMap(([dayKey, events]) => {
          const before = known[dayKey];
          if (!before) return [];
          const ids = new Set(before.map((event) => event.id));
          return events.flatMap((event) => event.id && !ids.has(event.id) ? [event.id] : []);
        });
        const apply = () => {
          setEventsByDay(current => ({ ...current, ...next }));
          setLoadState("idle");
          if (fresh.length > 0) setFreshIds(new Set(fresh));
        };
        if (fresh.length > 0) reflow(daysRef.current, apply);
        else apply();
      } catch {
        if (!cancelled && !silent) setLoadState("failed");
      }
    }

    void loadEvents();
    return () => { cancelled = true; };
  }, [rangeEnd, rangeStart, ready, refreshVersion, user, userId, viewMode.actor]);

  useEffect(() => {
    if (freshIds.size === 0) return;
    const timer = window.setTimeout(() => setFreshIds(new Set()), FRESH_MS);
    return () => window.clearTimeout(timer);
  }, [freshIds]);

  function selectDay(dayKey: string) {
    setSelectedDay(dayKey);
    setNavigation({ dayKey });
    setDayRange({ before: 0, after: mode === "list" ? INFINITE_STEP_DAYS : 0 });
    setMonthOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function changeMode(nextMode: ViewMode) {
    setMode(nextMode);
    selectDay(selectedDay);
    setDayRange({ before: 0, after: nextMode === "list" ? INFINITE_STEP_DAYS : 0 });
  }

  // Enquanto a sessão carrega o carrossel não existe; ao aparecer, ele precisa abrir no dia selecionado.
  const stripMounted = !userId || (ready && Boolean(user));

  // Só escolhas explícitas reposicionam o carrossel; um swipe apenas atualiza a seleção.
  useLayoutEffect(() => {
    void stripMounted;
    const strip = daysRef.current;
    if (mode !== "day" || !strip) return;
    strip.scrollLeft = weekOf(navigation.dayKey).indexOf(navigation.dayKey) * strip.clientWidth;
    // O dia escolhido entra no sentido do tempo: o seguinte pela direita, o anterior pela esquerda.
    const previous = shownDay.current;
    shownDay.current = navigation.dayKey;
    if (previous !== navigation.dayKey) slideIn(strip.querySelector(`[data-agenda-day="${navigation.dayKey}"]`), navigation.dayKey > previous ? 1 : -1);
  }, [mode, navigation, stripMounted]);

  // No modo por dia, o carrossel tem a altura do dia visível, não a do dia mais longo da semana.
  useEffect(() => {
    const strip = daysRef.current;
    if (mode !== "day" || !strip) return;
    const current = strip.querySelector<HTMLElement>(`[data-agenda-day="${selectedDay}"]`);
    if (!current) return;
    const fit = () => { strip.style.height = `${current.offsetHeight}px`; };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(current);
    return () => { observer?.disconnect(); strip.style.height = ""; };
  }, [mode, selectedDay, eventsByDay, loadState]);

  // No modo lista infinita, chegar à borda traz mais dias.
  useEffect(() => {
    if (mode !== "list") return;

    function extend(boundary: AgendaScrollBoundary) {
      const now = Date.now();
      if (loadState === "loading" || now - lastExtendAt.current < 400) return;
      lastExtendAt.current = now;
      setDayRange(({ before, after }) => boundary === "previous"
        ? { before: Math.min(before + INFINITE_STEP_DAYS, INFINITE_MAX_DAYS), after }
        : { before, after: Math.min(after + INFINITE_STEP_DAYS, INFINITE_MAX_DAYS) });
    }

    function revealBoundary(deltaY: number) {
      const boundary = agendaScrollBoundaryFromAttempt({
        deltaY,
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
      });
      if (boundary) extend(boundary);
    }

    let lastScrollY = window.scrollY;
    function onScroll() {
      const { scrollY, innerHeight } = window;
      const goingUp = scrollY < lastScrollY;
      lastScrollY = scrollY;
      if (goingUp && scrollY < 240) extend("previous");
      else if (!goingUp && scrollY + innerHeight >= document.documentElement.scrollHeight - 600) extend("next");
    }

    function onWheel(event: WheelEvent) {
      revealBoundary(event.deltaY);
    }

    function onTouchStart(event: TouchEvent) {
      touchY.current = event.touches[0]?.clientY ?? null;
    }

    function onTouchMove(event: TouchEvent) {
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined || touchY.current === null) return;
      revealBoundary(touchY.current - currentY);
      touchY.current = currentY;
    }

    function onTouchEnd() {
      touchY.current = null;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [loadState, mode]);

  // O mês acompanha o dia que está sendo lido na lista contínua.
  useEffect(() => {
    if (mode !== "list") return;
    function syncVisibleDay() {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = requestAnimationFrame(() => {
        // Com duas colunas o calendário fica ao lado da lista, não por cima dela.
        const controls = controlsRef.current?.getBoundingClientRect();
        const list = daysRef.current?.getBoundingClientRect();
        const stacked = controls && list ? controls.right > list.left : false;
        const top = (stacked ? controls?.bottom ?? 0 : 0) + 12;
        const sections = daysRef.current?.querySelectorAll<HTMLElement>("[data-agenda-day]");
        const current = Array.from(sections ?? []).find((section) => section.getBoundingClientRect().bottom > top);
        if (current?.dataset.agendaDay) setSelectedDay(current.dataset.agendaDay);
      });
    }
    window.addEventListener("scroll", syncVisibleDay, { passive: true });
    return () => {
      window.removeEventListener("scroll", syncVisibleDay);
      cancelAnimationFrame(scrollFrame.current);
    };
  }, [mode]);

  // O menu da barra inferior (tocar na aba Agenda já selecionada): a busca e, na engrenagem, o que antes
  // ficava no botão de opções do celular.
  usePublishSectionMenu("agenda", {
    lists: [],
    search: { label: "Buscar na agenda", value: search, onChange: setSearch },
    settings: [
      { kind: "segment", label: "Visualização", options: [
        { label: "Por dia", selected: mode === "day", onPick: () => changeMode("day") },
        { label: "Em sequência", selected: mode === "list", onPick: () => changeMode("list") },
      ] },
      { kind: "switch", label: "Tempo livre", hint: "Janelas de 15 min ou mais entre os eventos", on: showFreeTime, onToggle: () => changeShowFreeTime(!showFreeTime) },
    ],
    filtered: search.trim() !== "",
    onClear: () => setSearch(""),
  });
  const needle = plain(search.trim());
  const matching = (events: ExampleEvent[]) => (needle ? events.filter((event) => plain(event.name).includes(needle)) : events);

  if (userId && !ready) {
    return <main id="conteudo" className={page.frame}><p role="status" className={styles.status}>Carregando sua sessão…</p></main>;
  }
  if (userId && ready && !user) {
    return <main id="conteudo" className={page.frame}><p className={styles.status}>Entre na sua conta para ver sua agenda.</p></main>;
  }

  const dayEvents = userId ? eventsByDay[selectedDay] ?? [] : exampleEventsOn(selectedDay);
  const options = { mode, onModeChange: changeMode, showFreeTime, onShowFreeTimeChange: changeShowFreeTime };

  return (
    <main id="conteudo" className={page.frame}>
      <section className={`${page.lead} ${styles.lead}`} aria-label="O dia em foco">
        <div className={styles.dateRow}>
          <h1 className={page.eyebrow}>{longDate(todayKey)}</h1>
        </div>

        <div className={styles.calendar} ref={controlsRef}>
          {monthOpen ? (
            <section id="agenda-month-picker" className={styles.monthCard} aria-label="Escolher dia do mês">
              <div className={styles.monthHead}>
                <button type="button" className={styles.monthToggle} aria-expanded aria-controls="agenda-month-picker" onClick={() => setMonthOpen(false)}>
                  {monthLabel(browsingMonth).replace(" de ", " ")}<ChevronDown aria-hidden />
                </button>
                <div className={styles.monthNav}>
                  <button type="button" aria-label="Mês anterior" onClick={() => setBrowsingMonth((month) => shiftMonthKey(month, -1))}><ChevronLeft aria-hidden /></button>
                  <button type="button" aria-label="Próximo mês" onClick={() => setBrowsingMonth((month) => shiftMonthKey(month, 1))}><ChevronRight aria-hidden /></button>
                </div>
              </div>
              <div className={styles.monthWeekdays} aria-hidden>
                {weekOf(browsingMonth).map((dayKey) => <span key={dayKey}>{weekday(dayKey).slice(0, 3)}</span>)}
              </div>
              <ul className={styles.monthGrid}>
                {monthGridOf(browsingMonth).map((dayKey) => (
                  <li key={dayKey}>
                    <button type="button" aria-label={dayKey === todayKey ? `${longDate(dayKey)}, hoje` : longDate(dayKey)} aria-pressed={dayKey === selectedDay} aria-current={dayKey === todayKey ? "date" : undefined} data-outside={!isSameMonth(dayKey, browsingMonth)} onClick={() => selectDay(dayKey)}>{dayNumber(dayKey)}</button>
                  </li>
                ))}
              </ul>
              <div className={styles.monthFoot}>
                <button type="button" className={styles.todayPill} onClick={() => selectDay(todayKey)}>Hoje</button>
                <p>{briefDate(todayKey)}</p>
              </div>
            </section>
          ) : (
            <>
              <button
                type="button" className={styles.monthToggle} aria-expanded={false} aria-controls="agenda-month-picker"
                onClick={() => { setBrowsingMonth(selectedDay); setMonthOpen(true); }}
              >{monthName(selectedDay, todayKey)}<ChevronDown aria-hidden /></button>
              {mode === "day" ? <WeekStrip selectedDayKey={selectedDay} todayKey={todayKey} onSelect={selectDay} /> : null}
            </>
          )}
        </div>
      </section>

      <section className={page.body} aria-label={`Eventos de ${mode === "day" ? weekday(selectedDay).toLowerCase() : "todos os dias"}`}>
        <div className={styles.toolbar}>
          <div className={styles.viewControls}>
            <button type="button" className={styles.modePill} aria-pressed={mode === "day"} onClick={() => changeMode("day")}>Por dia</button>
            <button type="button" className={styles.modePill} aria-pressed={mode === "list"} onClick={() => changeMode("list")}>Em sequência</button>
            <AgendaOptions {...options} />
          </div>
          {mode === "day" && loadState !== "loading" ? <p className={styles.summary}>{daySummary(dayEvents)}</p> : null}
        </div>

        <section
          ref={daysRef} className={mode === "list" ? styles.verticalDays : styles.horizontalDays}
          aria-label={mode === "list" ? "Agenda em lista contínua" : "Agenda com dias na horizontal"}
          tabIndex={mode === "day" ? 0 : undefined}
          onKeyDown={(event) => {
            if (mode !== "day" || event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              selectDay(shiftDayKey(selectedDay, event.key === "ArrowLeft" ? -1 : 1));
            }
          }}
          onScroll={(event) => {
            if (mode !== "day") return;
            const strip = event.currentTarget;
            if (strip.scrollTop !== 0) strip.scrollTop = 0;
            const dayKey = pageDays[Math.round(strip.scrollLeft / strip.clientWidth)];
            if (dayKey) setSelectedDay(dayKey);
          }}
        >
          {pageDays.map((dayKey) => <AgendaDay key={dayKey} dayKey={dayKey} now={now} tasks={tasks} missedEvents={missedEvents} onSelectEvent={setSelectedEvent} onPlanFreeWindow={(freeWindow) => requestHubOpen({ freeWindow })} onStatusClick={openStatusPicker} events={userId ? matching(eventsByDay[dayKey] ?? []) : needle ? matching(exampleEventsOn(dayKey)) : undefined} userId={userId} todayKey={todayKey} hideWhenEmpty={mode === "list"} showHeading={mode === "list"} showFreeTime={showFreeTime && !needle} loading={Boolean(userId) && loadState === "loading" && !(dayKey in eventsByDay)} selected={mode === "day" && dayKey === selectedDay} freshIds={freshIds} />)}
        </section>
        {userId && loadState === "loading" ? <p role="status" className={styles.note}>Carregando sua agenda…</p> : null}
        {userId && loadState === "failed" ? <p role="alert" className={styles.note}>Não foi possível carregar a agenda. Tente novamente.</p> : null}
        {statusNote ? <p role="alert" className={styles.note}>{statusNote}</p> : null}
        {!userId ? <p className={styles.note}>Dados de exemplo · relógio ilustrativo às 09:35</p> : null}
      </section>
      {statusCard ? (
        <AgendaStatusPicker
          card={statusCard}
          onPick={(status) => void changeReferenceStatus(statusCard, status)}
          onClose={() => setStatusCard(null)}
        />
      ) : null}
      <EventTaskDialog
        selected={selectedEvent}
        task={selectedEvent?.event.task ? tasks[selectedEvent.event.task.id] ?? selectedEvent.event.task : undefined}
        missed={selectedEvent ? missedEvents[`${selectedEvent.dayKey}:${selectedEvent.event.id ?? selectedEvent.event.name}`] ?? selectedEvent.event.missed ?? false : false}
        onTaskChange={(task) => setTasks((current) => ({ ...current, [task.id]: task }))}
        onMissedChange={(missed) => { if (selectedEvent) setMissedEvents((current) => ({ ...current, [`${selectedEvent.dayKey}:${selectedEvent.event.id ?? selectedEvent.event.name}`]: missed })); }}
        onClose={() => setSelectedEvent(null)}
      />
    </main>
  );
}
