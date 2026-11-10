"use client";

import { ArrowLeft, CalendarDays, Check, ChevronDown, FileText, ListChecks, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { creatableItemTypes, ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import { AgentChatPanel, agentEntityHref, useAgendaChat } from "@/components/hub/agent-chat-panel";
import { EXAMPLE_TODAY, exampleEventsOn, type TaskStatus } from "@/components/agenda/agenda-examples";
import { CalendarPicker, type DateField, EventScheduleFields } from "@/components/new-item/event-schedule-fields";
import { NotificationFeed, useNotificationFeed } from "./notification-bell";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { SettingsView } from "./settings-view";
import styles from "./shell.module.css";
import type { HubCommandId } from "@/components/hub/hub-commands";
import { hubOpenEvent } from "@/components/hub/hub-events";
import { TaskStatusIcon, taskStatuses } from "@/components/agenda/task-controls";
import { NewEventForm, type NewItemFormProps, NewNoteForm, NewTaskForm } from "@/components/new-item/new-item-forms";

type Kind = "Evento" | "Tarefa" | "Nota";
type Picker = "eventType" | "status" | "priority" | DateField;
const pickerTitles: Record<Picker, string> = { eventType: "Tipo de evento", status: "Status", priority: "Prioridade", startDate: "Início", endDate: "Término" };
type Category = "Rotina" | "Alimentação" | "Exercício";
type DraftPriority = "low" | "medium" | "high" | "urgent";
type EventType = (typeof creatableItemTypes)[number];
type Entry = { id: string; title: string; kind: Kind; category?: Category; draft?: Record<string, string> };
const draftPriorities: Record<DraftPriority, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };
const draftPriorityOrder: DraftPriority[] = ["urgent", "high", "medium", "low"];
const eventDetailCopy: Record<EventType, { label: string; placeholder: string }> = {
  routine: { label: "Detalhes", placeholder: "Acrescente o que for importante…" },
  meal: { label: "Alimentos e preparo", placeholder: "Ingredientes, quantidades ou modo de preparo…" },
  training: { label: "Treino e objetivo", placeholder: "Exercícios, séries ou objetivo do treino…" },
  sleep: { label: "Observações do sono", placeholder: "Acrescente algo importante sobre este período…" },
};
const initialEntries: Entry[] = [
  ...exampleEventsOn(EXAMPLE_TODAY).map((event, index) => ({ id: `event-${index}`, title: event.name, kind: "Evento" as const })),
  ...exampleEventsOn(EXAMPLE_TODAY).flatMap(event => event.task ? [{ id: event.task.id, title: event.name, kind: "Tarefa" as const }] : []),
  { id: "note-1", title: "Ideias para a proposta", kind: "Nota" },
];
const icons = { Evento: CalendarDays, Tarefa: ListChecks, Nota: FileText };

function DraftPriorityIcon({ priority }: { priority: DraftPriority }) {
  if (priority === "urgent") return <span className={styles.entityPriorityIcon} data-priority={priority} aria-hidden>
    <svg aria-hidden viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="2" fill="currentColor" opacity=".18" /><path d="M8 5v4M8 11.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  </span>;
  const activeBars = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return <span className={styles.entityPriorityIcon} data-priority={priority} aria-hidden>
    <svg aria-hidden viewBox="0 0 16 16" fill="none">
      <path d="M3 12V9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 12V6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={activeBars >= 2 ? 1 : .2} />
      <path d="M13 12V3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={activeBars === 3 ? 1 : .2} />
    </svg>
  </span>;
}

function LiveCreateForm({ kind, ...props }: NewItemFormProps & { kind: Kind }) {
  const Form = kind === "Tarefa" ? NewTaskForm : kind === "Evento" ? NewEventForm : NewNoteForm;
  return <Form {...props} />;
}

/** O que o cabeçalho do desktop precisa do painel: abri-lo. */
export interface HubHandle { open: () => void }

/**
 * A barra inferior do celular e o painel "Buscar e criar". O painel é o mesmo
 * nos dois tamanhos: no celular abre pela barra, como folha; no desktop, pelo
 * campo do cabeçalho (`hubRef`) ou por Ctrl/⌘ K, como diálogo centrado.
 */
/** A tela "Notificações" do painel: a mesma lista do sino, sem entregar avisos (quem entrega é o sino montado). */
function NotificationsView({ userId }: { userId: string }) {
  const state = useNotificationFeed();
  return <section className={styles.notificationPanel} data-inline="true" aria-label="Notificações"><NotificationFeed userId={userId} state={state} /></section>;
}

export function MobileNavigation({ userId, hubRef, onHubOpenChange, darkMode = false, onThemeToggle = () => {} }: { userId?: string; hubRef?: RefObject<HubHandle | null>; onHubOpenChange?: (open: boolean) => void; darkMode?: boolean; onThemeToggle?: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const notesHref = userId ? `/${userId}/notas` : "/mockups/eventos/notas";
  const onNotes = notesHref !== null && (pathname === notesHref || pathname.startsWith(`${notesHref}/`));
  const tasksHref = userId ? `/${userId}/tarefas` : null;
  const onTasks = tasksHref !== null && (pathname === tasksHref || pathname.startsWith(`${tasksHref}/`));
  const agendaChat = useAgendaChat({ live: Boolean(userId) });
  const [panel, setPanel] = useState<"hub" | "Tarefa" | "Nota" | null>(null);
  // O chat e a porta do painel; criar e pesquisar abrem pelos comandos "/" dele.
  const [hubView, setHubView] = useState<"chat" | "create" | "search" | "notifications" | "settings">("chat");
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("Tarefa");
  const [category, setCategory] = useState<Category>("Rotina");
  const [eventType, setEventType] = useState<EventType>("routine");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [entries, setEntries] = useState(initialEntries);
  const [notice, setNotice] = useState("");
  const [liveName, setLiveName] = useState("");
  const [formPicker, setFormPicker] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [activePicker, setActivePicker] = useState<Picker | null>(null);
  const dialogId = useId();
  const titleId = useId();
  const draftKey = kind === "Evento" ? `${kind}:${eventType}` : `${kind}:${category}`;
  const draft = drafts[draftKey] ?? {};
  const eventVisual = visualForItemType(eventType);
  const selectedPriority = draft.priority && draft.priority in draftPriorities ? draft.priority as DraftPriority : "medium";
  const selectedStatus = draft.status && draft.status in taskStatuses ? draft.status as TaskStatus : "todo";
  function updateDraft(field: string, value: string) {
    setDrafts(current => ({ ...current, [draftKey]: { ...current[draftKey], [field]: value } }));
  }
  function runCommand(command: HubCommandId, argument: string) {
    setActivePicker(null);
    setNotice("");
    if (command === "search") {
      setQuery(argument);
      setHubView("search");
      return;
    }
    if (command === "notifications" || command === "settings") {
      setHubView(command);
      return;
    }
    const next: Kind = command === "task" ? "Tarefa" : command === "event" ? "Evento" : "Nota";
    // Logado, o formulário é o de verdade (`new-item-forms.tsx`); o nome do comando vai nele.
    setLiveName(argument);
    setFormPicker(false);
    setKind(next);
    setCategory("Rotina");
    // `/tarefa comprar pão` ja chega com o nome preenchido.
    if (argument) {
      const key = next === "Evento" ? `${next}:${eventType}` : `${next}:Rotina`;
      setDrafts(current => ({ ...current, [key]: { ...current[key], title: argument } }));
    }
    setHubView("create");
  }
  function backToChat() {
    setActivePicker(null);
    setNotice("");
    setHubView("chat");
  }

  function openPanel(next: "hub" | "Tarefa" | "Nota") {
    setPanel(next);
    setQuery("");
    setCreating(false);
    setActivePicker(null);
    setNotice("");
    if (next === "hub") { setHubView("chat"); setExpanded(false); }
    if (next !== "hub") setKind(next);
    dialogRef.current?.showModal();
  }

  // O cabeçalho e o atalho de teclado abrem o painel sem conhecer o estado dele:
  // a referência guarda sempre a versão atual de `openPanel`.
  const openHubRef = useRef(() => {});
  openHubRef.current = () => openPanel("hub");

  useEffect(() => {
    if (!hubRef) return;
    hubRef.current = { open: () => openHubRef.current() };
    return () => { hubRef.current = null; };
  }, [hubRef]);

  useEffect(() => { onHubOpenChange?.(panel === "hub"); }, [panel, onHubOpenChange]);

  // No desktop o painel abre pronto para digitar. No celular não: focar o campo
  // subiria o teclado por cima da folha antes de a pessoa escolher o que fazer.
  useEffect(() => {
    if (panel !== "hub" || hubView !== "chat" || !window.matchMedia("(min-width: 721px)").matches) return;
    dialogRef.current?.querySelector<HTMLInputElement>('input[aria-label="Mensagem para a IA"]')?.focus();
  }, [panel, hubView]);

  // Uma tela pede o painel (a janela livre da agenda, por exemplo).
  useEffect(() => {
    function onRequest() {
      if (!dialogRef.current?.open) openHubRef.current();
    }
    window.addEventListener(hubOpenEvent, onRequest);
    return () => window.removeEventListener(hubOpenEvent, onRequest);
  }, []);

  // Ctrl/⌘ K abre o painel de qualquer tela e fecha se já estiver aberto.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (dialogRef.current?.open) dialogRef.current.close();
      else openHubRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleEntries = entries.filter(entry => (panel === "hub" || entry.kind === panel) && entry.title.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));

  return (
    <>
      <div className={styles.bottomFade} aria-hidden />
      <nav className={styles.bottomNav} aria-label="Navegação inferior">
        {tasksHref ? (
          <Link href={tasksHref} aria-label="Tarefas" aria-current={onTasks && !panel ? "page" : undefined}><ListChecks aria-hidden /><span>Tarefas</span></Link>
        ) : (
          <button type="button" aria-label="Tarefas" onClick={() => openPanel("Tarefa")} aria-haspopup="dialog" aria-expanded={panel === "Tarefa"} aria-controls={dialogId}><ListChecks aria-hidden /><span>Tarefas</span></button>
        )}
        <Link href={userId ? `/${userId}` : "/mockups/eventos"} aria-label="Agenda" aria-current={panel || onNotes || onTasks ? undefined : "page"}><CalendarDays aria-hidden /><span>Agenda</span></Link>
        {notesHref ? (
          <Link href={notesHref} aria-label="Notas" aria-current={onNotes && !panel ? "page" : undefined}><FileText aria-hidden /><span>Notas</span></Link>
        ) : (
          <button type="button" aria-label="Notas" onClick={() => openPanel("Nota")} aria-haspopup="dialog" aria-expanded={panel === "Nota"} aria-controls={dialogId}><FileText aria-hidden /><span>Notas</span></button>
        )}
        <button type="button" className={styles.commandButton} onClick={() => openPanel("hub")} aria-haspopup="dialog" aria-expanded={panel === "hub"} aria-controls={dialogId} aria-label="Buscar e criar"><HermesGlyph /></button>
      </nav>
      <dialog ref={dialogRef} id={dialogId} aria-labelledby={panel === "hub" ? undefined : titleId} aria-label={panel === "hub" ? "Buscar e criar" : undefined} className={styles.sectionMenu} onClose={() => setPanel(null)}
        data-hub-view={panel === "hub" ? hubView : undefined} data-expanded={panel === "hub" && hubView === "chat" && expanded ? "true" : undefined}
        onPointerDown={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { event.preventDefault(); dialogRef.current?.close(); }
        }}>
        <div className={styles.sheetHandle} aria-hidden />
        {panel !== "hub" && <div className={styles.sectionMenuHeading}>
          <h2 id={titleId}>{panel === "Tarefa" ? "Tarefas" : "Notas"}</h2>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Fechar painel"><X aria-hidden /></button>
        </div>}
        {panel === "hub" && hubView === "chat" ? <AgentChatPanel {...agendaChat} expanded={expanded} onToggleExpanded={() => setExpanded(current => !current)} onCommand={runCommand} onClose={() => dialogRef.current?.close()} entityHref={userId ? entity => agentEntityHref(userId, entity) : undefined} /> : <>
        {panel === "hub" && !activePicker && !formPicker && <div className={styles.hubHeader}>
          <button type="button" className={styles.hubBack} onClick={backToChat} aria-label="Voltar para o chat"><ArrowLeft aria-hidden /></button>
          {hubView === "notifications" || hubView === "settings" ? null
            : hubView === "create" ? <fieldset className={styles.creationToggle} aria-label="Tipo de criação">{(["Tarefa", "Evento", "Nota"] as Kind[]).map(value => { const Icon = icons[value]; return <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setActivePicker(null); setNotice(""); setFormPicker(false); }}><Icon aria-hidden /><span>{value}</span></button>; })}</fieldset>
            : <label className={styles.hubSearch}><Search aria-hidden /><input aria-label="Pesquisar eventos, tarefas e notas" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar eventos, tarefas e notas" autoFocus /></label>}
        </div>}
        <div className={styles.hubContent}>
        {panel === "hub" && hubView === "create" && activePicker ? <div className={styles.pickerView}>
          <div className={styles.pickerHeader}>
            <button type="button" className={styles.pickerBack} onClick={() => setActivePicker(null)} aria-label="Voltar"><ArrowLeft aria-hidden /></button>
            <h3>{pickerTitles[activePicker]}</h3>
          </div>
          {activePicker === "startDate" || activePicker === "endDate" ? <div className={styles.pickerOptions}>
            <CalendarPicker value={draft[activePicker] ?? EXAMPLE_TODAY} onChange={value => updateDraft(activePicker, value)} onClose={() => setActivePicker(null)} />
          </div> : <div className={styles.pickerOptions} role="listbox" aria-label={pickerTitles[activePicker]}>
            {activePicker === "eventType" && creatableItemTypes.map(type => {
              const visual = visualForItemType(type);
              return <button type="button" role="option" aria-selected={type === eventType} key={type} className={styles.pickerOption} onClick={() => { setEventType(type); setActivePicker(null); }}>
                <span className={styles.entityTypeIcon} data-event-type={type}><visual.Icon aria-hidden strokeWidth={ICON_STROKE_WIDTH} /></span>
                <span>{visual.label}</span>
                {type === eventType ? <Check aria-hidden /> : null}
              </button>;
            })}
            {activePicker === "status" && (Object.keys(taskStatuses) as TaskStatus[]).map(status => <button type="button" role="option" aria-selected={status === selectedStatus} key={status} className={styles.pickerOption} onClick={() => { updateDraft("status", status); setActivePicker(null); }}>
              <TaskStatusIcon status={status} />
              <span>{taskStatuses[status].label}</span>
              {status === selectedStatus ? <Check aria-hidden /> : null}
            </button>)}
            {activePicker === "priority" && draftPriorityOrder.map(priority => <button type="button" role="option" aria-selected={priority === selectedPriority} key={priority} className={styles.pickerOption} onClick={() => { updateDraft("priority", priority); setActivePicker(null); }}>
              <DraftPriorityIcon priority={priority} />
              <span>{draftPriorities[priority]}</span>
              {priority === selectedPriority ? <Check aria-hidden /> : null}
            </button>)}
          </div>}
        </div> : panel === "hub" && hubView === "notifications" ? (userId ? <NotificationsView userId={userId} /> : <p className={styles.notificationEmpty}>Entre na sua conta para ver os avisos.</p>)
          : panel === "hub" && hubView === "settings" ? <SettingsView darkMode={darkMode} onThemeToggle={onThemeToggle} onSignedOut={() => { dialogRef.current?.close(); router.replace("/"); }} />
          : panel === "hub" && hubView === "create" && userId ? <LiveCreateForm key={kind} kind={kind} initialName={liveName} onPickerChange={setFormPicker} onCreated={path => { dialogRef.current?.close(); router.push(`/${userId}${path}`); }} /> : panel === "hub" && hubView === "create" ? <div className={styles.entityForm}>
            {kind === "Evento" ? <div className={styles.entityEventHeading}>
              <span className={styles.entityEventTypeName}>{eventVisual.label}</span>
              <div className={styles.entityEventTitleRow}>
                <fieldset className={styles.entityTypeSelect}>
                  <button type="button" className={styles.entityTypeButton} aria-label={`Tipo do evento: ${eventVisual.label}`} aria-haspopup="dialog" aria-expanded={activePicker === "eventType"} onClick={() => setActivePicker("eventType")}>
                    <span className={styles.entityTypeIcon} data-event-type={eventType}><eventVisual.Icon aria-hidden strokeWidth={ICON_STROKE_WIDTH} /></span>
                    <ChevronDown aria-hidden />
                  </button>
                </fieldset>
                <input className={styles.entityEventNameInput} aria-label="Nome do evento" value={draft.title ?? ""} onChange={event => updateDraft("title", event.target.value)} placeholder="Nome do evento" />
              </div>
            </div> : <div className={styles.entityHeading}><span>{(() => { const Icon = icons[kind]; return <Icon aria-hidden />; })()}</span><div><input className={styles.entityNameInput} aria-label={`Nome da ${kind.toLocaleLowerCase("pt-BR")}`} value={draft.title ?? ""} onChange={event => updateDraft("title", event.target.value)} placeholder={`Nome da ${kind.toLocaleLowerCase("pt-BR")}`} /><p>{category}</p></div></div>}
            {kind === "Tarefa" && <div className={styles.entitySelectors}>
              <fieldset className={styles.entitySelect}>
                <span className={styles.entitySelectLabel}>Status</span>
                <button type="button" className={styles.entitySelectButton} aria-label={`Status: ${taskStatuses[selectedStatus].label}`} aria-haspopup="dialog" aria-expanded={activePicker === "status"} onClick={() => setActivePicker("status")}>
                  <TaskStatusIcon status={selectedStatus} />
                  <span>{taskStatuses[selectedStatus].label}</span>
                  <ChevronDown aria-hidden />
                </button>
              </fieldset>
              <fieldset className={styles.entitySelect}>
                <span className={styles.entitySelectLabel}>Prioridade</span>
                <button type="button" className={styles.entitySelectButton} aria-label={`Prioridade: ${draftPriorities[selectedPriority]}`} aria-haspopup="dialog" aria-expanded={activePicker === "priority"} onClick={() => setActivePicker("priority")}>
                  <DraftPriorityIcon priority={selectedPriority} />
                  <span>{draftPriorities[selectedPriority]}</span>
                  <ChevronDown aria-hidden />
                </button>
              </fieldset>
            </div>}
            {kind === "Evento" && <>
              <EventScheduleFields
                key={eventType}
                startDate={draft.startDate ?? EXAMPLE_TODAY}
                startTime={draft.startTime ?? "09:00"}
                endDate={draft.endDate ?? EXAMPLE_TODAY}
                endTime={draft.endTime ?? "10:00"}
                activeField={activePicker === "startDate" || activePicker === "endDate" ? activePicker : null}
                onChange={updateDraft}
                onOpenCalendar={field => setActivePicker(field)}
              />
              {eventType === "meal" ? <div className={styles.entityFields}>
                <label>Refeição<input value={draft.mealName ?? ""} onChange={event => updateDraft("mealName", event.target.value)} placeholder="Ex.: Café da manhã" /></label>
                <label>Porção<input value={draft.portion ?? ""} onChange={event => updateDraft("portion", event.target.value)} placeholder="Ex.: 1 prato" /></label>
              </div> : null}
              {eventType === "training" ? <div className={styles.entityFields}>
                <label>Modalidade<select value={draft.workout ?? "free"} onChange={event => updateDraft("workout", event.target.value)}><option value="free">Livre</option><option value="walking">Caminhada</option><option value="running">Corrida</option><option value="treadmill">Esteira</option><option value="weightlifting">Musculação</option></select></label>
                <label>Duração (min)<input type="number" min="0" inputMode="numeric" value={draft.duration ?? ""} onChange={event => updateDraft("duration", event.target.value)} placeholder="60" /></label>
              </div> : null}
              {eventType === "sleep" ? <div className={styles.entityFields}>
                <label>Tempo de sono (min)<input type="number" min="0" inputMode="numeric" value={draft.sleepMinutes ?? ""} onChange={event => updateDraft("sleepMinutes", event.target.value)} placeholder="480" /></label>
                <label>Qualidade (0–100)<input type="number" min="0" max="100" inputMode="numeric" value={draft.sleepScore ?? ""} onChange={event => updateDraft("sleepScore", event.target.value)} placeholder="80" /></label>
              </div> : null}
            </>}
            <label>{kind === "Evento" ? eventDetailCopy[eventType].label : kind === "Nota" ? "Conteúdo da nota" : category === "Alimentação" ? "Refeição e preparo" : category === "Exercício" ? "Treino e objetivo" : "Detalhes"}<textarea className={styles.entityControl} rows={2} value={draft.details ?? ""} onChange={event => updateDraft("details", event.target.value)} placeholder={kind === "Evento" ? eventDetailCopy[eventType].placeholder : kind === "Nota" ? `Suas anotações sobre ${category.toLocaleLowerCase("pt-BR")}…` : category === "Alimentação" ? "Ingredientes, porções ou modo de preparo…" : category === "Exercício" ? "Exercícios, séries ou duração…" : "Acrescente o que for importante…"} /></label>
          </div> : <div className={styles.manualPanel}>
          {panel !== "hub" && <>
          <label className={styles.hubSearch}><Search aria-hidden /><input aria-label="Buscar eventos, tarefas e notas" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Buscar ${panel === "Tarefa" ? "tarefas" : "notas"}`} /></label>
          <div className={styles.manualHeading}><h3>{query ? "Resultados" : "No seu espaço"}</h3><button type="button" onClick={() => { setCreating(!creating); setNotice(""); }}><Plus aria-hidden />Criar novo</button></div>
          {creating && <form className={styles.quickCreate} onSubmit={event => {
            event.preventDefault();
            if (!title.trim()) return;
            setEntries(current => [{ id: `draft-${Date.now()}`, title: title.trim(), kind }, ...current]);
            setTitle(""); setQuery(""); setCreating(false); setNotice(`${kind}: rascunho adicionado à prévia.`);
          }}>
            <label>Tipo<select value={kind} onChange={event => setKind(event.target.value as Kind)} disabled><option>Evento</option><option>Tarefa</option><option>Nota</option></select></label>
            <label>Título<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Dê um nome à sua ideia" required /></label>
            <button type="submit" disabled={!title.trim()}>Criar rascunho</button>
          </form>}
          <p className={styles.hubNotice} role="status">{notice}</p>
          </>}
          {panel === "hub" && <div className={styles.manualHeading}><h3>{query ? "Resultados" : "No seu espaço"}</h3></div>}
          <ul className={styles.hubResults}>{visibleEntries.map(entry => { const Icon = icons[entry.kind]; return <li key={entry.id}><Icon aria-hidden /><span>{entry.title}<small>{entry.kind}{entry.category ? ` · ${entry.category}` : ""}</small></span></li>; })}</ul>
          {visibleEntries.length === 0 && <p className={styles.hubDescription}>Nenhum resultado. Que tal criar algo novo?</p>}
        </div>}
        </div>
        {panel !== "hub" && <p className={styles.hubFootnote}>Prévia interativa · dados de exemplo · rascunhos só nesta sessão</p>}
        </>}
      </dialog>
    </>
  );
}
