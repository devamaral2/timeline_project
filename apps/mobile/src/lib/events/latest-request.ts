export interface LatestRequestToken {
  readonly id: number;
  readonly signal: AbortSignal;
}

/** Cancela a requisicao anterior e permite que apenas a mais recente publique estado. */
export class LatestRequest {
  private nextId = 0;
  private running?: {
    controller: AbortController;
    token: LatestRequestToken;
  };

  start(): LatestRequestToken {
    this.cancel();
    const controller = new AbortController();
    const token = { id: ++this.nextId, signal: controller.signal };
    this.running = { controller, token };
    return token;
  }

  /**
   * O token da busca aberta, ou `undefined` antes do primeiro `start`.
   *
   * Quem pede a proxima pagina do dia que ja esta na tela entra por aqui: essa
   * busca estende a atual em vez de substitui-la — `start` cancelaria a que
   * trouxe os cartoes de agora —, mas precisa ser descartada junto com ela
   * quando a pessoa troca de dia.
   */
  active(): LatestRequestToken | undefined {
    return this.running?.token;
  }

  isCurrent(token: LatestRequestToken): boolean {
    return this.running?.token === token && !token.signal.aborted;
  }

  cancel(): void {
    this.running?.controller.abort();
    this.running = undefined;
  }
}
