package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.NewSeries
import app.braid.mobile.domain.task.SeriesPatch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** O `CreateRecurrenceInput`: a regra e o modelo; só entram as chaves que a frequência usa e o que foi preenchido. */
fun NewSeries.toBody(): JsonObject =
    buildJsonObject {
        put("frequency", frequency.code)
        put("interval", interval)
        byWeekday?.let { put("byWeekday", it) }
        byMonthDay?.let { put("byMonthDay", it) }
        byMonth?.let { put("byMonth", it) }
        put("timeOfDay", timeOfDay)
        durationMinutes?.let { put("durationMinutes", it) }
        put("timeZone", timeZone)
        put("startsOn", startsOn)
        endsOn?.let { put("endsOn", it) }
        put(
            "template",
            buildJsonObject {
                put("kind", template.kind.code)
                put("name", template.name)
                put("description", template.description)
                put("priority", template.priority.code)
                template.tags?.let { put("tags", JsonArray(it.map(::JsonPrimitive))) }
                template.notifyOffsetsMinutes?.let { put("notifyOffsetsMinutes", JsonArray(it.map(::JsonPrimitive))) }
                template.projectId?.let { put("projectId", it) }
            },
        )
    }

/** O `PATCH` da série: a revisão lida e só a regra que mudou. */
fun SeriesPatch.toBody(): JsonObject =
    buildJsonObject {
        put("expectedRevision", expectedRevision)
        frequency?.let { put("frequency", it.code) }
        interval?.let { put("interval", it) }
        byWeekday?.let { put("byWeekday", it) }
        byMonthDay?.let { put("byMonthDay", it) }
        byMonth?.let { put("byMonth", it) }
        endsOn?.let { put("endsOn", it) }
        template?.let { put("template", it) }
    }
