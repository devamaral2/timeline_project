package app.braid.mobile.ui.taskartifacts

import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.task.ArtifactSource
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.ui.picker.EntityPickerController
import app.braid.mobile.ui.picker.EntityPickerState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** A folha aberta: de onde vêm as escolhas (conforme o tipo da tarefa) e a busca. */
data class ArtifactPicker(
    val source: ArtifactSource,
    val search: EntityPickerState<Artifact> = EntityPickerState(),
)

/**
 * O seletor de documentos da tarefa, que serve à edição (a escolha vai para o rascunho) e ao detalhe (a escolha grava na
 * hora): abre com a fonte do tipo da tarefa, busca pelo texto e entrega o documento escolhido a quem abriu. Na refeição
 * as duas consultas (catálogo global e documentos próprios) saem juntas e as respostas se somam nessa ordem.
 */
class TaskArtifactPicker(
    private val scope: CoroutineScope,
    private val artifacts: ArtifactRepository,
) {
    private val mutableState = MutableStateFlow<ArtifactPicker?>(null)
    val state: StateFlow<ArtifactPicker?> = mutableState.asStateFlow()

    private var controller: EntityPickerController<Artifact>? = null
    private var mirrorJob: Job? = null
    private var onPick: (Artifact) -> Unit = {}

    /** Abre a folha para uma tarefa do tipo [kind]; [linkedIds] já ligados ficam fora da busca, menos na refeição. */
    fun open(
        kind: TaskKind,
        linkedIds: List<String>,
        onPick: (Artifact) -> Unit,
    ) {
        close()
        val source = ArtifactSource.of(kind)
        val linked = linkedIds.toSet()
        this.onPick = onPick
        val next =
            EntityPickerController(
                scope,
                search = { query -> search(source, query) },
                keep = { !source.hidesLinked || it.id !in linked },
            )
        controller = next
        mutableState.value = ArtifactPicker(source)
        mirrorJob = scope.launch { next.state.collect { search -> mutableState.update { it?.copy(search = search) } } }
    }

    fun type(text: String) {
        controller?.type(text)
    }

    /** Fecha sem escolher. */
    fun close() {
        controller?.close()
        mirrorJob?.cancel()
        controller = null
        mutableState.value = null
    }

    /** Entrega o documento escolhido a quem abriu a folha e a fecha. */
    fun pick(artifact: Artifact) {
        val deliver = onPick
        close()
        deliver(artifact)
    }

    private suspend fun search(
        source: ArtifactSource,
        query: String,
    ): List<Artifact> =
        coroutineScope {
            source
                .filters(query)
                .map { async { artifacts.list(it) } }
                .awaitAll()
                .flatten()
        }
}
