package app.braid.mobile.domain.timeline

import app.braid.mobile.support.FixtureCase
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** Cada função portada de `packages/timeline` contra o que a função TS devolveu para as mesmas entradas. */
class TimelineFixturesTest {
    private fun assertCases(
        function: String,
        actual: (FixtureCase) -> Any,
        expected: (FixtureCase) -> Any = { it.resultString },
    ) {
        for (case in fixtureCases("timeline-cases", function)) {
            assertEquals("$function ${case.args}", expected(case), actual(case))
        }
    }

    @Test
    fun `the timeline zone is Sao Paulo`() {
        val zone =
            Fixtures
                .json("timeline-cases")
                .jsonObject
                .getValue("timeZone")
                .jsonPrimitive.content
        assertEquals(zone, TIMELINE_TIME_ZONE)
    }

    @Test
    fun `day keys follow the Sao Paulo calendar and not the device`() = assertCases("dayKeyOf", { dayKeyOf(Instant.parse(it.string(0))) })

    @Test
    fun `day start and end are the instants the TS functions give, even on the 2018 DST boundary`() {
        assertCases("zonedDayStart", { toIsoMillis(zonedDayStart(it.string(0))) })
        assertCases("zonedDayEnd", { toIsoMillis(zonedDayEnd(it.string(0))) })
        assertCases("zonedTimeAt", { toIsoMillis(zonedTimeAt(it.string(0), it.string(1))) })
    }

    @Test
    fun `shifting a day key crosses months, years and leap days`() = assertCases("shiftDayKey", { shiftDayKey(it.string(0), it.int(1)) })

    @Test
    fun `the distance between two day keys undoes a shift`() {
        for (case in fixtureCases("timeline-cases", "shiftDayKey")) {
            assertEquals("${case.args}", case.int(1), daysBetween(case.string(0), case.resultString))
        }
    }

    @Test
    fun `clock time is HH-MM in Sao Paulo, midnight as 00-00`() = assertCases("formatTime", { formatTime(Instant.parse(it.string(0))) })

    @Test
    fun `instants are written as the API reads them, with milliseconds`() =
        assertCases("toIsoMillis", { toIsoMillis(Instant.parse(it.string(0))) }, { it.resultString })

    @Test
    fun `dates are written in Portuguese`() {
        assertCases("shortDate", { shortDate(it.string(0)) })
        assertCases("longDate", { longDate(it.string(0)) })
        assertCases("weekday", { weekday(it.string(0)) })
        assertCases("dayNumber", { dayNumber(it.string(0)) })
        assertCases("mediumDate", { mediumDate(it.string(0)) })
        assertCases("briefDate", { briefDate(it.string(0)) })
        assertCases("relativeDayLabel", { relativeDayLabel(it.string(0), it.string(1)) })
        assertCases("monthLabel", { monthLabel(it.string(0)) })
    }

    @Test
    fun `weeks run from Sunday to Saturday`() {
        assertCases("weekdayIndexOf", { weekdayIndexOf(it.string(0)) }, { it.resultInt })
        assertCases("weekOf", { weekOf(it.string(0)) }, { it.resultStrings })
        assertCases("dayKeyRange", { dayKeyRange(it.string(0), it.int(1)) }, { it.resultStrings })
    }

    @Test
    fun `the month grid is six weeks and shifting a month clamps the day`() {
        assertCases("monthGridOf", { monthGridOf(it.string(0)) }, { it.resultStrings })
        assertCases("shiftMonthKey", { shiftMonthKey(it.string(0), it.int(1)) })
        assertCases("isSameMonth", { isSameMonth(it.string(0), it.string(1)) }, { it.resultBoolean })
    }

    @Test
    fun `a task occupies every day from its start to its end, and midnight still belongs to the day before`() =
        assertCases(
            "taskDayKeysOf",
            { taskDayKeysOf(Instant.parse(it.string(0)), it.nullableString(1)?.let(Instant::parse)) },
            { it.resultStrings },
        )
}
