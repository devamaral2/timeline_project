package app.braid.mobile.data.chat

import android.content.Context
import app.braid.mobile.data.dto.SubmitAiJobDto
import app.braid.mobile.data.dto.SubmitVoiceJobDto
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/** Disk outbox scoped to the signed-in owner. Accepted work lives only on the server. */
@Singleton
class AiJobOutbox
    @Inject
    constructor(
        @ApplicationContext context: Context,
        private val json: Json,
    ) {
        private val preferences = context.getSharedPreferences("ai-job-outbox", Context.MODE_PRIVATE)

        suspend fun remember(request: SubmitAiJobDto) =
            write("chat:${request.userId}:${request.clientMessageId}", json.encodeToString(SubmitAiJobDto.serializer(), request))

        suspend fun remember(
            userId: String,
            request: SubmitVoiceJobDto,
        ) = write("voice:$userId:${request.requestId}", json.encodeToString(SubmitVoiceJobDto.serializer(), request))

        suspend fun chats(userId: String): List<SubmitAiJobDto> =
            entries("chat:$userId:").map { json.decodeFromString(SubmitAiJobDto.serializer(), it) }

        suspend fun voices(userId: String): List<SubmitVoiceJobDto> =
            entries("voice:$userId:").map { json.decodeFromString(SubmitVoiceJobDto.serializer(), it) }

        suspend fun forget(
            kind: String,
            userId: String,
            requestId: String,
        ) = withContext(Dispatchers.IO) {
            // A failed cleanup leaves the same idempotency key for next recovery, not a new operation.
            preferences.edit().remove("$kind:$userId:$requestId").commit()
            Unit
        }

        private suspend fun entries(prefix: String): List<String> =
            withContext(Dispatchers.IO) {
                preferences.all.filterKeys { it.startsWith(prefix) }.values.filterIsInstance<String>()
            }

        private suspend fun write(
            key: String,
            value: String,
        ) = withContext(Dispatchers.IO) {
            check(preferences.edit().putString(key, value).commit()) { "Could not persist AI request" }
        }
    }
