import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EntityBatchWriter, TaskRepository } from "../../domain/ports";
import type { CreateArtifactRequest } from "@repo/contracts";
import { planArtifactLinks, uniqueIds } from "../../api-core/artifacts/artifact-targets";
import type { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { youtubeSaveOf } from "../../api-core/transcription/youtube-save";
import type { RequestTranscriptionUseCase } from "../request-transcription/request-transcription.usecase";

export class CreateArtifactUseCase {
  constructor(
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly taskRepository: Pick<TaskRepository, "findByIds">,
    private readonly batchWriter: EntityBatchWriter,
    private readonly clock: () => Date = () => new Date(),
    /** Guardar um vídeo do YouTube vira o pedido de transcrição (`youtubeSaveOf`); sem ele, nasce como veio. */
    private readonly transcribe?: Pick<RequestTranscriptionUseCase, "execute">,
  ) {}

  /**
   * O artefato e as tarefas em que ele ja nasce aparecendo entram numa
   * transacao so: ou ele nasce aparecendo onde foi pedido, ou nao nasce.
   */
  async execute(input: CreateArtifactRequest, actor: AuthenticatedUser): Promise<{ artifactId: string }> {
    const { taskIds, ...artifactInput } = input;
    const video = this.transcribe ? youtubeSaveOf(artifactInput.type, (artifactInput.data as { body?: unknown } | undefined)?.body) : null;
    if (video && this.transcribe) {
      // O documento do vídeo nasce na Leitura diária, como pela extensão; as tarefas pedidas também o mostram.
      const { artifactId } = await this.transcribe.execute({ url: video.url }, actor);
      const tasks = await planArtifactLinks(artifactId, [], uniqueIds(taskIds), this.taskRepository, actor.userId, "creates");
      if (tasks.length > 0) await this.batchWriter.commit({ userId: actor.userId, tasks, artifacts: [] });
      return { artifactId };
    }
    const artifact = await this.artifactBuilder.fromCreateInput(artifactInput, actor.userId, this.clock());
    // A tarefa em que o artefato nasce e o que o cria.
    const tasks = await planArtifactLinks(artifact.id, [], uniqueIds(taskIds), this.taskRepository, actor.userId, "creates");

    await this.batchWriter.commit({ userId: actor.userId, tasks: tasks, artifacts: [{ op: "create", entity: artifact }] });
    return { artifactId: artifact.id };
  }
}
