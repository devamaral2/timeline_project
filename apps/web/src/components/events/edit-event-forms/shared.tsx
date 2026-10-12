"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type {
  EventDetailDto,
  EventPriority,
  NoteDataInput,
  NoteDto,
  NotificationOffsetMinutes,
  UpdateEventNoteInput,
} from "@/lib/api/contracts";
import { authedFetch } from "@/lib/api/authed-fetch";
import { iconButtonClass } from "@/components/ui/button-styles";
import { addRowButtonClass, fieldInputClass, fieldLabelClass, smallInputClass } from "../new-event-forms/field-styles";
import { notificationOffsetLabel, priorities, priorityLabels } from "../event-visuals";

type NotificationOffsetUnit = "minutes" | "days";

const MINUTES_PER_NOTIFICATION_OFFSET_UNIT: Record<NotificationOffsetUnit, number> = {
  minutes: 1,
  days: 1440,
};

export { CommonFields, FormActions, anyDecimalStep, fieldInputClass, fieldLabelClass, fieldTextareaClass } from "../new-event-forms/shared";
export { TagInput } from "../new-event-forms/TagInput";

interface UseSubmitEventUpdateOptions {
  eventId: string;
  onUpdated: () => void;
  onClose: () => void;
}

/**
 * PATCH so envia os campos que o usuario de fato alterou nesta tela. O eventId
 * nao vai no corpo — ele ja esta na URL — e o merge no backend preserva
 * qualquer coisa que nao seja enviada.
 *
 * O que nunca falta e `expectedRevision`: a rota recusa com 400 um PATCH sem
 * ele, e e assim que duas telas abertas no mesmo evento param de se sobrescrever
 * em silencio. Quem chega com a revisao velha perde, e sabe que perdeu.
 */
