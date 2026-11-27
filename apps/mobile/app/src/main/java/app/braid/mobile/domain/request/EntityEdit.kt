package app.braid.mobile.domain.request

import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.isFreeText

/*
 * A edição da entidade aberta pela IA (ADR 0006): port de `entity-edit-target.ts` do web. [code] é o `entityType` que
 * `POST /api/requests/edit` aceita e [target] o que a barra diz que vai editar. Conferido contra as fixtures geradas
 * pelo web (`EntityEditModelTest`).
 */
enum class EditEntityType(
    val code: String,
    val target: String,
) {
    Task("task", "esta tarefa"),
    Text("artifact", "esta nota"),
    Food("food_artifact", "esta refeição"),
    Sleep("sleep_artifact", "esta nota de sono"),
    Training("training_artifact", "este treino"),
    Skill("skill_artifact", "esta skill"),
    Agent("agent_artifact", "este agente"),
}

/**
 * O tipo que a barra manda para um artefato aberto; `null` quando ela não se mostra: artefato global (catálogo, sem
 * edição pelo app), roteador (o JEV o gerencia) e exercício (só existe no catálogo global).
 */
fun editEntityTypeOfArtifact(
    type: ArtifactType,
    global: Boolean,
): EditEntityType? {
    if (global) return null
    if (type.isFreeText) return EditEntityType.Text
    return when (type) {
        ArtifactType.Food -> EditEntityType.Food
        ArtifactType.Sleep -> EditEntityType.Sleep
        ArtifactType.Training -> EditEntityType.Training
        ArtifactType.Skill -> EditEntityType.Skill
        ArtifactType.Agent -> EditEntityType.Agent
        ArtifactType.Router, ArtifactType.Workout, ArtifactType.Unknown -> null
        // Os de texto livre já saíram acima; o ramo fica para o `when` seguir completo e o compilador apontar um tipo novo.
        ArtifactType.Text, ArtifactType.News, ArtifactType.EmailSummary, ArtifactType.YoutubeTranscript -> EditEntityType.Text
    }
}

/** "Peça uma mudança nesta tarefa": o "n" gruda no "esta"/"este" do alvo. */
fun editPlaceholder(type: EditEntityType): String = "Peça uma mudança n${type.target}"

/** O que o leitor de tela ouve na seção e no campo. */
fun editSectionLabel(type: EditEntityType): String = "Editar ${type.target} com IA"

fun editFieldLabel(type: EditEntityType): String = "Pedir à IA para editar ${type.target}"

private val ModelCommand = Regex("^/model$", RegexOption.IGNORE_CASE)

/**
 * O comando que abre a escolha do modelo nos campos do Hermes (o detalhe e o chat), que não mostram o modelo
 * (`isModelCommand` do web): `/model` sozinho no campo, sem diferença de caixa. Ele não vira pedido. `/modelo` é outro
 * comando, o do modo modelo do chat.
 */
fun isModelCommand(text: String): Boolean = ModelCommand.matches(text.trim())

/** Uma refeição ainda em cálculo não se edita. */
const val PENDING_MEAL_EDIT_TEXT = "Aguarde a geração da refeição para editar a nota."

const val EDIT_LOST_TEXT = "Perdi a conexão antes da resposta. Confira se a mudança foi feita antes de repetir."
const val EDIT_TIMEOUT_TEXT = "O pedido demorou demais. Confira se a mudança foi feita antes de repetir."

/** O texto de cada fase da barra enquanto o pedido anda; o web usa os mesmos nas telas de detalhe. */
const val EDIT_LISTENING_TEXT = "Ouvindo…"
