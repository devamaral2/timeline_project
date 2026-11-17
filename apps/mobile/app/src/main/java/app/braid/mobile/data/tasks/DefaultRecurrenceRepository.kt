package app.braid.mobile.data.tasks

import app.braid.mobile.data.http.HTTP_CONFLICT
import app.braid.mobile.data.http.HTTP_NOT_FOUND
import app.braid.mobile.data.http.refusedInput
import app.braid.mobile.domain.task.InvalidInputException
import app.braid.mobile.domain.task.NewSeries
import app.braid.mobile.domain.task.RecurrenceRepository
import app.braid.mobile.domain.task.RecurrenceSeries
import app.braid.mobile.domain.task.SeriesNotFoundException
import app.braid.mobile.domain.task.SeriesPatch
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.TaskChanges
import retrofit2.HttpException
import javax.inject.Inject

class DefaultRecurrenceRepository
    @Inject
    constructor(
        private val api: RecurrenceApi,
        private val changes: TaskChanges = TaskChanges(),
    ) : RecurrenceRepository {
        override suspend fun series(id: String): RecurrenceSeries =
            try {
                api.series(id).toDomain()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_NOT_FOUND) throw SeriesNotFoundException(failure)
                throw failure
            }

        override suspend fun create(
            series: NewSeries,
            idempotencyKey: String,
        ): String =
            try {
                api.create(idempotencyKey, series.toBody()).recurrenceId.also { changes.notifyChanged() }
            } catch (failure: HttpException) {
                throw refused(failure) ?: failure
            }

        override suspend fun update(
            id: String,
            patch: SeriesPatch,
        ) {
            try {
                api.update(id, patch.toBody())
                changes.notifyChanged()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_CONFLICT) throw StaleRevisionException(failure)
                throw refused(failure) ?: failure
            }
        }

        override suspend fun delete(id: String) {
            api.delete(id)
            changes.notifyChanged()
        }

        private fun refused(failure: HttpException): InvalidInputException? =
            if (refusedInput(failure.code())) InvalidInputException(failure) else null
    }
