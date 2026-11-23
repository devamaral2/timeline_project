package app.braid.mobile.core.network

import kotlinx.serialization.json.Json

/** O formato de fio do Auth e da API: campos novos do servidor não quebram o app. */
val BraidJson: Json =
    Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
