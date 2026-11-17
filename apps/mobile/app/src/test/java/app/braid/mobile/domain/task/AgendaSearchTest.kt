package app.braid.mobile.domain.task

import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** A busca do menu acha pelo nome, sem maiúsculas nem acentos, como a `plain` do web. */
class AgendaSearchTest {
    private val fixture = Fixtures.json("executor-agenda-search").jsonObject
    private val names = fixture.getValue("names").jsonArray.map { it.jsonPrimitive.content }

    @Test
    fun `every search keeps the names the web keeps`() {
        for (case in fixture.getValue("cases").jsonArray.map { it.jsonObject }) {
            val search = case.getValue("search").jsonPrimitive.content
            val expected = case.getValue("matches").jsonArray.map { it.jsonPrimitive.content }
            assertEquals("search \"$search\"", expected, names.filter { nameMatchesSearch(it, search) })
        }
    }
}
