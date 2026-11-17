export type AgendaScrollBoundary = "previous" | "next";

export function agendaScrollBoundaryFromAttempt({ deltaY, scrollY, viewportHeight, documentHeight }: {
  deltaY: number;
  scrollY: number;
  viewportHeight: number;
  documentHeight: number;
}): AgendaScrollBoundary | null {
  if (deltaY < 0 && scrollY <= 1) return "previous";
  if (deltaY > 0 && scrollY + viewportHeight >= documentHeight - 1) return "next";
  return null;
}
