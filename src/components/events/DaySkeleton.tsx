import { cn } from "@/lib/utils";

export function DaySkeleton({ variant }: { variant: "vertical" | "column" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse",
        variant === "column" ? "w-[300px] shrink-0 lg:w-[320px]" : "w-full",
      )}
    >
      <div className="mb-3 space-y-2">
        <div className="h-6 w-28 rounded-md bg-muted" />
        <div className="h-3.5 w-40 rounded-md bg-muted" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="h-4 w-2/3 rounded-md bg-muted" />
            <div className="mt-3 h-3 w-1/2 rounded-md bg-muted" />
            <div className="mt-3 h-3 w-1/3 rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
