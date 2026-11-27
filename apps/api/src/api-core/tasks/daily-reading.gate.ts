import { dayKeyOf, zonedDayEnd, zonedDayStart, zonedTimeAt } from "@repo/timeline";
import type { ArtifactBuilder } from "../artifacts/services/artifact-builder.service";
import { NO_RECURRENCES, type RecurrenceMaterializer } from "../recurrences/materialize-recurrences.usecase";
import { TASK_TIME_ZONE, toEntityBatch, type CreateTaskUseCase } from "./create-task.usecase";
import type { Artifact, Task, TaskReviseChanges } from "../../domain";
import type { ArtifactRepository, EntityBatchWriter, StagedChange, TaskCardQuery } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { DAILY_READING_TASK_NAME, isDailyReadingName, readingSourceOf, type ReadingArticle } from "./daily-reading-article";

const AGENDA_PAGE = 100;
/** A hora do dia em que a leitura nova fica marcada. */
const DAILY_READING_TIME = "18:00";
/** Um dia com mais páginas de agenda do que isto não existe; o teto só impede um laço sem fim. */
const AGENDA_PAGES_MAX = 10;

/** Onde o artigo caiu: a leitura do dia e o artefato dele, e o que nasceu agora. */
export class PlacedArticle {
  readonly readingTaskId: string;
  /** A leitura do dia nasceu agora. */
  readonly readingCreated: boolean;
  readonly artifactId: string;
  /** `false`: o artefato da mesma fonte já estava na leitura e foi atualizado. */
  readonly artifactCreated: boolean;

  constructor(where: { readingTaskId: string; readingCreated: boolean; artifactId: string; artifactCreated: boolean }) {
    this.readingTaskId = where.readingTaskId;
    this.readingCreated = where.readingCreated;
    this.artifactId = where.artifactId;
    this.artifactCreated = where.artifactCreated;
  }

  /** O que a tarefa de agente que registra a gravação fez com o artefato: o criou ou o atualizou. */
  artifactRelation(): "creates" | "updates" {
    return this.artifactCreated ? "creates" : "updates";
  }

  /** O que a tarefa de agente que registra a gravação fez com a leitura do dia: a gerou ou a alterou. */
  readingRelation(): "generates" | "updates" {
    return this.readingCreated ? "generates" : "updates";
  }
}

/** O que o chamador grava na mesma transação que o artigo (a tarefa de agente que o registra, as relações dela, um job). */
export interface Companion {
  /** Tarefas novas do lote; entram depois da leitura e do artefato. */
  tasks?: StagedChange<Task>[];
  /** Roda depois de todas as tarefas e artefatos do lote, na transação do escritor. */
  afterWrite?: (tx: unknown) => Promise<void>;
}

export interface PlaceArticleInput {
  actor: AuthenticatedUser;
  article: ReadingArticle;
  /** O dia da leitura (`AAAA-MM-DD` no fuso das tarefas). Ausente, é hoje. */
  day?: string;
  /**
   * O documento que o chamador já tem para este artigo (o do pedido de transcrição). Se ele ainda existe na leitura, é
   * ele que é atualizado, mesmo que a linha da fonte já não esteja no texto; se sumiu, vale o reconhecimento pela fonte
   * e, sem ele, nasce outro (o chamador lê o id novo em `PlacedArticle`).
   */
  artifactId?: string;
  /** Recebe onde o artigo caiu, antes de gravar, e devolve o que entra no mesmo lote. */
  companion?: (placed: PlacedArticle) => Companion;
}

/**
 * A única porta para pôr conteúdo na tarefa "Leitura diária" (CONTEXT.md). A
 * leitura do dia é a de pessoa com esse nome e início no dia (no fuso das
 * tarefas): a ocorrência de uma série, se a pessoa tem uma, ou a que esta porta
 * criou mais cedo. Sem nenhuma, ela nasce a fazer, às 18h do dia, junto com o
 * artefato.
 *
 * O mesmo conteúdo é reconhecido pelo endereço canônico da linha da fonte: pôr
 * de novo atualiza o artefato dele, não cria outro. Pôr qualquer coisa numa
 * leitura que já existe a devolve para a fazer e apaga a conclusão: há o que ler
 * de novo, mesmo que ela já estivesse concluída.
 *
 * Quem a usa: a extensão (`SaveDailyReadingUseCase`) e o pedido de transcrição
 * de vídeo, no nascimento e na entrega.
 */
export class DailyReadingGate {
  /** Dois artigos postos ao mesmo tempo esperam um pelo outro: sem isso, cada um criaria a sua leitura do dia. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly taskCardQuery: Pick<TaskCardQuery, "agenda">,
    private readonly artifactRepository: Pick<ArtifactRepository, "findByIds">,
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly createTask: Pick<CreateTaskUseCase, "prepare">,
    private readonly batchWriter: EntityBatchWriter,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** O instante de agora, pelo relógio da porta. */
  now(): Date {
    return this.clock();
  }

  /** O dia de hoje, no fuso das tarefas. */
  today(): string {
    return dayKeyOf(this.clock(), TASK_TIME_ZONE);
  }

  place(input: PlaceArticleInput): Promise<PlacedArticle> {
    return this.exclusive(input.actor.userId, (placeNow) => placeNow(input));
  }

