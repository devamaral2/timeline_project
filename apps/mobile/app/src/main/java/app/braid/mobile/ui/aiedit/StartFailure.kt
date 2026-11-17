package app.braid.mobile.ui.aiedit

import retrofit2.HttpException

/** Por que o envio do pedido falhou, do ponto de vista do chat (o `startFailureCode` do web); as barras de edição o reusam. */
internal fun startFailureCode(failure: Exception): String =
    when ((failure as? HttpException)?.code()) {
        HTTP_UNAUTHORIZED -> "session_expired"
        HTTP_BAD_REQUEST, HTTP_UNPROCESSABLE -> "invalid_input"
        HTTP_FORBIDDEN -> "forbidden"
        HTTP_CONFLICT -> "conflict"
        HTTP_BAD_GATEWAY, HTTP_UNAVAILABLE, HTTP_GATEWAY_TIMEOUT -> "unavailable"
        else -> "connection_failed"
    }

private const val HTTP_BAD_REQUEST = 400
private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_FORBIDDEN = 403
private const val HTTP_CONFLICT = 409
private const val HTTP_UNPROCESSABLE = 422
private const val HTTP_BAD_GATEWAY = 502
private const val HTTP_UNAVAILABLE = 503
private const val HTTP_GATEWAY_TIMEOUT = 504
