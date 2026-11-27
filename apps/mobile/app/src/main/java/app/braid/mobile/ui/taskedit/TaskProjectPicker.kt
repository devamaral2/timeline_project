package app.braid.mobile.ui.taskedit

import app.braid.mobile.domain.project.InvalidProjectNameException
import app.braid.mobile.domain.project.Project
import app.braid.mobile.domain.project.ProjectNameTakenException
import app.braid.mobile.domain.project.ProjectRepository
import app.braid.mobile.domain.project.searchProjects
import app.braid.mobile.ui.picker.EntityPickerController
import app.braid.mobile.ui.picker.EntityPickerState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

const val PROJECT_SEARCH_FAILED = "Não foi possível buscar os projetos. Tente de novo."
const val PROJECT_NAME_TAKEN = "Já existe um projeto com esse nome. Escolha-o na lista ou use outro nome."
const val PROJECT_NAME_INVALID = "O nome do projeto tem de 1 a 60 caracteres."
const val PROJECT_CREATE_FAILED = "Não foi possível criar o projeto. Tente de novo."
const val PROJECT_CREATE_HINT = "Escreva na busca o nome do projeto novo."

/** O rodapé da folha: a criação de um projeto novo com o texto da busca. */
sealed interface ProjectFooter {
    data object Idle : ProjectFooter

    data object Creating : ProjectFooter

    data class Failed(
        val message: String,
    ) : ProjectFooter
}

/** A folha aberta: a busca e o rodapé de criação. */
data class ProjectPicker(
    val search: EntityPickerState<Project> = EntityPickerState(),
    val footer: ProjectFooter = ProjectFooter.Idle,
)

/**
 * A escolha do projeto da tarefa (o `ProjectPickerDialog` do web): a folha de seleção com a lista (`diario` primeiro, os
 * outros por nome), a busca pelo nome e, embaixo, a criação de um projeto com o texto digitado. Escolher ou criar entrega
 * o projeto a quem abriu a folha e a fecha; um nome repetido mostra a mensagem e deixa a folha aberta.
 */
class TaskProjectPicker(
    private val scope: CoroutineScope,
    private val projects: ProjectRepository,
) {
    private val mutableState = MutableStateFlow<ProjectPicker?>(null)
    val state: StateFlow<ProjectPicker?> = mutableState.asStateFlow()

    private var controller: EntityPickerController<Project>? = null
    private var mirrorJob: Job? = null
    private var createJob: Job? = null
    private var onPick: (Project) -> Unit = {}

    fun open(onPick: (Project) -> Unit) {
        close()
        this.onPick = onPick
        val next = EntityPickerController(scope, search = { query -> searchProjects(projects.list(), query) })
        controller = next
        mutableState.value = ProjectPicker()
        mirrorJob = scope.launch { next.state.collect { search -> mutableState.update { it?.copy(search = search) } } }
    }

    fun type(text: String) {
        controller?.type(text)
        // Digitar de novo tira o aviso da tentativa anterior.
        mutableState.update { picker ->
            if (picker != null &&
                picker.footer is ProjectFooter.Failed
            ) {
                picker.copy(footer = ProjectFooter.Idle)
            } else {
                picker
            }
        }
    }

    /** Fecha sem escolher. */
    fun close() {
        controller?.close()
        mirrorJob?.cancel()
        createJob?.cancel()
        controller = null
        mutableState.value = null
    }

    /** Entrega o projeto escolhido a quem abriu a folha e a fecha. */
    fun pick(project: Project) {
        val deliver = onPick
        close()
        deliver(project)
    }

    /** "Criar “texto”": cria o projeto com o texto da busca e o escolhe. Sem texto, ou já criando, não faz nada. */
    fun create() {
        val picker = mutableState.value ?: return
        // O texto vem da própria busca: o espelho dela em [state] pode ainda não ter o que acabou de ser digitado.
        val name =
            controller
                ?.state
                ?.value
                ?.typed
                ?.trim()
                .orEmpty()
        if (name.isEmpty() || picker.footer is ProjectFooter.Creating) return
        mutableState.update { it?.copy(footer = ProjectFooter.Creating) }
        createJob =
            scope.launch {
                try {
                    pick(projects.create(name))
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (taken: ProjectNameTakenException) {
                    fail(PROJECT_NAME_TAKEN)
                } catch (invalid: InvalidProjectNameException) {
                    fail(PROJECT_NAME_INVALID)
                } catch (failure: Exception) {
                    fail(PROJECT_CREATE_FAILED)
                }
            }
    }

    private fun fail(message: String) = mutableState.update { it?.copy(footer = ProjectFooter.Failed(message)) }
}
