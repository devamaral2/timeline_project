import { Plus } from "lucide-react";

export function NewEventButton() {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
    >
      <Plus aria-hidden className="size-4" />
      Novo evento
    </button>
  );
}
