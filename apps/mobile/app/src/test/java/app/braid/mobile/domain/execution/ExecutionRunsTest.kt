package app.braid.mobile.domain.execution

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A regra da gaveta de execução conferida contra as funções do web: as saídas de `executionRunsOf`, `shownRowCount` e
 * `drawerGrows` vêm de `scripts/mobile/fixtures/execution.ts`, geradas sobre as mesmas listas.
 */
class ExecutionRunsTest {
    private val rules = Fixtures.json("execution-rules").jsonObject

    private fun cards(name: String): List<TaskCard> =
        BraidJson.decodeFromString(ListSerializer(TaskCardDto.serializer()), Fixtures.text(name)).map(TaskCardDto::toDomain)

    private fun modeOf(code: String) = ExecutionDrawerMode.fromCode(code)

    @Test
    fun `the runs match the web for every list, in the web's order`() {
        val cases = rules.getValue("cases").jsonObject
        assertEquals(5, cases.size)
        for ((name, case) in cases) {
            val input =
                case.jsonObject
                    .getValue("input")
                    .jsonPrimitive.content
            val expected =
                case.jsonObject
                    .getValue("runs")
                    .jsonArray
                    .map { it.jsonPrimitive.content }

            assertEquals("case $name", expected, executionRunsOf(cards(input)).map { it.id })
        }
    }

    @Test
    fun `the mixed list keeps only the in-progress runs, newest first, without steps, schedules or finished ones`() {
        // Esta é a lista escrita à mão no gerador: confere a regra do ticket, não só a igualdade com o web.
        assertEquals(
            listOf("run-newest", "run-preparing", "run-mid", "run-old", "run-nostart"),
            executionRunsOf(cards("execution-list-mixed")).map { it.id },
        )
    }

    @Test
    fun `saved content enters the drawer while it runs or waits for the transcription`() {
        assertEquals(
            listOf("page-running", "video-waiting"),
            executionRunsOf(cards("execution-list-saved")).map { it.id },
        )
    }

    @Test
    fun `a run that finishes leaves the list on the next read`() {
        assertEquals(
            listOf("run-preparing", "run-mid", "run-old", "run-nostart"),
            executionRunsOf(cards("execution-list-finished")).map { it.id },
        )
    }

    @Test
    fun `the rows each height shows match the web`() {
        val shown = rules.getValue("shown").jsonArray
        assertTrue(shown.isNotEmpty())
        for (case in shown) {
            val item = case.jsonObject
            val mode = modeOf(item.getValue("mode").jsonPrimitive.content)
            val total = item.getValue("total").jsonPrimitive.int

            assertEquals("$mode of $total", item.getValue("shown").jsonPrimitive.int, shownRowCount(mode, total))
        }
        assertEquals(3, rules.getValue("peek").jsonPrimitive.int)
    }

    @Test
    fun `growing matches the web for every change of height`() {
        val grows: JsonArray = rules.getValue("grows").jsonArray
        assertEquals(9, grows.size)
        for (case in grows) {
            val item: JsonObject = case.jsonObject
            val from = modeOf(item.getValue("from").jsonPrimitive.content)
            val to = modeOf(item.getValue("to").jsonPrimitive.content)

            assertEquals("$from to $to", item.getValue("grows").jsonPrimitive.boolean, from.growsTo(to))
        }
    }

    @Test
    fun `the query asks for the in-progress group, not a loose list`() {
        assertEquals(
            setOf("preparing", "queued", "starting", "running", "awaiting_transcription"),
            EXECUTION_STATUS_FILTER.map { it.code }.toSet(),
        )
    }

    @Test
    fun `an unknown stored height is three rows`() {
        assertEquals(ExecutionDrawerMode.Three, ExecutionDrawerMode.fromCode("robots"))
        assertEquals(ExecutionDrawerMode.Three, ExecutionDrawerMode.fromCode(null))
        assertEquals(ExecutionDrawerMode.All, ExecutionDrawerMode.fromCode("all"))
    }
}
