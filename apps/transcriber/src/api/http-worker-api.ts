import type {
  TranscriptionDeliveryInput,
  TranscriptionDeliveryResult,
  TranscriptionLeaseInput,
  TranscriptionLeaseResult,
  TranscriptionReservation,
} from "@repo/contracts";
import { DeliveryTooLargeError, LeaseLostError, WorkerAuthError, type WorkerApi } from "../ports";

const PREFIX = "/api/transcription-worker";
const QUICK_TIMEOUT_MS = 30_000;
/** A entrega pode levar alguns MB; dá mais tempo a ela. */
const DELIVERY_TIMEOUT_MS = 180_000;

/** As três operações do serviço local, por HTTP, com a chave de dispositivo no `Authorization: Bearer`. */
export class HttpWorkerApi implements WorkerApi {
  constructor(
    private readonly baseUrl: string,
    private readonly deviceKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async next(): Promise<TranscriptionReservation | null> {
    const response = await this.post("next", {}, QUICK_TIMEOUT_MS);
    if (response.status === 204) return null;
    return this.read<TranscriptionReservation>(response);
  }

  async renew(input: TranscriptionLeaseInput): Promise<TranscriptionLeaseResult> {
    return this.read(await this.post("lease", input, QUICK_TIMEOUT_MS));
  }

  async deliver(input: TranscriptionDeliveryInput): Promise<TranscriptionDeliveryResult> {
    return this.read(await this.post("deliver", input, DELIVERY_TIMEOUT_MS));
  }

  private post(operation: string, body: unknown, timeoutMs: number): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${PREFIX}/${operation}`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.deviceKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  private async read<T>(response: Response): Promise<T> {
    if (response.ok) return (await response.json()) as T;
    if (response.status === 401 || response.status === 403) throw new WorkerAuthError(response.status);
    if (response.status === 409) throw new LeaseLostError();
    if (response.status === 413) throw new DeliveryTooLargeError();
    // O corpo da resposta pode ser de um proxy e não interessa: só o status vai para o log.
    throw new Error(`a API respondeu HTTP ${response.status}`);
  }
}
