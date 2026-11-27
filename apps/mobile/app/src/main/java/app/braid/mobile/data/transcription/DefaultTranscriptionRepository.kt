package app.braid.mobile.data.transcription

import app.braid.mobile.data.http.translatingStartFailures
import app.braid.mobile.domain.task.TaskChanges
import app.braid.mobile.domain.transcription.TranscriptionRepository
import app.braid.mobile.domain.transcription.TranscriptionRequest
import javax.inject.Inject

/** O pedido de transcrição pela API, com os erros traduzidos no código que o chat e o detalhe mostram. */
class DefaultTranscriptionRepository
    @Inject
    constructor(
        private val api: TranscriptionApi,
        private val changes: TaskChanges = TaskChanges(),
    ) : TranscriptionRepository {
        override suspend fun request(url: String): TranscriptionRequest {
            val result = translatingStartFailures { api.request(TranscriptionBody(url)) }
            // A Leitura diária voltou para a fazer: quem mostra tarefas relê, como o evento de atualização da agenda do web.
            changes.notifyChanged()
            return TranscriptionRequest(result.requestId, result.taskId, result.artifactId, result.created)
        }
    }
