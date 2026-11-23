package app.braid.mobile.domain.time

import java.time.Instant

/** O relógio do app: uma das trocas da fronteira de teste (o outro mundo é o do aparelho). */
fun interface AppClock {
    fun now(): Instant
}
