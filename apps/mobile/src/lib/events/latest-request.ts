export interface LatestRequestToken {
  readonly id: number;
  readonly signal: AbortSignal;
}

/** Cancela a requisicao anterior e permite que apenas a mais recente publique estado. */
export class LatestRequest {
  private nextId = 0;
  private active?: {
    controller: AbortController;
    token: LatestRequestToken;
  };

  start(): LatestRequestToken {
    this.cancel();
    const controller = new AbortController();
    const token = { id: ++this.nextId, signal: controller.signal };
    this.active = { controller, token };
    return token;
  }

  isCurrent(token: LatestRequestToken): boolean {
    return this.active?.token === token && !token.signal.aborted;
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = undefined;
  }
}
