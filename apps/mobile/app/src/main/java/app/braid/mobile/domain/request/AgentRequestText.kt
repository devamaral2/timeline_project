package app.braid.mobile.domain.request

import app.braid.mobile.domain.artifact.artifactTypeLabel
import app.braid.mobile.domain.task.TaskStatus

/*
 * Port do modelo do pedido (`lib/tasks/agent-request-model.ts`), dos textos de falha (`agentFailureText`, em
 * `use-agent-chat.ts`) e dos nomes das entradas (`KIND_NAMES`, em `agent-trace.tsx`). Funções puras, conferidas
 * contra as fixtures geradas pelo web (`AgentRequestTextTest`).
 */

private val OPEN_REQUEST_STATUSES = setOf(TaskStatus.Queued, TaskStatus.Running, TaskStatus.Waiting, TaskStatus.AwaitingTranscription)

/** Fila, execução, espera do usuário ou da transcrição: a tela continua relendo. */
fun isOpenRequest(status: TaskStatus): Boolean = status in OPEN_REQUEST_STATUSES

data class StepProgress(
    val done: Int,
    val total: Int,
)

/** Quantos passos terminaram e quantos há. */
fun stepProgress(steps: List<RequestStep>): StepProgress =
    StepProgress(done = steps.count { it.status == TaskStatus.Done }, total = steps.size)

/** O texto do passo que está executando agora, quando há um. */
fun runningStepLabel(steps: List<RequestStep>): String? = steps.firstOrNull { it.status == TaskStatus.Running }?.label

/** O resumo que o servidor escreveu ou, sem ele, o rótulo. */
fun entryText(entry: TraceEntry): String = entry.summary ?: entry.label

fun entityOperationLabel(operation: RequestOperation): String =
    when (operation) {
        RequestOperation.Create -> "criado"
        RequestOperation.Update -> "alterado"
        RequestOperation.Delete -> "apagado"
    }

/** "Tarefa", o tipo do artefato ("Nota", "Refeição"…) ou "Nota" quando o contrato não diz o tipo. */
fun entityKindLabel(entity: RequestEntity): String {
    if (entity.kind == EntityKind.Task) return "Tarefa"
    return entity.artifactType?.let(::artifactTypeLabel) ?: "Nota"
}

/** Os nomes dos tipos de entrada, os mesmos da aba "Processo" do chat. */
fun traceKindName(kind: TraceKind): String =
    when (kind) {
        TraceKind.Request -> "Pedido"
        TraceKind.Routing -> "Roteamento"
        TraceKind.Thought -> "Raciocínio"
        TraceKind.Agent -> "Agente"
        TraceKind.Tool -> "Ferramenta"
        TraceKind.Message -> "Comentário"
        TraceKind.Answer -> "Resposta"
    }

private val FAILURE_TEXTS =
    mapOf(
        "invalid_input" to "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
        "forbidden" to "Você não tem permissão para acessar esses dados.",
        "limit_reached" to "O pedido ficou grande demais e nada foi gravado. Tente dividir em partes menores.",
        "conflict" to "Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo.",
        "unavailable" to "A IA está indisponível agora. Tente de novo em instantes.",
        "cancelled" to "Pedido cancelado.",
        "internal" to "Algo deu errado. Tente de novo.",
        "connection_lost" to "A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar.",
        "connection_failed" to "Não consegui conectar ao assistente. Tente de novo.",
        "session_expired" to "Sua sessão acabou. Entre de novo para continuar.",
    )

/** O texto que o usuário lê para o código de falha de um pedido; sem código ou com um desconhecido, o de "internal". */
fun agentFailureText(code: String?): String = FAILURE_TEXTS[code ?: "internal"] ?: FAILURE_TEXTS.getValue("internal")

/** A linha de status do rodapé: o que o pedido que a tela acompanha está fazendo; `null` é "ainda sem o primeiro estado". */
fun requestStatusLine(tracked: AgentRequest?): String =
    when {
        tracked == null -> "Enviando o pedido…"
        isOpenRequest(tracked.status) -> tracked.progress ?: runningStepLabel(tracked.steps) ?: "Entendendo o pedido…"
        tracked.status == TaskStatus.Done -> "Pronto"
        tracked.status == TaskStatus.Failed -> "Não deu certo"
        tracked.status == TaskStatus.Cancel -> "Pedido cancelado"
        else -> "Esperando o seu pedido"
    }
