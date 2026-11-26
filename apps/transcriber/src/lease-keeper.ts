import type { TranscriptionReservation, TranscriptionStage } from "@repo/contracts";
import type { Logger } from "./logger";
import { LeaseLostError, type WorkerApi } from "./ports";

/**
 * Mantém o lease do pedido enquanto o serviço trabalha: renova de tempos em tempos, mandando a etapa e a porcentagem
 * de agora, e de imediato quando a etapa muda. Se a API diz que o lease se perdeu (409), chama `onLost` e para: o
 * pedido já voltou à fila e outro trabalho sobre ele só seria jogado fora. Falha de rede ao renovar é só um aviso,
 * porque o lease dura 5 minutos e a próxima renovação pode dar certo.
 */
export class LeaseKeeper {
  private stage: TranscriptionStage = "metadata";
  private percent = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lost = false;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly api: WorkerApi,
    private readonly reservation: TranscriptionReservation,
    private readonly intervalMs: number,
    private readonly log: Logger,
    private readonly onLost: () => void,
  ) {}

  get isLost(): boolean {
    return this.lost;
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async report(stage: TranscriptionStage, percent: number): Promise<void> {
    this.stage = stage;
    this.percent = percent;
    await this.tick();
  }

  /** Uma renovação por vez: um tick que chega no meio de outra espera a anterior terminar. */
  tick(): Promise<void> {
    this.inFlight = this.inFlight.then(() => this.renew());
    return this.inFlight;
  }

  private async renew(): Promise<void> {
    if (this.lost) return;
    try {
      await this.api.renew({
        requestId: this.reservation.requestId,
        leaseToken: this.reservation.leaseToken,
        stage: this.stage,
        percent: this.percent,
      });
    } catch (cause) {
      if (cause instanceof LeaseLostError) {
        this.lost = true;
        this.stop();
        this.log.warn("o lease foi perdido, o pedido voltou à fila; parando o trabalho");
        this.onLost();
        return;
      }
      this.log.warn(`não consegui renovar o lease: ${cause instanceof Error ? cause.message : cause}`);
    }
  }
}
