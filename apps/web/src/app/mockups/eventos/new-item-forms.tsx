"use client";

import { ArrowLeft, Clock, NotepadText, Plus, SquareCheck, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { createTask, updateTask } from "@/lib/tasks/task-api";
import {
  scheduleToInstants, statusForSchedule, TASK_PRIORITY_ORDER, TASK_STATUS_ORDER, taskDayOf, taskPriorityLabels, taskStatusLabels, taskTimeOf,
} from "@/lib/tasks/tasks-model";
import type { WorkItemPriority, WorkItemStatus } from "@/lib/api/contracts";
import { notificationOffsetLabel, visualForItemType, ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { CreateEventInput, CreateNoteRequest, EventDetailDto, NoteDto, TaskDetailDto, UpdateNoteRequest } from "@/lib/api/contracts";
import { joinDetailsAndTags, splitDetailsAndTags } from "@/lib/tags/details-tags";
import { agendaRefreshEvent } from "./agenda-refresh";
import { CalendarPicker, type DateField, EventScheduleFields } from "./event-schedule-fields";
import styles from "./mockup.module.css";

const pad = (value: number) => String(value).padStart(2, "0");
const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Props comuns: `onCreated` recebe o caminho do item criado; `initialName` vem de `/tarefa comprar pão`. */
export interface NewItemFormProps {
  initialName?: string;
  onCreated: (path: string) => void;
  /** O evento troca o formulário pelo calendário; quem hospeda esconde o seu cabeçalho enquanto isso. */
  onPickerChange?: (open: boolean) => void;
}

/** Edição: o mesmo formulário, preenchido com o item; `onCreated` recebe o caminho do item salvo. */
export interface EditItemFormProps<Item> extends NewItemFormProps {
  existing?: Item;
}

/** Avisos antes do início: digita-se os minutos, "Adicionar" cria o aviso e cada um sai pelo "×". */
function OffsetChips({ offsets, onChange }: { offsets: number[]; onChange: (offsets: number[]) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const minutes = Number(draft);
    if (!Number.isInteger(minutes) || minutes <= 0) { setError("Digite um número inteiro de minutos, maior que zero."); return; }
    setError(null);
    setDraft("");
    if (!offsets.includes(minutes)) onChange([...offsets, minutes].sort((a, b) => a - b));
  }

  return <fieldset className={styles.entitySelect}>
    <span className={styles.entitySelectLabel}><Clock aria-hidden style={{ width: 11, height: 11, verticalAlign: "-1px" }} /> Notificações</span>
    <div className={styles.offsetAdd}>
      <input type="number" min="1" step="1" inputMode="numeric" aria-label="Minutos antes do início" placeholder="Minutos antes" value={draft}
        onChange={event => { setDraft(event.target.value); setError(null); }}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <button type="button" onClick={add}><Plus aria-hidden />Adicionar</button>
    </div>
    {error ? <p role="alert" className={styles.formError}>{error}</p> : null}
    {offsets.length > 0 ? <div className={styles.entityChips}>
      {offsets.map(minutes => <span key={minutes} className={styles.entityChip}>{notificationOffsetLabel(minutes)}
        <button type="button" aria-label={`Remover aviso de ${notificationOffsetLabel(minutes)}`} onClick={() => onChange(offsets.filter(value => value !== minutes))}><X aria-hidden /></button>
      </span>)}
    </div> : null}
  </fieldset>;
}

const DETAILS_PLACEHOLDER = "Acrescente o que for importante… Use #tag para marcar.";

/** Novo evento (rotina): nome, início e término, detalhes com #tags e avisos. */
export function NewEventForm({ initialName, onCreated, onPickerChange, existing }: EditItemFormProps<EventDetailDto>) {
  const [initial] = useState(() => {
    const start = existing ? new Date(existing.startedAt) : new Date();
    const end = existing?.finishedAt ? new Date(existing.finishedAt) : new Date(start.getTime() + 60 * 60 * 1000);
    return {
      title: existing?.name ?? initialName ?? "", startDate: dayOf(start), startTime: timeOf(start), endDate: dayOf(end), endTime: timeOf(end),
      details: existing ? joinDetailsAndTags(existing.description, existing.tags) : "",
    };
  });
  const [form, setForm] = useState(initial);
  const [offsets, setOffsets] = useState<number[]>(existing?.notifyOffsetsMinutes ?? []);
  const [picker, setPickerState] = useState<DateField | null>(null);
  function setPicker(next: DateField | null) {
    setPickerState(next);
    onPickerChange?.(next !== null);
  }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visual = visualForItemType("routine");

  function update(field: string, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Dê um nome ao evento."); return; }
    const startedAt = new Date(`${form.startDate}T${form.startTime || "00:00"}`);
    const finishedAt = new Date(`${form.endDate}T${form.endTime || "00:00"}`);
    if (finishedAt < startedAt) { setError("O término não pode ser antes do início."); return; }
    const { description, tags } = splitDetailsAndTags(form.details);
    setSubmitting(true);
    setError(null);
    if (existing) {
      // Um evento sem fim declarado só ganha um se a pessoa mexer no término.
      const endTouched = form.endDate !== initial.endDate || form.endTime !== initial.endTime;
      try {
        await authedFetch(`/api/events/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: existing.revision, name: form.title.trim(), description, tags, notifyOffsetsMinutes: offsets,
            startedAt: startedAt.toISOString(), ...(existing.finishedAt || endTouched ? { finishedAt: finishedAt.toISOString() } : {}),
          }),
        });
        window.dispatchEvent(new Event(agendaRefreshEvent));
        onCreated(`/eventos/${existing.id}`);
      } catch {
        setError("Não foi possível salvar o evento. Tente novamente.");
        setSubmitting(false);
      }
      return;
    }
    const body: CreateEventInput = {
      name: form.title.trim(),
      description,
      tags,
      notifyOffsetsMinutes: offsets,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
    try {
      const { eventId } = await authedFetch<{ eventId: string }>("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onCreated(`/eventos/${eventId}`);
    } catch {
      setError("Não foi possível criar o evento. Tente novamente.");
      setSubmitting(false);
    }
  }

  if (picker) {
    const value = picker === "startDate" ? form.startDate : form.endDate;
    return <div className={styles.pickerView}>
      <div className={styles.pickerHeader}>
        <button type="button" className={styles.pickerBack} onClick={() => setPicker(null)} aria-label="Voltar"><ArrowLeft aria-hidden /></button>
        <h3>{picker === "startDate" ? "Início" : "Término"}</h3>
      </div>
      <div className={styles.pickerOptions}>
        <CalendarPicker value={value} onChange={next => update(picker, next)} onClose={() => setPicker(null)} />
      </div>
    </div>;
  }

  return (
    <form className={styles.entityForm} onSubmit={event => void submit(event)} noValidate>
      <div className={styles.entityEventHeading}>
        <span className={styles.entityEventTypeName}>{visual.label}</span>
        <div className={styles.entityEventTitleRow}>
          <span className={styles.entityTypeIcon} data-event-type="routine"><visual.Icon aria-hidden strokeWidth={ICON_STROKE_WIDTH} /></span>
          <input className={styles.entityEventNameInput} aria-label="Nome do evento" value={form.title} onChange={event => update("title", event.target.value)} placeholder="Nome do evento" autoComplete="off" />
        </div>
      </div>
      <EventScheduleFields
        startDate={form.startDate}
        startTime={form.startTime}
        endDate={form.endDate}
        endTime={form.endTime}
        activeField={null}
        onChange={update}
        onOpenCalendar={setPicker}
      />
      <label>Detalhes<textarea className={styles.entityControl} rows={2} value={form.details} onChange={event => update("details", event.target.value)} placeholder={DETAILS_PLACEHOLDER} /></label>
      <OffsetChips offsets={offsets} onChange={setOffsets} />
      {error ? <p role="alert" className={styles.formError}>{error}</p> : null}
      <button type="submit" className={styles.entityContinue} disabled={submitting}>{submitting ? (existing ? "Salvando…" : "Criando…") : (existing ? "Salvar alterações" : "Criar evento")}</button>
    </form>
  );
}

/** Nova tarefa: nome, status, prioridade, dia e horário, detalhes com #tags e avisos. */
export function NewTaskForm({ initialName, onCreated, existing }: EditItemFormProps<TaskDetailDto>) {
  const [name, setName] = useState(existing?.name ?? initialName ?? "");
  const [status, setStatus] = useState<WorkItemStatus>(existing?.status ?? "todo");
  // Enquanto a pessoa não escolhe o status, ele acompanha o dia e o horário.
  const [statusChosen, setStatusChosen] = useState(Boolean(existing));
  const [priority, setPriority] = useState<WorkItemPriority>(existing?.priority ?? "medium");
  const [day, setDay] = useState(existing ? (taskDayOf(existing) ?? "") : "");
  const [time, setTime] = useState(existing ? (taskTimeOf(existing) ?? "") : "");
  const [details, setDetails] = useState(existing ? joinDetailsAndTags(existing.description, existing.tags) : "");
  const [offsets, setOffsets] = useState<number[]>(existing?.notifyOffsetsMinutes ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeSchedule(nextDay: string, nextTime: string) {
    setDay(nextDay);
    setTime(nextTime);
    if (!statusChosen) setStatus(statusForSchedule(nextDay, nextTime));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Dê um nome à tarefa."); return; }
    setSubmitting(true);
    setError(null);
    const { description, tags } = splitDetailsAndTags(details);
    const fields = { name: name.trim(), description, status, priority, tags, notifyOffsetsMinutes: offsets, ...scheduleToInstants(day, time) };
    try {
      if (existing) {
        await updateTask(existing.id, { expectedRevision: existing.revision, ...fields });
        onCreated(`/tarefas/${existing.id}`);
      } else {
        onCreated(`/tarefas/${await createTask(fields)}`);
      }
    } catch {
      setError(existing ? "Não foi possível salvar a tarefa. Tente novamente." : "Não foi possível criar a tarefa. Tente novamente.");
      setSubmitting(false);
    }
  }

  return <form className={styles.entityForm} onSubmit={event => void submit(event)} noValidate>
    <div className={styles.entityHeading}>
      <span><SquareCheck aria-hidden /></span>
      <div><input className={styles.entityNameInput} aria-label="Nome da tarefa" value={name} onChange={event => setName(event.target.value)} placeholder="Nome da tarefa" autoComplete="off" /></div>
    </div>
    <div className={styles.entityFields}>
      <label>Status<select value={status} onChange={event => { setStatus(event.target.value as WorkItemStatus); setStatusChosen(true); }}>
        {TASK_STATUS_ORDER.map(option => <option key={option} value={option}>{taskStatusLabels[option]}</option>)}
      </select></label>
      <label>Prioridade<select value={priority} onChange={event => setPriority(event.target.value as WorkItemPriority)}>
        {TASK_PRIORITY_ORDER.map(option => <option key={option} value={option}>{taskPriorityLabels[option]}</option>)}
      </select></label>
      <label>Dia<input type="date" value={day} onChange={event => changeSchedule(event.target.value, event.target.value ? time : "")} /></label>
      <label>Horário<input type="time" value={time} disabled={!day} onChange={event => changeSchedule(day, event.target.value)} /></label>
    </div>
    <label>Detalhes<textarea className={styles.entityControl} rows={2} value={details} onChange={event => setDetails(event.target.value)} placeholder={DETAILS_PLACEHOLDER} /></label>
    <OffsetChips offsets={offsets} onChange={setOffsets} />
    {error ? <p role="alert" className={styles.formError}>{error}</p> : null}
    <button type="submit" className={styles.entityContinue} disabled={submitting}>{submitting ? (existing ? "Salvando…" : "Criando…") : (existing ? "Salvar alterações" : "Criar tarefa")}</button>
  </form>;
}

/** Nova nota de texto: o título é opcional (vem da primeira linha) e o conteúdo é markdown. */
export function NewNoteForm({ initialName, onCreated, existing }: EditItemFormProps<NoteDto>) {
  const [name, setName] = useState(existing?.name ?? initialName ?? "");
  const [content, setContent] = useState(existing?.type === "text" ? existing.data.body : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) { setError("Escreva o texto da nota."); return; }
    setSubmitting(true);
    setError(null);
    if (existing) {
      const update: UpdateNoteRequest = { expectedRevision: existing.revision, name: name.trim() || undefined, tags: existing.tags, type: "text", data: { body: content } };
      try {
        await authedFetch(`/api/notes/${existing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
        onCreated(`/notas/${existing.id}`);
      } catch {
        setError("Não foi possível salvar a nota. Tente novamente.");
        setSubmitting(false);
      }
      return;
    }
    const body: CreateNoteRequest = { type: "text", data: { body: content }, name: name.trim() || undefined, tags: [] };
    try {
      const { noteId } = await authedFetch<{ noteId: string }>("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onCreated(`/notas/${noteId}`);
    } catch {
      setError("Não foi possível criar a nota. Tente novamente.");
      setSubmitting(false);
    }
  }

  return <form className={styles.entityForm} onSubmit={event => void submit(event)} noValidate>
    <div className={styles.entityHeading}>
      <span><NotepadText aria-hidden /></span>
      <div><input className={styles.entityNameInput} aria-label="Nome da nota" value={name} onChange={event => setName(event.target.value)} placeholder="Nome da nota (opcional)" autoComplete="off" /></div>
    </div>
    <label>Conteúdo da nota<textarea className={styles.entityControl} rows={4} value={content} onChange={event => setContent(event.target.value)} placeholder="Escreva em markdown: ## subtítulo, **negrito**, - lista…" /></label>
    {error ? <p role="alert" className={styles.formError}>{error}</p> : null}
    <button type="submit" className={styles.entityContinue} disabled={submitting}>{submitting ? (existing ? "Salvando…" : "Criando…") : (existing ? "Salvar alterações" : "Criar nota")}</button>
  </form>;
}
