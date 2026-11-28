/**
 * Tokens de injecao da composicao temporaria do Nest. Sao strings, e nao
 * symbols, porque o Nest os imprime tal qual na mensagem de erro quando um
 * provider nao resolve.
 *
 * As portas (`TaskRepository`, `TagRepository`, ...) sao interfaces e nao
 * existem em runtime: por isso quem as consome precisa de `@Inject(TOKEN)`
 * explicito. Quando o composition root do Fastify chegar, estes tokens somem
 * junto com o Nest; as portas e os adaptadores continuam.
 */
export const DATABASE = "DATABASE";
export const TASK_REPOSITORY = "TASK_REPOSITORY";
export const TASK_CARD_QUERY = "TASK_CARD_QUERY";
export const TASK_REQUEST_LINK_QUERY = "TASK_REQUEST_LINK_QUERY";
export const PROJECT_QUERY = "PROJECT_QUERY";
export const PROJECT_REPOSITORY = "PROJECT_REPOSITORY";
export const TAG_REPOSITORY = "TAG_REPOSITORY";
export const ARTIFACT_REPOSITORY = "ARTIFACT_REPOSITORY";
export const ARTIFACT_TASK_LINK_QUERY = "ARTIFACT_TASK_LINK_QUERY";
export const WORKOUT_CATALOG = "WORKOUT_CATALOG";
export const RECURRENCE_REPOSITORY = "RECURRENCE_REPOSITORY";
export const SCOPED_SQL_QUERY = "SCOPED_SQL_QUERY";
export const ENTITY_BATCH_WRITER = "ENTITY_BATCH_WRITER";
export const IDEMPOTENCY_STORE = "IDEMPOTENCY_STORE";
export const TRANSCRIPTION_REQUESTS = "TRANSCRIPTION_REQUESTS";
export const TASK_RELATIONS = "TASK_RELATIONS";
