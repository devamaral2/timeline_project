import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { outlineButtonClass } from "@/components/ui/button-styles";

export function ViewAsGuestButton() {
  return (
    <button
      type="button"
      className={cn(outlineButtonClass, "text-muted-foreground")}
    >
      <Eye aria-hidden className="size-4" />
      Ver como visitante
    </button>
  );
}
