package app.braid.mobile.domain.task

import app.braid.mobile.data.tasks.toBody
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TaskEditFixtures
import app.braid.mobile.support.TaskEditFixtures.cases
import app.braid.mobile.support.TaskEditFixtures.draft
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/** A lógica do formulário de tarefa, conferida contra as funções do web (`task-draft.ts` e `task-reminders-tags.ts`). */
class TaskDraftFixturesTest {
    private fun fieldName(field: TaskDraftField): String = field.name.replaceFirstChar { it.lowercase() }

    @Test
    fun `the draft a task opens with is the one the web builds`() {
        for (case in cases("task-edit-draft-from-task")) {
            val key = case.getValue("name").jsonPrimitive.content
            assertEquals(key, draft(case.getValue("draft")), draftFromTask(TaskEditFixtures.detail(case.getValue("task"))))
        }
    }

    @Test
    fun `the empty draft is a reference task with the typed name`() {
        val fixture = Fixtures.json("task-edit-empty-draft").jsonObject
        assertEquals(draft(fixture.getValue("empty")), emptyTaskDraft())
        assertEquals(draft(fixture.getValue("named")), emptyTaskDraft("comprar pão"))
    }

    @Test
    fun `the create body is the one the web builds`() {
        for (case in cases("task-edit-create-cases")) {
            val name = case.getValue("name").jsonPrimitive.content
            val now = Instant.parse(case.getValue("now").jsonPrimitive.content)
            val body = buildCreateTask(draft(case.getValue("draft")), now).toBody()
            assertEquals(name, case.getValue("input").jsonObject, body)
        }
    }

    @Test
    fun `the patch holds only what changed, as the web builds it`() {
        for (case in cases("task-edit-patch-cases")) {
            val name = case.getValue("name").jsonPrimitive.content
            val now = Instant.parse(case.getValue("now").jsonPrimitive.content)
            val patch = buildTaskPatch(TaskEditFixtures.detail(case.getValue("task")), draft(case.getValue("draft")), now)
            val expected = case.getValue("patch")
            if (expected is JsonNull) {
                assertNull(name, patch)
            } else {
                assertEquals(name, expected.jsonObject, patch?.toBody())
            }
        }
    }

    @Test
    fun `validation refuses what the web refuses, with its words`() {
        for (case in cases("task-edit-validate-cases")) {
            val name = case.getValue("name").jsonPrimitive.content
            val expected = case.getValue("errors").jsonObject.mapValues { it.value.jsonPrimitive.content }
            val actual = validateTaskDraft(draft(case.getValue("draft"))).mapKeys { fieldName(it.key) }
            assertEquals(name, expected, actual)
        }
    }

    @Test
    fun `a rebase keeps what was typed and takes the rest from the new version`() {
        for (case in cases("task-edit-rebase-cases")) {
            val name = case.getValue("name").jsonPrimitive.content
            val rebased =
                rebaseDraft(
                    draft(case.getValue("draft")),
                    TaskEditFixtures.detail(case.getValue("previous")),
                    TaskEditFixtures.detail(case.getValue("next")),
                )
            assertEquals(name, draft(case.getValue("expected")), rebased)
        }
    }

    @Test
    fun `reminders are checked, labelled and kept in order as the web does`() {
        val fixture = Fixtures.json("task-edit-reminder-cases").jsonObject
        for (case in fixture.getValue("minutes").jsonArray.map { it.jsonObject }) {
            val amount =
                case
                    .getValue("amount")
                    .jsonPrimitive.content
                    .toDouble()
            val unit = if (case.getValue("unit").jsonPrimitive.content == "days") ReminderUnit.Days else ReminderUnit.Minutes
            val expected =
                case
                    .getValue("minutes")
                    .takeUnless { it is JsonNull }
                    ?.jsonPrimitive
                    ?.content
                    ?.toInt()
            assertEquals("$amount ${unit.name}", expected, reminderMinutes(amount, unit))
        }
        for (case in fixture.getValue("labels").jsonArray.map { it.jsonObject }) {
            val minutes =
                case
                    .getValue("minutes")
                    .jsonPrimitive.content
                    .toInt()
            assertEquals("$minutes", case.getValue("label").jsonPrimitive.content, reminderLabel(minutes))
        }
        for (case in fixture.getValue("lists").jsonArray.map { it.jsonObject }) {
            val list = case.getValue("list").jsonArray.map { it.jsonPrimitive.content.toInt() }
            val add =
                case
                    .getValue("add")
                    .jsonPrimitive.content
                    .toInt()
            val expected = case.getValue("result").jsonArray.map { it.jsonPrimitive.content.toInt() }
            assertEquals("$list + $add", expected, addReminder(list, add))
        }
    }

    @Test
    fun `tags are normalised as the web does`() {
        for (case in Fixtures.json("task-edit-tag-cases").jsonArray.map { it.jsonObject }) {
            val raw = case.getValue("raw").jsonPrimitive.content
            assertEquals(raw, case.getValue("normalized").jsonPrimitive.content, normalizeTag(raw))
            assertEquals(raw, case.getValue("added").jsonArray.map { it.jsonPrimitive.content }, addTag(listOf("casa"), raw))
        }
    }
}
