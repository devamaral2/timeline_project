package app.braid.mobile.ui.voice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import javax.inject.Inject

data class VoiceJob(
    val id: String,
    val transcript: String,
    val status: VoiceJobStatus = VoiceJobStatus.Pending,
    val error: String? = null,
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
        private var draining = false
        private var nextId = 0

        val jobs: StateFlow<List<VoiceJob>> = mutableJobs.asStateFlow()
        val events = mutableEvents.receiveAsFlow()

        fun enqueue(transcript: String) {
            val normalized = transcript.trim()
            if (normalized.isEmpty()) return
            nextId += 1
            mutableJobs.value = mutableJobs.value + VoiceJob("voice-job-$nextId", normalized)
            drain()
        }

        fun retry(jobId: String) {
            mutableJobs.value =
                mutableJobs.value.map { job ->
                    if (job.id == jobId) job.copy(status = VoiceJobStatus.Pending, error = null) else job
                }
            drain()
        }

        fun dismiss(jobId: String) {
            mutableJobs.value = mutableJobs.value.filterNot { it.id == jobId }
        }

        private fun drain() {
            if (draining) return
            draining = true
            viewModelScope.launch {
                try {
                    while (true) {
                        val job = mutableJobs.value.firstOrNull { it.status == VoiceJobStatus.Pending } ?: break
                        when (val result = gateway.create(job.transcript)) {
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
                    }
                } finally {
                    draining = false
                }
                if (mutableJobs.value.isEmpty()) mutableEvents.trySend(VoiceQueueEvent.Drained)
            }
        }

        private fun messageOf(error: app.braid.mobile.data.events.EventRepositoryError): String =
            when {
                error.kind == EventErrorKind.Http && error.status == 401 -> "Sessão expirada. Entre novamente."
                error.kind == EventErrorKind.Http && error.status == 400 -> "Não entendi o que você falou."
                else -> "O agente não respondeu. Tente de novo."
            }
    }
