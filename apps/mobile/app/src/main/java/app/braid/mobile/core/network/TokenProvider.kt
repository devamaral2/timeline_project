package app.braid.mobile.core.network

/** O que o cliente da API precisa da sessão: o token de agora e como trocá-lo quando a API o recusa. */
interface TokenProvider {
    suspend fun accessToken(): String?

    /**
     * Chamada num 401. [rejectedAccessToken] é o token que a API recusou; devolve
     * o token para repetir a chamada, ou `null` se não há como renovar.
     * Chamadas concorrentes viram uma só renovação.
     */
    suspend fun renew(rejectedAccessToken: String?): String?
}
