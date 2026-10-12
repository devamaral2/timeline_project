/**
 * Tempo de cada etapa de um turno do agente, para medir onde a latencia vai.
 * So numeros e nomes de etapa: nada do texto do usuario entra no log.
 */
export class TurnTimings {
  private readonly startedAt = performance.now();
  private readonly stages = new Map<string, number>();

  /** Acumula: uma etapa chamada varias vezes (cada leitura do dia) soma os tempos. */
  async time<T>(stage: string, run: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await run();
    } finally {
      this.stages.set(stage, (this.stages.get(stage) ?? 0) + (performance.now() - startedAt));
    }
  }

  summary(): Record<string, number> {
    const rounded = Object.fromEntries([...this.stages].map(([stage, ms]) => [`${stage}Ms`, Math.round(ms)]));
    return { totalMs: Math.round(performance.now() - this.startedAt), ...rounded };
  }
}
