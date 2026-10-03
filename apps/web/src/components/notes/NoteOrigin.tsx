import { Clock, NotepadText, type LucideIcon } from "lucide-react";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import type { NoteDto } from "@/lib/api/contracts";
import { noteOriginLabel, primaryLinkOf } from "@/lib/notes/notes-model";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** O que prende a nota: o tipo do evento, a tarefa ou nada. A cor vem do `data-origin`. */
export function originOf(note: Pick<NoteDto, "links">): { Icon: LucideIcon; origin: string } {
  const link = primaryLinkOf(note);
  if (!link) return { Icon: NotepadText, origin: "loose" };
  if (link.kind === "task") return { Icon: Clock, origin: "task" };
  return { Icon: visualForItemType(link.eventKind ?? "").Icon, origin: link.eventKind ?? "routine" };
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
