package app.braid.mobile.support

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Uma chamada de função TS gravada pelo gerador: as entradas e o que a função devolveu. */
class FixtureCase(
    val args: List<JsonElement>,
    val result: JsonElement,
) {
    fun string(index: Int): String = args[index].jsonPrimitive.content

    fun nullableString(index: Int): String? = args[index].takeUnless { it is JsonNull }?.jsonPrimitive?.content

    fun int(index: Int): Int = args[index].jsonPrimitive.int

    val resultString: String get() = result.jsonPrimitive.content

    val resultStrings: List<String> get() = result.jsonArray.map { it.jsonPrimitive.content }

    val resultInt: Int get() = result.jsonPrimitive.int

    val resultBoolean: Boolean get() = result.jsonPrimitive.content.toBoolean()

    override fun toString(): String = "args=$args result=$result"
}

/** Os casos de [function] no objeto raiz da fixture [fixture]. */
fun fixtureCases(
    fixture: String,
    function: String,
): List<FixtureCase> {
    val array = Fixtures.json(fixture).jsonObject[function] as JsonArray
    check(array.isNotEmpty()) { "A fixture $fixture não tem casos para $function" }
    return array.map {
        val case = it as JsonObject
        FixtureCase(case.getValue("args").jsonArray, case.getValue("result"))
    }
}
