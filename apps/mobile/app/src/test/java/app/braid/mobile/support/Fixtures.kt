package app.braid.mobile.support

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * As fixtures geradas por `scripts/mobile/generate-fixtures.ts` a partir dos
 * schemas Zod e das funções TS. Nunca escreva uma resposta da API à mão num
 * teste: peça ao gerador.
 */
object Fixtures {
    fun text(name: String): String =
        checkNotNull(Fixtures::class.java.getResourceAsStream("/fixtures/$name.json")) {
            "Fixture $name não existe; rode `pnpm --filter @repo/mobile run test` para gerar."
        }.bufferedReader().use { it.readText() }

    fun json(name: String): JsonElement = Json.parseToJsonElement(text(name))
}
