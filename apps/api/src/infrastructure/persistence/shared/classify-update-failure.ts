export interface UpdateFailureErrors {
  notFound(): Error;
  ownership(): Error;
  conflict(message: string): Error;
}

/**
 * Uma UPDATE condicional (id + userId + revision) que afetou zero linhas pode
 * ter falhado por tres motivos distintos — registro inexistente, dono errado,
 * ou revisao desatualizada. Esta funcao recebe a linha atual (ou undefined) e
 * decide qual dos tres levantar, para nao duplicar essa logica em cada
 * repositorio.
 */
export function classifyUpdateFailure(
  existing: { userId: string; revision: number } | undefined,
  actorUserId: string,
  expectedRevision: number,
  errors: UpdateFailureErrors,
): never {
  if (!existing) {
    throw errors.notFound();
  }
  if (existing.userId !== actorUserId) {
    throw errors.ownership();
  }
  throw errors.conflict(`Expected revision ${expectedRevision} but found ${existing.revision}`);
}
