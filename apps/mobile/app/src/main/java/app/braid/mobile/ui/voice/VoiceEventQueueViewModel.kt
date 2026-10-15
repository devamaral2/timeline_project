package app.braid.mobile.ui.voice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.AiJobDto
import app.braid.mobile.data.events.EventErrorKind
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.data.events.VoiceEventGateway
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class VoiceJob(
    val id: String,
    val transcript: String,
    val status: VoiceJobStatus = VoiceJobStatus.Pending,
    val error: String? = null,
    val progress: String? = null,
    val serverJob: AiJobDto? = null,
)

enum class VoiceJobStatus {
    Pending,
    Error,
}

sealed interface VoiceQueueEvent {
    data object Drained : VoiceQueueEvent
}

@HiltViewModel
class VoiceEventQueueViewModel
    @Inject
    constructor(
        private val gateway: VoiceEventGateway,
    ) : ViewModel() {
        private val mutableJobs = MutableStateFlow<List<VoiceJob>>(emptyList())
        private val mutableEvents = Channel<VoiceQueueEvent>(Channel.BUFFERED)
        private val observing = mutableSetOf<String>()

        val jobs: StateFlow<List<VoiceJob>> = mutableJobs.asStateFlow()
        val events = mutableEvents.receiveAsFlow()

        init {
            viewModelScope.launch {
                val recovered = runCatching { gateway.recover() }.getOrDefault(emptyList())
                mutableJobs.value =
                    (mutableJobs.value + recovered.map { VoiceJob(it.id, it.request?.text.orEmpty(), progress = it.progress, serverJob = it) })
                        .distinctBy { it.serverJob?.request?.clientMessageId ?: it.id }
                drain()
            }
        }

        fun enqueue(transcript: String) {
            val normalized = transcript.trim()
            if (normalized.isEmpty()) return
            mutableJobs.value = mutableJobs.value + VoiceJob(UUID.randomUUID().toString(), normalized)
            drain()
        }

        fun retry(jobId: String) {
            mutableJobs.value =
                mutableJobs.value.map { job ->
                    if (job.id == jobId && job.status == VoiceJobStatus.Error) {
                        job.copy(id = UUID.randomUUID().toString(), status = VoiceJobStatus.Pending, error = null, serverJob = null)
                    } else {
                        job
                    }
                }
            drain()
        }

        fun dismiss(jobId: String) {
            // Dismiss hides only a terminal error; it never cancels accepted work.
            mutableJobs.value = mutableJobs.value.filterNot { it.id == jobId && it.status == VoiceJobStatus.Error }
        }

        private fun drain() {
            // Submit every transcript promptly; execution ordering belongs to the durable server queue.
            mutableJobs.value.filter { it.status == VoiceJobStatus.Pending && it.id !in observing }.forEach { job ->
                observing.add(job.id)
                viewModelScope.launch {
                    try {
                        val progress: (String?) -> Unit = { label ->
                            mutableJobs.value = mutableJobs.value.map { if (it.id == job.id) it.copy(progress = label) else it }
                        }
                        val result =
                            job.serverJob?.let { gateway.resume(it, progress) }
                                ?: gateway.create(job.transcript, job.id, progress)
                        when (result) {
                            is EventResult.Success -> {
                                mutableJobs.value = mutableJobs.value.filterNot { it.id == job.id }
                            }
                            is EventResult.Failure -> {
                                mutableJobs.value =
                                    mutableJobs.value.map { current ->
                                        if (current.id == job.id) {
                                            current.copy(status = VoiceJobStatus.Error, error = messageOf(result.error))
                                        } else {
                                            current
                                        }
                                    }
                            }
                        }
                    } finally {
                        observing.remove(job.id)
                    }
                    if (mutableJobs.value.isEmpty()) mutableEvents.trySend(VoiceQueueEvent.Drained)
                }
            }
        }

        private fun messageOf(error: app.braid.mobile.data.events.EventRepositoryError): String =
            when {
                error.kind == EventErrorKind.Http && error.status == 401 -> "Sessão expirada. Entre novamente."
                error.kind == EventErrorKind.Http && error.status == 400 -> "Não entendi o que você falou."
                else -> "O agente não respondeu. Tente de novo."
            }
    }
