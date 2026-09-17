"use client";

import {
  dayKeyRange, dayNumber, isSameMonth, longDate, monthGridOf,
  monthLabel, shiftDayKey, weekOf, weekday, zonedDayEnd, zonedDayStart,
} from "@repo/timeline";
import { ChevronDown, Columns2, List, SlidersHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ICON_STROKE_WIDTH, notificationOffsetLabel, visualForItemType } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { TimelineEventCardDto, TimelineEventPageDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { useDueNotifications } from "@/lib/events/use-due-notifications";
import { useSessionState } from "@/lib/session/use-session";
import { AgendaDay } from "./agenda-day";
import { agendaEventsByDay } from "./agenda-data";
import { EXAMPLE_NOW, EXAMPLE_TODAY, type ExampleEvent, type ExampleTask } from "./agenda-examples";
import { agendaRefreshEvent } from "./agenda-refresh";
import { agendaScrollBoundaryFromAttempt } from "./agenda-scroll-boundary";
import { EventTaskDialog, type SelectedEvent } from "./task-controls";
import styles from "./mockup.module.css";

type ViewMode = "list" | "day";

export function AgendaPreview({ userId, todayKey = EXAMPLE_TODAY }: { userId?: string; todayKey?: string }) {
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
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  const viewOptionsRef = useRef<HTMLDetailsElement>(null);
  const [mode, setMode] = useState<ViewMode>("list");
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [navigation, setNavigation] = useState({ dayKey: todayKey });
  const [dayRange, setDayRange] = useState({ before: 0, after: 0 });
  const [visibleBoundaries, setVisibleBoundaries] = useState({ previous: false, next: false });
  const [monthOpen, setMonthOpen] = useState(false);
  const [browsingMonth, setBrowsingMonth] = useState(EXAMPLE_TODAY);
  const controlsRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef<HTMLElement>(null);
  const touchY = useRef<number | null>(null);
  const scrollFrame = useRef(0);
  const pageDays = mode === "day"
    ? weekOf(navigation.dayKey)
    : dayKeyRange(shiftDayKey(navigation.dayKey, -dayRange.before), dayRange.before + dayRange.after + 1);
  const rangeStart = pageDays[0] ?? todayKey;
  const rangeEnd = pageDays[pageDays.length - 1] ?? todayKey;

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
    setLoadState("loading");

    async function loadEvents() {
      try {
        const from = zonedDayStart(rangeStart).toISOString();
        const to = zonedDayEnd(rangeEnd).toISOString();
        const loaded: TimelineEventCardDto[] = [];
        let cursor: string | undefined;

        do {
          const params = new URLSearchParams({ from, to, limit: "100" });
          if (cursor) params.set("cursor", cursor);
          const response = await authedFetch<TimelineEventPageDto>(`/api/events?${params.toString()}`);
          loaded.push(...response.items);
          cursor = response.nextCursor;
        } while (cursor);

        if (cancelled) return;
        const next = agendaEventsByDay(loaded);
        setEventsByDay(current => ({ ...current, ...next }));
        setLoadState("idle");
      } catch {
        if (!cancelled) setLoadState("failed");
      }
    }

    void loadEvents();
    return () => { cancelled = true; };
  }, [rangeEnd, rangeStart, ready, refreshVersion, user, userId]);

  function selectDay(dayKey: string) {
    setSelectedDay(dayKey);
    setNavigation({ dayKey });
    setDayRange({ before: 0, after: 0 });
    setVisibleBoundaries({ previous: false, next: false });
    setMonthOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function changeMode(nextMode: ViewMode) {
    setMode(nextMode);
    if (viewOptionsRef.current) viewOptionsRef.current.open = false;
    selectDay(selectedDay);
  }

  // Só escolhas explícitas reposicionam o carrossel; um swipe apenas atualiza a seleção.
  useLayoutEffect(() => {
    const strip = daysRef.current;
    if (mode !== "day" || !strip) return;
    strip.scrollLeft = weekOf(navigation.dayKey).indexOf(navigation.dayKey) * strip.clientWidth;
  }, [mode, navigation]);

  useEffect(() => {
    if (mode !== "list") return;

    function revealBoundary(deltaY: number) {
      const boundary = agendaScrollBoundaryFromAttempt({
        deltaY,
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
      });
      if (boundary) setVisibleBoundaries(current => ({ ...current, [boundary]: true }));
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

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [mode]);

  // O mês acompanha o dia que está sendo lido na lista contínua.
  useEffect(() => {
    if (mode !== "list") return;
    function syncVisibleDay() {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = requestAnimationFrame(() => {
        const top = (controlsRef.current?.getBoundingClientRect().bottom ?? 0) + 12;
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

  // So a agenda real tem id estavel e notifyOffsetsMinutes vindo do backend;
  // os exemplos ilustrativos da previa sem sessao nunca cruzam um aviso.
  const notifiableEvents = userId
    ? Object.values(eventsByDay)
        .flat()
        .filter((event): event is typeof event & { id: string; startedAt: string } =>
          Boolean(event.id && event.startedAt && event.notifyOffsetsMinutes?.length),
        )
    : [];
  const { due: dueNotifications, dismiss: dismissNotification } = useDueNotifications(
    notifiableEvents,
    realNow,
  );

  if (userId && !ready) {
    return <main id="conteudo" className={styles.main}><p role="status" className={styles.emptyDay}>Carregando sua sessão…</p></main>;
  }
  if (userId && ready && !user) {
    return <main id="conteudo" className={styles.main}><p className={styles.emptyDay}>Entre na sua conta para ver sua agenda.</p></main>;
  }

  return (
    <main id="conteudo" className={styles.main}>
      {dueNotifications.length > 0 ? (
        <div className={styles.notificationToasts} role="status" aria-live="polite">
          {dueNotifications.map((notification) => (
            <div key={notification.key} className={styles.notificationToast}>
              <span>{notification.name} — {notificationOffsetLabel(notification.offsetMinutes)}</span>
              <button type="button" aria-label="Dispensar aviso" onClick={() => dismissNotification(notification.key)}>×</button>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.pageHeading}>
        <h1>Agenda</h1>
        <div className={styles.headingActions}>
          <details ref={viewOptionsRef} className={styles.viewOptions} onKeyDown={(event) => {
            if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
          }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
            <summary aria-label="Opções de visualização" title="Opções de visualização"><SlidersHorizontal aria-hidden /></summary>
            <fieldset className={styles.viewModes} aria-label="Visualização da agenda">
              <legend>Visualização</legend>
              <button type="button" aria-pressed={mode === "list"} onClick={() => changeMode("list")}><List aria-hidden /><span>Lista<small>Dias em sequência</small></span></button>
              <button type="button" aria-pressed={mode === "day"} onClick={() => changeMode("day")}><Columns2 aria-hidden /><span>Dia<small>Um dia de cada vez</small></span></button>
            </fieldset>
          </details>
        </div>
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.agenda}>
          <div className={styles.agendaControls} ref={controlsRef}>
            <div className={styles.dateToolbar}>
              <button
                type="button" className={styles.monthToggle} aria-expanded={monthOpen} aria-controls="agenda-month-picker"
                onClick={() => { setBrowsingMonth(selectedDay); setMonthOpen((open) => !open); }}
              >{monthLabel(monthOpen ? browsingMonth : selectedDay)}<ChevronDown aria-hidden /></button>
              <div className={styles.dateActions}>
                <button type="button" className={styles.todayButton} onClick={() => selectDay(todayKey)}>Hoje</button>
              </div>
            </div>

            {monthOpen ? (
              <section id="agenda-month-picker" className={styles.monthPicker} aria-label="Escolher dia do mês">
                <label className={styles.monthJump}>Ir para o mês
                  <input type="month" aria-label="Escolher mês e ano" min="1900-01" max="2100-12" value={browsingMonth.slice(0, 7)} onChange={(event) => {
                    if (event.target.validity.valid && /^\d{4}-\d{2}$/.test(event.target.value)) setBrowsingMonth(`${event.target.value}-01`);
                  }} />
                </label>
                <div className={styles.monthDays}>
                  {weekOf(browsingMonth).map((dayKey) => <span className={styles.weekday} key={dayKey}>{weekday(dayKey).slice(0, 3)}</span>)}
                  {monthGridOf(browsingMonth).map((dayKey) => (
                    <button type="button" key={dayKey} aria-label={longDate(dayKey)} aria-pressed={dayKey === selectedDay} aria-current={dayKey === todayKey ? "date" : undefined} data-outside={!isSameMonth(dayKey, browsingMonth)} onClick={() => selectDay(dayKey)}>{dayNumber(dayKey)}</button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {mode === "day" ? (
            <div className={styles.dayPaging}>
              <p>Deslize para mudar de dia</p>
            </div>
          ) : null}

          {mode === "list" && visibleBoundaries.previous ? <div className={`${styles.loadBoundary} ${styles.loadPrevious}`}>
            <button type="button" onClick={() => {
              setVisibleBoundaries(current => ({ ...current, previous: false }));
              setDayRange(current => ({ ...current, before: current.before + 7 }));
            }}>Ver eventos anteriores</button>
          </div> : null}

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
              const dayKey = pageDays[Math.round(strip.scrollLeft / strip.clientWidth)];
              if (dayKey) setSelectedDay(dayKey);
            }}
          >
            {pageDays.map((dayKey) => <AgendaDay key={dayKey} dayKey={dayKey} now={now} tasks={tasks} missedEvents={missedEvents} onSelectEvent={setSelectedEvent} events={userId ? eventsByDay[dayKey] ?? [] : undefined} userId={userId} todayKey={todayKey} hideWhenEmpty={mode === "list"} />)}
          </section>
          {mode === "list" && visibleBoundaries.next ? <div className={`${styles.loadBoundary} ${styles.loadNext}`}>
            <button type="button" onClick={() => {
              setVisibleBoundaries(current => ({ ...current, next: false }));
              setDayRange(current => ({ ...current, after: current.after + 7 }));
            }}>Ver eventos dos próximos dias</button>
          </div> : null}
          {userId && loadState === "loading" ? <p role="status" className={styles.listNote}>Carregando sua agenda…</p> : null}
          {userId && loadState === "failed" ? <p role="alert" className={styles.listNote}>Não foi possível carregar a agenda. Tente novamente.</p> : null}
          {!userId ? <p className={styles.listNote}>Dados de exemplo · relógio ilustrativo iniciado às 09:35</p> : null}
        </div>

        <aside className={styles.sidebar} aria-label="Legenda da agenda">
          <section className={styles.typeLegend} aria-label="Tipos de evento">
            <h2>Na sua agenda</h2>
            {["routine", "training", "meal", "sleep"].map((type) => {
              const { Icon, label } = visualForItemType(type);
              return <div key={type} data-type={type}><Icon aria-hidden strokeWidth={ICON_STROKE_WIDTH} /><span>{label}</span></div>;
            })}
          </section>
          <section className={styles.timeLegend} aria-label="Posição dos eventos no tempo">
            <h2>O seu dia, em perspectiva</h2>
            <div><i data-time-position="past" aria-hidden /><span>Horários passados</span></div>
            <div><i data-time-position="running" aria-hidden /><span>Em andamento</span></div>
            <div><i data-time-position="upcoming" aria-hidden /><span>A seguir</span></div>
            <p>O relógio situa o evento. O status continua sendo da tarefa.</p>
          </section>
          <p className={styles.prototypeNote}>Estudo visual · dados de exemplo</p>
        </aside>
      </div>
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
