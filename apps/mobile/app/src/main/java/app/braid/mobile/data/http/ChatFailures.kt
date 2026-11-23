package app.braid.mobile.data.http

import app.braid.mobile.domain.chat.ChatFailureCode
import app.braid.mobile.domain.chat.ChatRequestException
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException

/** O código que a conversa mostra para um status HTTP (o `startFailureCode` do web). */
internal fun chatFailureOf(status: Int): ChatFailureCode =
    when (status) {
        HTTP_UNAUTHORIZED -> ChatFailureCode.SessionExpired
        HTTP_BAD_REQUEST, HTTP_UNPROCESSABLE -> ChatFailureCode.InvalidInput
        HTTP_FORBIDDEN -> ChatFailureCode.Forbidden
        HTTP_CONFLICT -> ChatFailureCode.Conflict
        HTTP_BAD_GATEWAY, HTTP_UNAVAILABLE, HTTP_GATEWAY_TIMEOUT -> ChatFailureCode.Unavailable
        else -> ChatFailureCode.ConnectionFailed
    }

/**
 * Roda a chamada e traduz o que a rede devolve em [ChatRequestException], o único erro que as telas de envio de pedido
 * (chat, barras de edição) conhecem. O erro original fica em `cause`.
 */
internal suspend fun <T> translatingStartFailures(block: suspend () -> T): T =
    try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: ChatRequestException) {
        throw failure
    } catch (failure: HttpException) {
        throw ChatRequestException(chatFailureOf(failure.code()), failure)
    } catch (failure: Exception) {
        throw ChatRequestException(ChatFailureCode.ConnectionFailed, failure)
    }
