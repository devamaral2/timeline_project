package app.braid.mobile.data.http

/** Os códigos HTTP que os repositórios traduzem em erros do domínio; declarados uma vez só. */
internal const val HTTP_BAD_REQUEST = 400
internal const val HTTP_UNAUTHORIZED = 401
internal const val HTTP_FORBIDDEN = 403
internal const val HTTP_NOT_FOUND = 404
internal const val HTTP_CONFLICT = 409
internal const val HTTP_UNPROCESSABLE = 422
internal const val HTTP_BAD_GATEWAY = 502
internal const val HTTP_UNAVAILABLE = 503
internal const val HTTP_GATEWAY_TIMEOUT = 504

/** A API recusou a entrada (400 ou 422). */
internal fun refusedInput(status: Int): Boolean = status == HTTP_BAD_REQUEST || status == HTTP_UNPROCESSABLE