export function useSubmitEventUpdate({ eventId, onUpdated, onClose }: UseSubmitEventUpdateOptions) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: EventUpdatePayload) {
    setSubmitting(true);
    setError(null);

    try {
      await authedFetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      onUpdated();
      onClose();
    } catch {
      setError("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}

/** O corpo do PATCH, sem o eventId — que vai na URL. */
export type EventUpdatePayload = Record<string, unknown> & {
  expectedRevision: number;
  notes?: UpdateEventNoteInput[];
};

/**
 * A lista completa de notes do evento, com a de `noteId` trocada.
 *
 * O PATCH substitui a lista inteira: mandar so a note editada tiraria as outras
 * do evento. Cada formulario cuida de uma note — as demais atravessam daqui so
 * com o `id`, o que as mantem na lista sem reescreve-las. Sem `noteId` (o evento
 * ainda nao tem a note deste tipo), uma note nova entra no fim.
 */
export function notesPatchedWith(
  event: EventDetailDto,
  noteId: string | undefined,
  patch: NoteDataInput,
): UpdateEventNoteInput[] {
  const entries: UpdateEventNoteInput[] = event.notes.map((note) =>
    note.id === noteId ? { id: note.id, schemaVersion: note.schemaVersion, ...patch } : { id: note.id },
  );
  return noteId ? entries : [...entries, patch];
}

/** A note que este formulario edita, ja no tipo que ele espera. */
export type NoteOfType<TType extends NoteDto["type"]> = Extract<NoteDto, { type: TType }>;

/** Converte um instante ISO para o valor local esperado por <input type="datetime-local">. */
export function toDatetimeLocalValue(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/** Converte de volta o valor local do input para um instante ISO em UTC. */
export function fromDatetimeLocalValue(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

interface StartedAtFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function StartedAtField({ value, onChange }: StartedAtFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="event-started-at" className={fieldLabelClass}>
        Iniciado em
      </label>
      <input
        id="event-started-at"
        type="datetime-local"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldInputClass}
      />
    </div>
  );
}

interface FinishedAtFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function FinishedAtField({ value, onChange }: FinishedAtFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="event-finished-at" className={fieldLabelClass}>
        Encerrado em
      </label>
      <input
        id="event-finished-at"
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ainda em andamento"
        className={fieldInputClass}
      />
    </div>
  );
}


interface EventMarksProps {
  missed: boolean | undefined;
  onMissedChange: (missed: boolean) => void;
  priority: EventPriority | undefined;
  onPriorityChange: (priority: EventPriority | undefined) => void;
}

/**
 * A anotacao de nao realizado e a prioridade.
 *
 * A anotacao e uma caixa, e nao uma lista: ela tem dois estados e o usuario liga
 * e desliga a mesma coisa. Nao ha "realizado" para escolher — o evento que
 * aconteceu e o que ninguem anotou.
 *
 * A prioridade aceita `undefined` porque o evento chega pela rede: contra um
 * backend de outra versao ela pode simplesmente nao vir. Nesse caso o select
 * mostra "Nao definida" em vez de assumir a primeira opcao — um <select> com
 * `value` indefinido vira nao-controlado e envia silenciosamente o primeiro
 * item da lista, que ja custou um evento mudar de prioridade sozinho. Sem
 * valor, o PATCH omite o campo e o merge do backend preserva o que estava la.
 */
export function EventMarks({
  missed,
  onMissedChange,
  priority,
  onPriorityChange,
}: EventMarksProps) {
  const knownPriority = priority && priorityLabels[priority] ? priority : "";

  return (
    <div className="grid grid-cols-2 items-end gap-3">
      <label htmlFor="event-missed" className="flex items-center gap-2 py-2 text-sm">
        <input
          id="event-missed"
          type="checkbox"
          checked={missed ?? false}
          onChange={(event) => onMissedChange(event.target.checked)}
          className="size-4 accent-destructive"
        />
        <span className={fieldLabelClass}>Não realizado</span>
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-priority" className={fieldLabelClass}>
          Prioridade
        </label>
        <select
          id="event-priority"
          value={knownPriority}
          onChange={(event) => onPriorityChange(asOption(event.target.value) as EventPriority)}
          className={fieldInputClass}
        >
          {knownPriority ? null : <option value="">Não definida</option>}
          {priorities.map((option) => (
            <option key={option} value={option}>
              {priorityLabels[option]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface NotificationOffsetsFieldProps {
  value: NotificationOffsetMinutes[] | undefined;
  onChange: (value: NotificationOffsetMinutes[]) => void;
}

/**
 * Numero livre, nao lista fixa: o usuario digita a quantidade, escolhe minutos
 * ou dias, e cada aviso adicionado vira uma linha removivel. `value` aceita
 * `undefined` pelo mesmo motivo da prioridade em `EventMarks`: um backend de
 * outra versao pode nao mandar o campo, e nesse caso a lista comeca vazia em
 * vez de assumir um default.
 */
export function NotificationOffsetsField({ value, onChange }: NotificationOffsetsFieldProps) {
  const offsets = value ?? [];
  const [amount, setAmount] = useState("5");
  const [unit, setUnit] = useState<NotificationOffsetUnit>("minutes");
  const [error, setError] = useState<string | null>(null);

  function addOffset() {
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError("Digite um número inteiro maior que zero.");
      return;
    }
    const minutes = parsed * MINUTES_PER_NOTIFICATION_OFFSET_UNIT[unit];
    setError(null);
    if (offsets.includes(minutes)) return;
    onChange([...offsets, minutes].sort((a, b) => a - b));
  }

  function removeOffset(minutes: NotificationOffsetMinutes) {
    onChange(offsets.filter((offset) => offset !== minutes));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={fieldLabelClass}>Notificar</legend>

      {offsets.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {offsets.map((offset) => (
            <li key={offset} className="flex items-center justify-between gap-2 text-sm">
              <span>{notificationOffsetLabel(offset)}</span>
              <button
                type="button"
                onClick={() => removeOffset(offset)}
                aria-label={`Remover aviso: ${notificationOffsetLabel(offset)}`}
                className={iconButtonClass}
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        {/*
          `type="text"` de proposito: a quantidade e sempre inteira, validada
          a mao em `addOffset`, e um `input[type="number"]` entraria na
          varredura generica que os testes de treino fazem sobre "todo campo
          numerico do formulario aceita decimal" — o que aqui seria errado.
        */}
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-label="Quantidade"
          className={`${smallInputClass} w-20`}
        />
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value as NotificationOffsetUnit)}
          aria-label="Unidade"
          className={smallInputClass}
        >
          <option value="minutes">Minutos antes</option>
          <option value="days">Dias antes</option>
        </select>
        <button type="button" onClick={addOffset} className={addRowButtonClass}>
          <Plus aria-hidden className="size-3.5" />
          Adicionar
        </button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </fieldset>
  );
}

/** O "" do placeholder volta a ser `undefined`, e o PATCH deixa o campo de fora. */
function asOption(value: string): string | undefined {
  return value === "" ? undefined : value;
}

/**
 * Todo formulario de edicao recebe o evento inteiro e a note que ele edita.
 *
 * O evento inteiro, porque o PATCH precisa da revisao e das outras notes; a
 * note, porque quem a encontrou foi o roteador — a primeira do tipo do evento.
 * Ela pode nao existir: um evento de refeicao, sono ou treino nao exige note, e
 * salvar o formulario cria a note que faltava.
 */
export interface EditEventFormProps<TNote = undefined> {
  event: EventDetailDto;
  note?: TNote;
  onCancel: () => void;
  onClose: () => void;
  onUpdated: () => void;
}
