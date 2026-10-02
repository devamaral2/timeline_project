package app.braid.mobile.data.chat

import app.braid.mobile.BuildConfig
import app.braid.mobile.data.dto.AgentChatClientFrameDto
import app.braid.mobile.data.dto.AgentChatMessageFrameDto
import app.braid.mobile.data.dto.AgentChatReadyFrameDto
import app.braid.mobile.data.dto.AgentChatReplyFrameDto
import app.braid.mobile.data.dto.AgentChatServerFrameDto
import app.braid.mobile.data.dto.AgentChatStatusFrameDto
import app.braid.mobile.data.dto.AgentChatTicketRequestDto
import app.braid.mobile.data.session.SessionRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.IOException
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

enum class AgentChatClientFailure(
    val wireCode: String,
) {
    ConnectionLost("connection_lost"),
    ConnectionFailed("connection_failed"),
    SessionExpired("session_expired"),
}

sealed interface AgentChatEvent {
    data class Status(
        val frame: AgentChatStatusFrameDto,
    ) : AgentChatEvent

    data class Reply(
        val frame: AgentChatReplyFrameDto,
    ) : AgentChatEvent

    data class Error(
        val id: String,
        val code: String,
    ) : AgentChatEvent
}

interface AgentChatGateway {
    val events: SharedFlow<AgentChatEvent>

    suspend fun send(message: AgentChatMessageFrameDto)

    fun cancel(id: String)

    fun close()
}

/** Pequena abstração para testar a máquina de conexão sem depender da rede. */
interface ChatSocket {
    val readyState: Int

    fun send(data: String): Boolean

    fun close(
        code: Int = 1000,
        reason: String = "",
    )
}

interface ChatSocketListener {
    fun onMessage(data: String)

    fun onClosed(
        code: Int,
        reason: String,
    )

    fun onFailure(cause: Throwable?)
}

interface ChatSocketFactory {
    fun open(
        url: String,
        listener: ChatSocketListener,
    ): ChatSocket
}

const val SOCKET_CONNECTING = 0
const val SOCKET_OPEN = 1
const val SOCKET_CLOSED = 3
private const val READY_TIMEOUT_MS = 10_000L
private const val TICKET_REJECTED = 4401
private const val REAUTHENTICATE = 4001
private const val IDLE = 4002
private const val NORMAL_CLOSE = 1000

