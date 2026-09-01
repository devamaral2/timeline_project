/**
 * Limite de tentativas. Sem ele, senha e codigo de 2FA sao adivinhaveis por
 * forca bruta — 6 digitos caem em minutos.
 */
export interface RateLimiter {
  /**
   * Conta uma tentativa. Devolve `retryAfterSeconds > 0` quando a janela
   * estourou; nao lanca, para que quem chama decida o que fazer.
   */
  hit(params: {
    key: string;
    limit: number;
    windowSeconds: number;
    now?: Date;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;

  reset(key: string): Promise<void>;
}

/**
 * Janela deslizante em memoria.
 *
 * Serve para uma instancia. Com mais de um processo o limite passa a ser "N por
 * instancia", que ja e melhor que nada mas nao e o combinado — na hora de
 * escalar horizontalmente, esta e a peca que precisa virar Redis, e e por isso
 * que ela e uma porta e nao uma funcao solta.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  async hit(params: {
    key: string;
    limit: number;
    windowSeconds: number;
    now?: Date;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const now = (params.now ?? new Date()).getTime();
    const windowStart = now - params.windowSeconds * 1000;

    const recent = (this.hits.get(params.key) ?? []).filter((at) => at > windowStart);
    recent.push(now);
    this.hits.set(params.key, recent);

    if (recent.length <= params.limit) return { allowed: true, retryAfterSeconds: 0 };

    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + params.windowSeconds * 1000 - now) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }
}