  /**
   * Para quem precisa olhar antes de pôr (o pedido repetido que não deve gravar
   * nada): `run` ocupa a vez da pessoa, e `placeNow` só vale dentro dele.
   */
  exclusive<T>(userId: string, run: (placeNow: (input: PlaceArticleInput) => Promise<PlacedArticle>) => Promise<T>): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(() => run((input) => this.placeNow(input)));
    this.queues.set(userId, result);
    const release = () => {
      if (this.queues.get(userId) === result) this.queues.delete(userId);
    };
    result.then(release, release);
    return result;
  }

  private async placeNow({ actor, article, day, artifactId, companion }: PlaceArticleInput): Promise<PlacedArticle> {
    const now = this.clock();
    const readingDay = day ?? dayKeyOf(now, TASK_TIME_ZONE);
    const artifactInput = { type: "text" as const, name: article.name, data: { body: article.body } };

    const reading = await this.readingOf(actor.userId, readingDay);
    if (!reading) {
      // Leitura e artefato numa transacao so, com a leitura criando o artefato.
      const prepared = await this.createTask.prepare(
        {
          name: DAILY_READING_TASK_NAME,
          status: "todo",
          startedAt: zonedTimeAt(readingDay, DAILY_READING_TIME, TASK_TIME_ZONE).toISOString(),
          artifacts: [artifactInput],
        },
        actor,
      );
      const [artifact] = prepared.artifacts;
      if (!artifact) throw new Error("Daily reading task was prepared without its artifact");
      const placed = new PlacedArticle({ readingTaskId: prepared.task.id, readingCreated: true, artifactId: artifact.id, artifactCreated: true });
      await this.commit(toEntityBatch(prepared), companion?.(placed));
      return placed;
    }

    const saved = await this.articleOf(reading, article.sourceUrl, actor.userId, artifactId);
    if (saved) {
      const revised = saved.revise({ name: article.name, data: { body: article.body } });
      const placed = new PlacedArticle({ readingTaskId: reading.id, readingCreated: false, artifactId: saved.id, artifactCreated: false });
      await this.commit(
        {
          userId: actor.userId,
          tasks: [backToTodo(reading, {}, now)],
          artifacts: [{ op: "update", entity: revised, expectedRevision: saved.revision }],
        },
        companion?.(placed),
      );
      return placed;
    }

    const artifact = await this.artifactBuilder.fromCreateInput(artifactInput, actor.userId, now);
    const artifactLinks = [...reading.artifactLinks, { artifactId: artifact.id, relation: "creates" as const, fromRecurrence: false }];
    const placed = new PlacedArticle({ readingTaskId: reading.id, readingCreated: false, artifactId: artifact.id, artifactCreated: true });
    await this.commit(
      {
        userId: actor.userId,
        tasks: [backToTodo(reading, { artifactLinks }, now)],
        artifacts: [{ op: "create", entity: artifact }],
      },
      companion?.(placed),
    );
    return placed;
  }

  private async commit(
    batch: Parameters<EntityBatchWriter["commit"]>[0],
    companion: Companion | undefined,
  ): Promise<void> {
    await this.batchWriter.commit({
      ...batch,
      tasks: [...batch.tasks, ...(companion?.tasks ?? [])],
      ...(companion?.afterWrite ? { afterWrite: companion.afterWrite } : {}),
    });
  }

  /** A "Leitura diária" de pessoa que começa no dia; com mais de uma, a que começa mais cedo. */
  private async readingOf(userId: string, day: string): Promise<Task | undefined> {
    const from = zonedDayStart(day, TASK_TIME_ZONE);
    const to = zonedDayEnd(day, TASK_TIME_ZONE);
    // A ocorrencia do dia de uma serie so existe depois de gerada.
    await this.recurrences.materialize(userId, to);

    const found: Task[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < AGENDA_PAGES_MAX; page++) {
      const result = await this.taskCardQuery.agenda({ userId, from, to, actor: "human", cursor, limit: AGENDA_PAGE });
      for (const { task } of result.items) {
        // A agenda traz tambem o que comecou antes e ainda toca o dia; a leitura do dia e a que comeca nele.
        if (task.startedAt && dayKeyOf(task.startedAt, TASK_TIME_ZONE) === day && isDailyReadingName(task.name)) found.push(task);
      }
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return found.sort((left, right) => (left.startedAt as Date).getTime() - (right.startedAt as Date).getTime())[0];
  }

  /** O artefato de texto da leitura que o chamador indicou ou, sem ele, o que guarda esta mesma fonte. */
  private async articleOf(reading: Task, sourceUrl: string, userId: string, preferredId?: string): Promise<Artifact | undefined> {
    const ids = reading.artifactLinks.map((link) => link.artifactId);
    if (ids.length === 0) return undefined;
    const texts = (await this.artifactRepository.findByIds(ids)).filter((artifact) => artifact.userId === userId && artifact.type === "text");
    return (
      texts.find((artifact) => artifact.id === preferredId) ??
      texts.find((artifact) => readingSourceOf((artifact.data as { body: string }).body) === sourceUrl)
    );
  }
}

/** A leitura com o que mudou nela, de volta a fazer e sem a hora de conclusão. */
function backToTodo(task: Task, changes: Pick<TaskReviseChanges, "artifactLinks">, now: Date): StagedChange<Task> {
  return { op: "update", entity: task.revise({ ...changes, status: "todo", finishedAt: null }, now), expectedRevision: task.revision };
}
