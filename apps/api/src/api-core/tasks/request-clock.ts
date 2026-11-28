import { getCurrentJob } from "../../infrastructure/jobs/job-context";

/** A espera na fila e as novas tentativas nao podem mudar o que "hoje" ou "agora" queriam dizer no envio. */
export function requestClock(): Date {
  const submittedAt = getCurrentJob()?.createdAt;
  return submittedAt ? new Date(submittedAt) : new Date();
}
