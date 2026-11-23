package app.braid.mobile.domain.agenda

import kotlinx.coroutines.flow.Flow

/** A escolha "Tempo livre" da engrenagem da Agenda, guardada no aparelho; sem escolha guardada vale ligado, como no web. */
interface FreeTimeRepository {
    val enabled: Flow<Boolean>

    suspend fun select(enabled: Boolean)
}
