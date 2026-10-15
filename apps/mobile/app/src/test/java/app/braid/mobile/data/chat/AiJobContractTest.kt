package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AiJobDto
import app.braid.mobile.data.dto.MealItemDto
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AiJobContractTest {
    private val json = Json

    @Test
    fun allJobStatusesAndResultVariantsDecodeStrictly() {
        val fixture = requireNotNull(javaClass.classLoader?.getResource("fixtures/ai-jobs.json")).readText()
        val jobs = json.decodeFromString<List<AiJobDto>>(fixture)
        assertEquals(setOf("queued", "running", "succeeded", "failed", "cancelled"), jobs.map { it.status }.toSet())
        assertTrue(jobs[0].pending)
        assertTrue(jobs[1].pending)
        assertFalse(jobs[2].pending)
        assertEquals("conversation-1", jobs[2].result?.conversationId)
        assertEquals(2, jobs[2].result?.assistantSeq)
        assertEquals("event-1", jobs[3].result?.eventId)
        assertEquals(true, jobs[4].result?.skipped)
    }

    @Test
    fun pendingMealAndModelEstimateKeepTheirGenerationMetadata() {
        val meal =
            json.decodeFromString<MealItemDto>(
                """{"name":"Almoço","description":"","foodItems":[],"totals":{"totalCaloriesKcal":0,"totalProteinGrams":0,"totalCarbohydrateGrams":0,"totalFatGrams":0,"totalFiberGrams":0},"generation":{"status":"pending"},"nutritionSource":"model-estimate"}""",
            )
        assertEquals("pending", meal.generation?.status)
        assertEquals("model-estimate", meal.nutritionSource)
    }
}
