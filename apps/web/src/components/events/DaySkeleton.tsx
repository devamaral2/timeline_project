import { cn } from "@/lib/utils";

export function DaySkeleton({ variant }: { variant: "vertical" | "column" }) {
  return (
    <div
      aria-hidden
      className={variant === "column" ? "w-[300px] shrink-0 lg:w-[320px]" : "w-full"}
    >
      <div className="mb-3 space-y-2">
        <div className="shimmer h-6 w-28 rounded-md bg-muted" />
        <div className="shimmer h-3.5 w-40 rounded-md bg-muted" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={cn(
              "shimmer rounded-xl border border-border bg-card px-4 pb-3.5 pt-4 shadow-card",
              // O terceiro cartao ja entra apagando, para a lista nao terminar
              // num corte seco enquanto a proxima janela nao chega.
              index === 2 && "opacity-50",
            )}
          >
            <div className="h-4 w-2/3 rounded-md bg-muted" />
            <div className="mt-3 h-3 w-1/2 rounded-md bg-muted" />
            <div className="mt-3 h-3 w-1/3 rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
