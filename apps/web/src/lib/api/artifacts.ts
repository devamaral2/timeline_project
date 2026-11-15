import type { ArtifactDto, ArtifactType, CreateArtifactRequest, UpdateArtifactRequest } from "@repo/contracts";
import { apiRequest, newIdempotencyKey } from "./client-request";

/** Edição: a rota leva o `artifactId`, então o corpo não o repete. `expectedRevision` vem do artefato lido. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EditArtifactInput = DistributiveOmit<UpdateArtifactRequest, "artifactId">;

/** Rota que cada função desta área chama, no formato do catálogo da API. `route-coverage.test.ts` confere. */
export const artifactsRoutes = {
  listArtifacts: "GET /api/artifacts",
  getArtifact: "GET /api/artifacts/{artifactId}",
  createArtifact: "POST /api/artifacts",
  editArtifact: "PATCH /api/artifacts/{artifactId}",
  deleteArtifact: "DELETE /api/artifacts/{artifactId}",
} as const;

export interface ArtifactFilters {
  type?: ArtifactType;
  /** `global` exige `type`: lista o catálogo global daquele tipo. */
  scope?: "global";
  tag?: string;
  q?: string;
  /** Só os artefatos que aparecem nesse evento. */
  eventId?: string;
  limit?: number;
}

/** Os artefatos do usuário (sem as cópias), ou o catálogo global com `scope: "global"`. */
export function listArtifacts(filters: ArtifactFilters = {}): Promise<ArtifactDto[]> {
  return apiRequest<ArtifactDto[]>("GET", "/api/artifacts", {
    query: {
      type: filters.type,
      scope: filters.scope,
      tag: filters.tag,
      q: filters.q,
      eventId: filters.eventId,
      limit: filters.limit,
    },
  });
}

export function getArtifact(artifactId: string): Promise<ArtifactDto> {
  return apiRequest<ArtifactDto>("GET", `/api/artifacts/${encodeURIComponent(artifactId)}`);
}

/** Devolve o id do artefato criado. Quem cria passa a chave de `newIdempotencyKey`, estável no formulário. */
export async function createArtifact(
  input: CreateArtifactRequest,
  options: { idempotencyKey: string },
): Promise<string> {
  const created = await apiRequest<{ artifactId: string }>("POST", "/api/artifacts", {
    body: input,
    idempotencyKey: options.idempotencyKey,
  });
  return created.artifactId;
}

export function editArtifact(artifactId: string, input: EditArtifactInput): Promise<void> {
  return apiRequest<void>("PATCH", `/api/artifacts/${encodeURIComponent(artifactId)}`, { body: input });
}

export function deleteArtifact(artifactId: string): Promise<void> {
  return apiRequest<void>("DELETE", `/api/artifacts/${encodeURIComponent(artifactId)}`);
}

export { newIdempotencyKey };
