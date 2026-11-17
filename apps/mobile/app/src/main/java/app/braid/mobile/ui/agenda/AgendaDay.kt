package app.braid.mobile.ui.agenda

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.ui.tasks.TaskRow
import java.time.Instant

/** O que um dia mostra: o esqueleto até chegar, o erro se a leitura falhou, o dia livre ou as linhas. */
@Composable
fun AgendaDay(
    tasks: List<TaskCard>?,
    load: AgendaLoad,
    now: Instant,
    onRetry: () -> Unit,
    onStatusClick: (TaskCard) -> Unit,
    modifier: Modifier = Modifier,
    onOpenTask: (String) -> Unit = {},
) {
    Column(modifier.fillMaxWidth()) {
        when {
            tasks != null && tasks.isEmpty() -> FreeDay()
            tasks != null -> TaskList(tasks, now, onStatusClick, onOpenTask)
            load == AgendaLoad.Failed -> LoadFailed(onRetry)
            else -> LoadingDay()
        }
    }
}

@Composable
private fun TaskList(
    tasks: List<TaskCard>,
    now: Instant,
    onStatusClick: (TaskCard) -> Unit,
    onOpenTask: (String) -> Unit,
) {
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    tasks.forEachIndexed { index, card ->
        if (index > 0) HorizontalDivider(Modifier.padding(start = ROW_DIVIDER_INSET), color = MaterialTheme.colorScheme.outline)
        // O web só abre a escolha pelo ponto azul da tarefa de referência; as outras linhas não reagem ao glifo aqui.
        val opensPicker = card.actor == TaskActor.Human && card.status == null
        TaskRow(
            card = card,
            now = now,
            onClick = { onOpenTask(card.id) },
            onStatusClick = if (opensPicker) ({ onStatusClick(card) }) else null,
        )
    }
}

/** O hairline entre as linhas começa depois do glifo, como no web. */
private val ROW_DIVIDER_INSET = 58.dp

@Composable
private fun FreeDay() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    Column(
        modifier = Modifier.fillMaxWidth().heightIn(min = 240.dp).padding(horizontal = 24.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically),
    ) {
        Text(
            text = "Um dia livre, do seu jeito.",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = "Sua agenda está aberta para o que faz bem a você.",
            modifier = Modifier.widthIn(max = 280.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            lineHeight = 21.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun LoadingDay() {
    Column {
        ListSkeleton()
        Text(
            text = "Carregando sua agenda…",
            modifier = Modifier.padding(top = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
    }
}

@Composable
private fun LoadFailed(onRetry: () -> Unit) {
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = "Não foi possível carregar a agenda. Tente novamente.",
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        BraidPill(text = "Tentar de novo", onClick = onRetry)
    }
}

/**
 * As linhas-fantasma de uma lista que ainda não chegou: o quadrado do ícone, duas
 * barras de texto e a figura da direita, pulsando em onda de cima para baixo.
 */
@Composable
fun ListSkeleton(rows: Int = 5) {
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    repeat(rows) { row ->
        if (row > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        SkeletonRow(row)
    }
}

@Composable
private fun SkeletonRow(row: Int) {
    val pulse by rememberInfiniteTransition(label = "skeleton").animateFloat(
        initialValue = 0.45f,
        targetValue = 1f,
        animationSpec =
            infiniteRepeatable(
                animation = tween(durationMillis = 600, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse,
                initialStartOffset = StartOffset(row * 90),
            ),
        label = "skeletonPulse",
    )
    val bar = MaterialTheme.colorScheme.secondary
    val firstWidth = 0.62f
    val secondBar =
        when (row % 3) {
            1 -> Modifier.fillMaxWidth(0.44f)
            2 -> Modifier.fillMaxWidth(0.54f)
            else -> Modifier.width(96.dp)
        }
    Row(
        modifier = Modifier.fillMaxWidth().alpha(pulse).padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).background(bar, RoundedCornerShape(13.dp)))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.fillMaxWidth(firstWidth).height(12.dp).background(bar, RoundedCornerShape(6.dp)))
            Box(secondBar.height(10.dp).background(bar, RoundedCornerShape(5.dp)))
        }
        Box(Modifier.width(40.dp).height(12.dp).background(bar, RoundedCornerShape(6.dp)))
    }
}
