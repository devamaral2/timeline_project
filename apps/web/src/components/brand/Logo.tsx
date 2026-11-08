import { cn } from "@/lib/utils";

/**
 * A assinatura: "Agente pessoal" na serifa, em uma cor so, sem simbolo.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("truncate font-display font-normal tracking-[-0.01em] text-foreground", className)}>
      Agente pessoal
    </span>
  );
}
