"use client";

import {
  dayKeyRange, dayNumber, isSameMonth, longDate, monthGridOf,
  monthLabel, shiftDayKey, shiftMonthKey, weekOf, weekday,
} from "@repo/timeline";
import { ChevronDown, ChevronLeft, ChevronRight, Columns2, List, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import { useNow } from "@/lib/events/use-now";
import { AgendaDay } from "./agenda-day";
import { EXAMPLE_NOW, EXAMPLE_TODAY, type ExampleTask } from "./agenda-examples";
import { EventTaskDialog, type SelectedEvent } from "./task-controls";
import styles from "./mockup.module.css";

type ViewMode = "list" | "day";

export function AgendaPreview() {
  const realNow = useNow();
  const [clockStartedAt] = useState(Date.now);
  // A prévia usa a data ilustrativa; os segundos avançam com o relógio compartilhado.
  const now = EXAMPLE_NOW + (realNow ? Math.max(0, realNow.getTime() - clockStartedAt) : 0);
  const [tasks, setTasks] = useState<Record<string, ExampleTask>>({});
  const [missedEvents, setMissedEvents] = useState<Record<string, boolean>>({});
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  const viewOptionsRef = useRef<HTMLDetailsElement>(null);
  const [mode, setMode] = useState<ViewMode>("list");
  const [selectedDay, setSelectedDay] = useState(EXAMPLE_TODAY);
  const [navigation, setNavigation] = useState({ dayKey: EXAMPLE_TODAY });
  const [dayCount, setDayCount] = useState(14);
  const [monthOpen, setMonthOpen] = useState(false);
  const [browsingMonth, setBrowsingMonth] = useState(EXAMPLE_TODAY);
  const controlsRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef(0);
  const pageDays = mode === "day" ? weekOf(navigation.dayKey) : dayKeyRange(navigation.dayKey, dayCount);

  function selectDay(dayKey: string) {
    setSelectedDay(dayKey);
    setNavigation({ dayKey });
    setDayCount(14);
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
    const sentinel = loadMoreRef.current;
    if (mode !== "list" || !sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setDayCount((count) => count + 7);
    }, { rootMargin: "0px 0px 400px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
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

  return (
    <main id="conteudo" className={styles.main}>
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
          <button type="button" disabled className={styles.headerCreate} aria-label="Novo evento" title="Novo evento"><Plus aria-hidden /></button>
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
                <button type="button" className={styles.todayButton} onClick={() => selectDay(EXAMPLE_TODAY)}>Hoje</button>
                <button type="button" aria-label={monthOpen ? "Mês anterior" : "Dia anterior"} onClick={() => monthOpen ? setBrowsingMonth((month) => shiftMonthKey(month, -1)) : selectDay(shiftDayKey(selectedDay, -1))}><ChevronLeft aria-hidden /></button>
                <button type="button" aria-label={monthOpen ? "Próximo mês" : "Próximo dia"} onClick={() => monthOpen ? setBrowsingMonth((month) => shiftMonthKey(month, 1)) : selectDay(shiftDayKey(selectedDay, 1))}><ChevronRight aria-hidden /></button>
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
                    <button type="button" key={dayKey} aria-label={longDate(dayKey)} aria-pressed={dayKey === selectedDay} aria-current={dayKey === EXAMPLE_TODAY ? "date" : undefined} data-outside={!isSameMonth(dayKey, browsingMonth)} onClick={() => selectDay(dayKey)}>{dayNumber(dayKey)}</button>
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
            {pageDays.map((dayKey) => <AgendaDay key={dayKey} dayKey={dayKey} now={now} tasks={tasks} missedEvents={missedEvents} onSelectEvent={setSelectedEvent} />)}
          </section>
          {mode === "list" ? (
            <div ref={loadMoreRef} className={styles.loadMoreDays}>
              <button type="button" onClick={() => setDayCount((count) => count + 7)}>Ver mais dias</button>
            </div>
          ) : null}
          <p className={styles.listNote}>Dados de exemplo · relógio ilustrativo iniciado às 09:35</p>
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
        missed={selectedEvent ? missedEvents[`${selectedEvent.dayKey}:${selectedEvent.event.name}`] ?? selectedEvent.event.missed ?? false : false}
        onTaskChange={(task) => setTasks((current) => ({ ...current, [task.id]: task }))}
        onMissedChange={(missed) => { if (selectedEvent) setMissedEvents((current) => ({ ...current, [`${selectedEvent.dayKey}:${selectedEvent.event.name}`]: missed })); }}
        onClose={() => setSelectedEvent(null)}
      />
    </main>
  );
}
