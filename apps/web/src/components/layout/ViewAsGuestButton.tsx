import { Eye } from "lucide-react";

export function ViewAsGuestButton() {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
    >
      <Eye aria-hidden className="size-4" />
      Ver como visitante
    </button>
  );
}
