import type { TranscriptionDeliveryInput, TranscriptionReservation } from "@repo/contracts";
import { LeaseKeeper } from "./lease-keeper";
import type { Logger } from "./logger";
import {
  DeliveryTooLargeError,
  type Diarizer,
  LeaseLostError,
  WorkerAuthError,
  type AudioStore,
  type Whisper,
  type WorkerApi,
  type YtDlp,
} from "./ports";
import { type Limits, processRequest } from "./process-request";

export interface ServiceConfig {
  limits: Limits;
  /** O intervalo entre buscas quando a fila está vazia. */
  pollMs: number;
  /** O teto do recuo quando a busca falha. */
  maxBackoffMs: number;
  /** De quanto em quanto tempo renovar o lease enquanto trabalha (o lease dura 5 min). */
  leaseRenewMs: number;
  /** De quanto em quanto tempo limpar o cache. */
  cleanupIntervalMs: number;
  /** A espera antes de cada nova tentativa de entrega; o tamanho da lista é o número de repetições. */
  deliveryRetryDelaysMs: number[];
}

export interface ServiceDeps {
  api: WorkerApi;
  ytdlp: YtDlp;
  whisper: Whisper;
  diarizer: Diarizer;
  cache: AudioStore & { cleanup(now: Date): Promise<string[]> };
  log: Logger;
  config: ServiceConfig;
  now(): Date;
  /** Dorme `ms`; acorda antes se `signal` abortar. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

/**
 * O laço do serviço local: um pedido por vez, do pedido reservado à entrega. Se o computador desliga, o serviço
 * morre, ou o lease se perde, nada é entregue: o lease vence e a API devolve o pedido à fila.
 */
export class TranscriberService {
  private lastCleanup: Date | null = null;

  constructor(private readonly deps: ServiceDeps) {}

  /** Ao subir: atualiza o `yt-dlp` e limpa o cache. Nenhum dos dois impede o serviço de trabalhar. */
  async startup(signal: AbortSignal): Promise<void> {
    const { log, ytdlp } = this.deps;
    log.info("subindo o serviço de transcrição");
    try {
      await ytdlp.update(signal);
      log.info("yt-dlp atualizado");
    } catch (cause) {
      log.warn(`não consegui atualizar o yt-dlp, sigo com o que está instalado: ${describe(cause)}`);
    }
    await this.cleanCache();
  }

  async run(signal: AbortSignal): Promise<void> {
    await this.startup(signal);
    let failures = 0;
    while (!signal.aborted) {
      const result = await this.runOnce(signal);
      if (result === "handled") {
        failures = 0;
      } else if (result === "idle") {
        failures = 0;
        await this.deps.sleep(this.deps.config.pollMs, signal);
      } else {
        const wait = Math.min(this.deps.config.pollMs * 2 ** failures, this.deps.config.maxBackoffMs);
        failures += 1;
        await this.deps.sleep(wait, signal);
      }
    }
    this.deps.log.info("serviço parado");
  }

  /** Uma volta: limpa o cache se já é hora, busca um pedido e o trata. */
  async runOnce(signal: AbortSignal): Promise<"idle" | "handled" | "error"> {
    const { api, log, config, now } = this.deps;
    if (!this.lastCleanup || now().getTime() - this.lastCleanup.getTime() >= config.cleanupIntervalMs) await this.cleanCache();

    let reservation: TranscriptionReservation | null;
    try {
      reservation = await api.next();
    } catch (cause) {
      if (cause instanceof WorkerAuthError) log.error(`${cause.message}; confira a chave no 1Password (ela pode ter sido revogada)`);
      else log.warn(`não consegui buscar pedidos: ${describe(cause)}`);
      return "error";
    }
    if (!reservation) return "idle";

    await this.handle(reservation, signal);
    return "handled";
  }

  private async cleanCache(): Promise<void> {
    const { cache, log, now } = this.deps;
    this.lastCleanup = now();
    try {
      const removed = await cache.cleanup(this.lastCleanup);
      log.info(removed.length > 0 ? `cache limpo: ${removed.length} arquivo(s) com mais de 7 dias apagado(s)` : "cache sem nada vencido");
    } catch (cause) {
      log.warn(`não consegui limpar o cache: ${describe(cause)}`);
    }
  }

  private async handle(reservation: TranscriptionReservation, shutdown: AbortSignal): Promise<void> {
    const { api, ytdlp, whisper, diarizer, cache, config, now } = this.deps;
    const log = this.deps.log.child(`[pedido ${reservation.requestId}]`);
    log.info(`pedido reservado: ${reservation.url}`);

    const work = new AbortController();
    const stopOnShutdown = () => work.abort();
    shutdown.addEventListener("abort", stopOnShutdown, { once: true });
    const keeper = new LeaseKeeper(api, reservation, config.leaseRenewMs, log, () => work.abort());
    keeper.start();

    try {
      const outcome = await processRequest(
        reservation.url,
        { ytdlp, whisper, diarizer, audio: cache, log, limits: config.limits, report: (stage, percent) => keeper.report(stage, percent), now },
        work.signal,
      );
      keeper.stop();

      if (outcome.kind === "abandoned") {
        log.warn(
          keeper.isLost
            ? "o pedido já tinha voltado à fila; nada a entregar"
            : "trabalho interrompido; o pedido volta à fila quando o lease vencer",
        );
        return;
      }
      if (outcome.kind === "failed") {
        log.error(`falhou (${outcome.code}): ${outcome.detail}`);
        await this.deliver({ requestId: reservation.requestId, leaseToken: reservation.leaseToken, outcome: "failed", code: outcome.code }, log);
        return;
      }
      log.info(`transcrição pronta: ${outcome.result.segments.length} fala(s), ${outcome.result.comments.length} comentário(s)`);
      await this.deliver(
        { requestId: reservation.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: outcome.result },
        log,
      );
    } finally {
      keeper.stop();
      shutdown.removeEventListener("abort", stopOnShutdown);
    }
  }

  /** Entrega com repetição para falha de rede. Sem conseguir, o pedido volta à fila quando o lease vencer. */
  private async deliver(input: TranscriptionDeliveryInput, log: Logger): Promise<void> {
    const { api, config, sleep } = this.deps;
    const never = new AbortController().signal;
    let current = input;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await api.deliver(current);
        log.info(
          result.status === "running"
            ? "entregue; a API está formatando o documento"
            : `entregue; a API encerrou o pedido com ${result.code}`,
        );
        return;
      } catch (cause) {
        if (cause instanceof LeaseLostError) {
          log.warn("não deu para entregar: o lease já tinha sido perdido e o pedido voltou à fila");
          return;
        }
        if (cause instanceof WorkerAuthError) {
          log.error(`${cause.message}; nada entregue, o pedido volta à fila quando o lease vencer`);
          return;
        }
        if (cause instanceof DeliveryTooLargeError && current.outcome === "completed") {
          log.error("a entrega passou do tamanho que o gateway aceita; encerrando o pedido como too_large");
          current = { requestId: input.requestId, leaseToken: input.leaseToken, outcome: "failed", code: "too_large" };
          continue;
        }
        const delay = config.deliveryRetryDelaysMs[attempt];
        if (delay === undefined) {
          log.error(`não consegui entregar (${describe(cause)}); o pedido volta à fila quando o lease vencer`);
          return;
        }
        log.warn(`falha ao entregar (${describe(cause)}); tentando de novo`);
        await sleep(delay, never);
      }
    }
  }
}

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
