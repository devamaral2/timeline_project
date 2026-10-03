import { Clock, NotepadText, type LucideIcon } from "lucide-react";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import type { NoteDto } from "@/lib/api/contracts";
import { noteOriginLabel } from "@/lib/notes/notes-model";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** O que prende a nota: o tipo do evento, a tarefa ou nada. A cor vem do `data-origin`. */
export function originOf(note: Pick<NoteDto, "link">): { Icon: LucideIcon; origin: string } {
  const link = note.link;
  if (!link) return { Icon: NotepadText, origin: "loose" };
  if (link.kind === "task") return { Icon: Clock, origin: "task" };
  return { Icon: visualForItemType(link.eventType ?? "").Icon, origin: link.eventType ?? "routine" };
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
