import type { DailyReadingInput, DailyReadingResult } from "@repo/contracts";
import { dayKeyOf, zonedDayEnd, zonedDayStart } from "@repo/timeline";
import { planArtifactLinks } from "../../api-core/artifacts/artifact-targets";
import type { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { NO_RECURRENCES, type RecurrenceMaterializer } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { TASK_TIME_ZONE, type CreateTaskUseCase } from "../../api-core/tasks/create-task.usecase";
import { TaskValidationError, type Artifact, type Task } from "../../domain";
import type { ArtifactRepository, EntityBatchWriter, TaskCardQuery, TaskRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { DAILY_READING_TASK_NAME, composeReadingArticle, isDailyReadingName, readingSourceOf, type ReadingArticle } from "./daily-reading-article";

const AGENDA_PAGE = 100;
/** Um dia com mais páginas de agenda do que isto não existe; o teto só impede um laço sem fim. */
const AGENDA_PAGES_MAX = 10;

/**
 * Guarda uma página lida na tarefa "Leitura diária" do dia. A tarefa do dia é a
 * de pessoa com esse nome e início hoje (no fuso das tarefas): a ocorrência de
 * uma série, se a pessoa tem uma, ou a que esta rota criou mais cedo. Sem
 * nenhuma, ela nasce agora, de referência, junto com o artefato.
 *
 * Guardar de novo a mesma página no mesmo dia atualiza o artefato dela, não
 * cria outro.
 */
export class SaveDailyReadingUseCase {
  /** Duas páginas guardadas ao mesmo tempo esperam uma pela outra: sem isso, cada uma criaria a sua tarefa do dia. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly taskCardQuery: Pick<TaskCardQuery, "agenda">,
    private readonly taskRepository: Pick<TaskRepository, "findByIds">,
    private readonly artifactRepository: Pick<ArtifactRepository, "findByIds">,
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly createTask: Pick<CreateTaskUseCase, "prepare" | "save">,
    private readonly batchWriter: EntityBatchWriter,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  execute(input: DailyReadingInput, actor: AuthenticatedUser): Promise<DailyReadingResult> {
    const article = composeReadingArticle(input);
    if (!article) return Promise.reject(new TaskValidationError("Invalid url"));

    const previous = this.queues.get(actor.userId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.save(article, actor));
    this.queues.set(actor.userId, run);
    const release = () => {
      if (this.queues.get(actor.userId) === run) this.queues.delete(actor.userId);
    };
    run.then(release, release);
    return run;
  }

  private async save(article: ReadingArticle, actor: AuthenticatedUser): Promise<DailyReadingResult> {
    const now = this.clock();
    const artifactInput = { type: "text" as const, name: article.name, data: { body: article.body } };

    const task = await this.todayTask(actor.userId, now);
    if (!task) {
      // Tarefa e artefato numa transacao so, com a tarefa criando o artefato.
      const prepared = await this.createTask.prepare({ name: DAILY_READING_TASK_NAME, artifacts: [artifactInput] }, actor);
      await this.createTask.save(prepared);
      const [artifact] = prepared.artifacts;
      if (!artifact) throw new Error("Daily reading task was prepared without its artifact");
      return { taskId: prepared.task.id, artifactId: artifact.id, taskCreated: true, artifactCreated: true };
    }

    const saved = await this.articleOf(task, article.sourceUrl, actor.userId);
    if (saved) {
      const revised = saved.revise({ name: article.name, data: { body: article.body } });
      await this.batchWriter.commit({
        userId: actor.userId,
        tasks: [],
        artifacts: [{ op: "update", entity: revised, expectedRevision: saved.revision }],
      });
      return { taskId: task.id, artifactId: saved.id, taskCreated: false, artifactCreated: false };
    }

    const artifact = await this.artifactBuilder.fromCreateInput(artifactInput, actor.userId, now);
    const tasks = await planArtifactLinks(artifact.id, [], [task.id], this.taskRepository, actor.userId, "creates");
    await this.batchWriter.commit({ userId: actor.userId, tasks, artifacts: [{ op: "create", entity: artifact }] });
    return { taskId: task.id, artifactId: artifact.id, taskCreated: false, artifactCreated: true };
  }

  /** A "Leitura diária" de pessoa que começa hoje; com mais de uma, a que começa mais cedo. */
  private async todayTask(userId: string, now: Date): Promise<Task | undefined> {
    const today = dayKeyOf(now, TASK_TIME_ZONE);
    const from = zonedDayStart(today, TASK_TIME_ZONE);
    const to = zonedDayEnd(today, TASK_TIME_ZONE);
    // A ocorrencia de hoje de uma serie so existe depois de gerada.
    await this.recurrences.materialize(userId, to);

    const found: Task[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < AGENDA_PAGES_MAX; page++) {
      const result = await this.taskCardQuery.agenda({ userId, from, to, actor: "human", cursor, limit: AGENDA_PAGE });
      for (const { task } of result.items) {
        // A agenda traz tambem o que comecou antes e ainda toca o dia; a leitura do dia e a que comeca nele.
        if (task.startedAt && dayKeyOf(task.startedAt, TASK_TIME_ZONE) === today && isDailyReadingName(task.name)) found.push(task);
      }
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return found.sort((left, right) => (left.startedAt as Date).getTime() - (right.startedAt as Date).getTime())[0];
  }

  /** O artefato de texto da tarefa que guarda esta mesma página. */
  private async articleOf(task: Task, sourceUrl: string, userId: string): Promise<Artifact | undefined> {
    const ids = task.artifactLinks.map((link) => link.artifactId);
    if (ids.length === 0) return undefined;
    const artifacts = await this.artifactRepository.findByIds(ids);
    return artifacts.find(
      (artifact) =>
        artifact.userId === userId &&
        artifact.type === "text" &&
        readingSourceOf((artifact.data as { body: string }).body) === sourceUrl,
    );
  }
}
