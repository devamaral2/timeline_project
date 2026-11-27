package app.braid.mobile.domain.request

import app.braid.mobile.domain.artifact.artifactTypeLabel
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.isCancelledAgentStatus
import app.braid.mobile.domain.task.isInterruptedAgentStatus
import app.braid.mobile.domain.task.isOpenAgentStatus
import app.braid.mobile.domain.task.isSuccessAgentStatus

/*
 * Port do modelo do pedido (`lib/tasks/agent-request-model.ts`), dos textos de falha (`agentFailureText`, em
 * `use-agent-chat.ts`) e dos nomes das entradas (`KIND_NAMES`, em `agent-trace.tsx`). Funções puras, conferidas
 * contra as fixtures geradas pelo web (`AgentRequestTextTest`).
 */

data class StepProgress(
    val done: Int,
    val total: Int,
)

/** Quantos passos terminaram e quantos há. */
fun stepProgress(steps: List<RequestStep>): StepProgress =
    StepProgress(done = steps.count { isSuccessAgentStatus(it.status) }, total = steps.size)

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

/** "Tarefa", o tipo do documento ("Nota", "Refeição"…) ou "Nota" quando o contrato não diz o tipo. */
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
        "interrupted" to "Pedido interrompido.",
        "internal" to "Algo deu errado. Tente de novo.",
        "connection_lost" to "A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar.",
        "connection_failed" to "Não consegui conectar ao assistente. Tente de novo.",
        "session_expired" to "Sua sessão acabou. Entre de novo para continuar.",
    )

/** O texto que o usuário lê para o código de falha de um pedido; sem código ou com um desconhecido, o de "internal". */
fun agentFailureText(code: String?): String = FAILURE_TEXTS[code ?: "internal"] ?: FAILURE_TEXTS.getValue("internal")

/** O código de fim do pedido que a pessoa cancelou ou que o servidor interrompeu; `null` para os demais status. */
fun endCode(status: TaskStatus?): String? =
    when {
        isCancelledAgentStatus(status) -> "cancelled"
        isInterruptedAgentStatus(status) -> "interrupted"
        else -> null
    }

/** O aviso do pedido cancelado ou interrompido ("Pedido cancelado."); `null` para os demais status. */
fun agentEndText(status: TaskStatus?): String? = endCode(status)?.let(::agentFailureText)

/** O mesmo aviso sem o ponto final, para a linha de estado ("Pedido cancelado"). */
fun agentEndLabel(status: TaskStatus?): String? = agentEndText(status)?.removeSuffix(".")

/** A linha de status do rodapé: o que o pedido que a tela acompanha está fazendo; `null` é "ainda sem o primeiro estado". */
fun requestStatusLine(tracked: AgentRequest?): String =
    when {
        tracked == null -> "Enviando o pedido…"
        isOpenAgentStatus(tracked.status) -> tracked.progress ?: runningStepLabel(tracked.steps) ?: "Entendendo o pedido…"
        isSuccessAgentStatus(tracked.status) -> "Pronto"
        tracked.status == TaskStatus.Failed -> "Não deu certo"
        else -> agentEndLabel(tracked.status) ?: "Esperando o seu pedido"
    }
