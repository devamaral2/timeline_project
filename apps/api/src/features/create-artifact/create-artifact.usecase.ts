import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EntityBatchWriter, EventRepository } from "../../domain/ports";
import type { CreateArtifactRequest } from "@repo/contracts";
import { planArtifactLinks, uniqueIds } from "../../api-core/artifacts/artifact-targets";
import type { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";

export class CreateArtifactUseCase {
  constructor(
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly eventRepository: Pick<EventRepository, "findByIds">,
    private readonly batchWriter: EntityBatchWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * O artefato e os eventos em que ele ja nasce aparecendo entram numa
   * transacao so: ou ele nasce aparecendo onde foi pedido, ou nao nasce.
   */
  async execute(input: CreateArtifactRequest, actor: AuthenticatedUser): Promise<{ artifactId: string }> {
    const { taskIds, ...artifactInput } = input;
    const artifact = await this.artifactBuilder.fromCreateInput(artifactInput, actor.userId, this.clock());
    // O evento em que o artefato nasce e o que o cria.
    const events = await planArtifactLinks(artifact.id, [], uniqueIds(taskIds), this.eventRepository, actor.userId, "creates");

    await this.batchWriter.commit({ userId: actor.userId, tasks: events, artifacts: [{ op: "create", entity: artifact }] });
    return { artifactId: artifact.id };
  }
}
