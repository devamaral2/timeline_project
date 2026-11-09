import { Bot, Clock, FileText, Route, Wrench, type LucideIcon } from "lucide-react";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import type { NoteDto, NoteLinkDto } from "@/lib/api/contracts";
import { noteOriginLabel, primaryLinkOf } from "@/lib/notes/notes-model";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** O que prende a nota a um alvo: o tipo do evento ou a tarefa. A cor vem do `data-origin`. */
export function originOfLink(link: NoteLinkDto): { Icon: LucideIcon; origin: string } {
  if (link.kind === "task") return { Icon: Clock, origin: "task" };
  return { Icon: visualForItemType(link.eventKind ?? "").Icon, origin: link.eventKind ?? "routine" };
}

/** O que prende a nota pela primeira vez: o alvo principal ou nada (nota solta). */
export function originOf(note: Pick<NoteDto, "links"> & Partial<Pick<NoteDto, "type">>): { Icon: LucideIcon; origin: string } {
  if (note.type === "skill") return { Icon: Wrench, origin: "hermes" };
  if (note.type === "agent") return { Icon: Bot, origin: "hermes" };
  if (note.type === "router") return { Icon: Route, origin: "hermes" };
  const link = primaryLinkOf(note);
  return link ? originOfLink(link) : { Icon: FileText, origin: "loose" };
}

export function NoteOrigin({ note }: { note: NoteDto }) {
  const { Icon } = originOf(note);
  return (
    <>
      <Icon {...icon} />
      <span>{noteOriginLabel(note)}</span>
    </>
  );
}