@Singleton
class AgentChatRepository
    @Inject
    constructor(
        private val api: ChatApi,
        private val socketFactory: ChatSocketFactory,
        private val json: Json,
        private val sessionRepository: SessionRepository,
    ) : AgentChatGateway {
        private val connectionMutex = Mutex()
        private val mutableEvents = MutableSharedFlow<AgentChatEvent>(extraBufferCapacity = 32)
        private var socket: ChatSocket? = null
        private var pendingId: String? = null

        override val events: SharedFlow<AgentChatEvent> = mutableEvents.asSharedFlow()

        override suspend fun send(message: AgentChatMessageFrameDto) {
            pendingId = message.id
            val connected =
                try {
                    connect()
                } catch (error: IOException) {
                    fail(
                        message.id,
                        if (error is SessionExpiredException) {
                            AgentChatClientFailure.SessionExpired
                        } else {
                            AgentChatClientFailure.ConnectionFailed
                        },
                    )
                    return
                } catch (error: CancellationException) {
                    throw error
                }

            val sent =
                runCatching {
                    connected.send(json.encodeToString(AgentChatClientFrameDto.serializer(), message))
                }.getOrDefault(false)
            if (!sent) fail(message.id, AgentChatClientFailure.ConnectionLost)
        }

        override fun cancel(id: String) {
            val connected = socket?.takeIf { it.readyState == SOCKET_OPEN } ?: return
            val frame =
                app.braid.mobile.data.dto
                    .AgentChatCancelFrameDto(id)
            connected.send(json.encodeToString(AgentChatClientFrameDto.serializer(), frame))
        }

        override fun close() {
            pendingId = null
            socket?.close(NORMAL_CLOSE, "closed")
            socket = null
        }

        private suspend fun connect(): ChatSocket =
            connectionMutex.withLock {
                socket?.takeIf { it.readyState == SOCKET_OPEN }?.let { return@withLock it }
                val opened = open(retryRejectedTicket = true)
                if (opened.readyState != SOCKET_OPEN) throw ConnectionFailedException("socket closed")
                socket = opened
                opened
            }

        private suspend fun open(retryRejectedTicket: Boolean): ChatSocket {
            val ticket = requestTicket()
            val url = chatUrl(ticket)
            lateinit var connectedSocket: ChatSocket
            val ready = CompletableDeferred<Unit>()
            val listener =
                object : ChatSocketListener {
                    override fun onMessage(data: String) {
                        val frame = decodeServerFrame(data) ?: return
                        if (!ready.isCompleted) {
                            if (frame is AgentChatReadyFrameDto) ready.complete(Unit)
                            return
                        }
                        handleFrame(frame)
                    }

                    override fun onClosed(
                        code: Int,
                        reason: String,
                    ) {
                        if (!ready.isCompleted) {
                            ready.completeExceptionally(
                                if (code == TICKET_REJECTED) TicketRejectedException() else ConnectionFailedException(reason),
                            )
                            return
                        }
                        handleClose(connectedSocket, code)
                    }

                    override fun onFailure(cause: Throwable?) {
                        if (!ready.isCompleted) {
                            ready.completeExceptionally(ConnectionFailedException(cause?.message.orEmpty()))
                            return
                        }
                        handleClose(connectedSocket, null)
                    }
                }

            connectedSocket = socketFactory.open(url, listener)
            try {
                withTimeout(READY_TIMEOUT_MS) { ready.await() }
            } catch (error: TicketRejectedException) {
                connectedSocket.close(NORMAL_CLOSE, "ticket rejected")
                if (retryRejectedTicket) return open(retryRejectedTicket = false)
                throw error
            } catch (error: TimeoutCancellationException) {
                connectedSocket.close(NORMAL_CLOSE, "ready timeout")
                throw ConnectionFailedException("ready timeout")
            } catch (error: CancellationException) {
                connectedSocket.close(NORMAL_CLOSE, "cancelled")
                throw error
            } catch (error: Throwable) {
                connectedSocket.close(NORMAL_CLOSE, "ready failed")
                throw error
            }
            return connectedSocket
        }

        private suspend fun requestTicket(): String {
            val response =
                try {
                    api.issueTicket(AgentChatTicketRequestDto(currentUserId()))
                } catch (_: IOException) {
                    throw ConnectionFailedException("ticket request failed")
                }
            if (response.code() == 401) throw SessionExpiredException()
            if (!response.isSuccessful) throw ConnectionFailedException("ticket request failed")
            return response.body()?.ticket ?: throw ConnectionFailedException("ticket response was empty")
        }

        private suspend fun currentUserId(): String = sessionRepository.snapshot()?.user?.userId ?: throw SessionExpiredException()

        private fun decodeServerFrame(data: String): AgentChatServerFrameDto? =
            try {
                json.decodeFromString(AgentChatServerFrameDto.serializer(), data)
            } catch (_: SerializationException) {
                null
            }

        private fun handleFrame(frame: AgentChatServerFrameDto) {
            when (frame) {
                is AgentChatReadyFrameDto -> Unit
                is AgentChatStatusFrameDto -> mutableEvents.tryEmit(AgentChatEvent.Status(frame))
                is AgentChatReplyFrameDto -> {
                    if (pendingId == frame.id) pendingId = null
                    mutableEvents.tryEmit(AgentChatEvent.Reply(frame))
                }

                is app.braid.mobile.data.dto.AgentChatErrorFrameDto -> {
                    frame.id?.let { id ->
                        if (pendingId == id) pendingId = null
                        mutableEvents.tryEmit(AgentChatEvent.Error(id, frame.code))
                    }
                }
            }
        }

        private fun handleClose(
            closedSocket: ChatSocket,
            code: Int?,
        ) {
            if (socket === closedSocket) socket = null
            // 4001/4002 are expected lifecycle closes. They reconnect silently on
            // the next message; an in-flight message still needs an explicit error.
            if (pendingId != null) {
                pendingId?.let { fail(it, AgentChatClientFailure.ConnectionLost) }
            } else if (code == REAUTHENTICATE || code == IDLE) {
                return
            }
        }

        private fun fail(
            id: String,
            failure: AgentChatClientFailure,
        ) {
            if (pendingId == id) pendingId = null
            mutableEvents.tryEmit(AgentChatEvent.Error(id, failure.wireCode))
        }

        companion object {
            private fun chatUrl(ticket: String): String {
                val base = BuildConfig.API_BASE_URL.toHttpUrl()
                val scheme = if (base.isHttps) "wss" else "ws"
                val httpUrl =
                    base
                        .newBuilder()
                        .encodedPath("/api/ai/chat")
                        .addQueryParameter("ticket", ticket)
                        .build()
                        .toString()
                return httpUrl.replaceFirst(Regex("^https?://"), "$scheme://")
            }
        }
    }

class OkHttpChatSocketFactory
    @Inject
    constructor(
        @param:Named("apiClient") private val client: OkHttpClient,
    ) : ChatSocketFactory {
        override fun open(
            url: String,
            listener: ChatSocketListener,
        ): ChatSocket {
            val socket = OkHttpChatSocket()
            val request = Request.Builder().url(url).build()
            val webSocket =
                client.newWebSocket(
                    request,
                    object : WebSocketListener() {
                        override fun onOpen(
                            webSocket: WebSocket,
                            response: Response,
                        ) {
                            socket.open(webSocket)
                        }

                        override fun onMessage(
                            webSocket: WebSocket,
                            text: String,
                        ) {
                            listener.onMessage(text)
                        }

                        override fun onClosed(
                            webSocket: WebSocket,
                            code: Int,
                            reason: String,
                        ) {
                            socket.closed()
                            listener.onClosed(code, reason)
                        }

                        override fun onFailure(
                            webSocket: WebSocket,
                            t: Throwable,
                            response: Response?,
                        ) {
                            socket.closed()
                            listener.onFailure(t)
                        }
                    },
                )
            socket.attach(webSocket)
            return socket
        }
    }

private class OkHttpChatSocket : ChatSocket {
    @Volatile
    private var delegate: WebSocket? = null

    @Volatile
    override var readyState: Int = SOCKET_CONNECTING
        private set

    fun attach(webSocket: WebSocket) {
        delegate = webSocket
        if (readyState == SOCKET_CLOSED) webSocket.close(NORMAL_CLOSE, "closed")
    }

    fun open(webSocket: WebSocket) {
        delegate = webSocket
        readyState = SOCKET_OPEN
    }

    fun closed() {
        readyState = SOCKET_CLOSED
    }

    override fun send(data: String): Boolean = delegate?.send(data) == true

    override fun close(
        code: Int,
        reason: String,
    ) {
        readyState = SOCKET_CLOSED
        delegate?.close(code, reason)
    }
}

private class TicketRejectedException : IOException()

private class ConnectionFailedException(
    message: String,
) : IOException(message)

private class SessionExpiredException : IOException()
