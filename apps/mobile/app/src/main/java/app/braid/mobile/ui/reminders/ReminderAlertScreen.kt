package app.braid.mobile.ui.reminders

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidSansFont
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.Motion
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.documentTokens
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.alertAnchorLabel
import app.braid.mobile.domain.reminder.alertClock
import app.braid.mobile.domain.reminder.alertKindLabel
import app.braid.mobile.domain.reminder.remainingTimeOf
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.time.AppClock
import kotlinx.coroutines.delay
import java.time.ZoneId

/*
 * O "Cartaz": a tela cheia que o lembrete abre com o aparelho apagado ou bloqueado. Em cima, um campo na cor do tipo
 * da tarefa com o horário e quanto falta; embaixo, uma folha com o nome e as duas ações. O desenho é o do modelo C do
 * canvas "Lembrete em tela cheia".
 */

private val SHEET_HEIGHT = 224.dp
private val SHEET_OVERLAP = 32.dp
private val SHEET_RADIUS = 28.dp
private val SIDE_PADDING = 28.dp
private val ACTION_HEIGHT = 56.dp

/** A largura e a altura do desenho: num aparelho menor os números grandes e os respiros encolhem juntos. */
private val DESIGN_WIDTH = 390.dp
private val DESIGN_HEIGHT = 760.dp

private const val CLOCK_SIZE = 136f
private const val REMAINING_SIZE = 88f
private const val UNIT_SIZE = 36f
private const val RULE_ALPHA = 0.35f

/** A entrada: o campo desce como uma cortina, a folha sobe, e os textos chegam um depois do outro. Os tempos são os de desenho, na escala do Motion (`Motion.ms`). */
private val INTRO_MILLIS = Motion.ms(1_700).toFloat()
private val CURTAIN_DELAY = Motion.ms(100)
private val CURTAIN_MILLIS = Motion.ms(700)
private val SHEET_DELAY = Motion.ms(450)
private val SHEET_MILLIS = Motion.ms(600)
private val RULE_DELAY = Motion.ms(700)
private val RULE_MILLIS = Motion.ms(500)
private val RISE_MILLIS = Motion.ms(550)
private val CLOCK_DELAY = Motion.ms(550)
private val REMAINING_DELAY = Motion.ms(800)
private val NAME_DELAY = Motion.ms(950)
private val ACTIONS_DELAY = Motion.ms(1_050)
private val RISE_DISTANCE = 14.dp
private val CurtainEasing = CubicBezierEasing(0.6f, 0f, 0.2f, 1f)
private val SheetEasing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)
private val RuleEasing = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
private val RiseEasing = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)

private const val TICK_MILLIS = 1_000L

@Composable
fun ReminderAlertScreen(
    reminder: Reminder,
    clock: AppClock,
    onDismiss: () -> Unit,
    onOpenTask: () -> Unit,
    modifier: Modifier = Modifier,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    // Quanto falta é vivo: com a tela acesa, "30 minutos" vira "29 minutos" sozinho.
    val now by produceState(clock.now(), clock) {
        while (true) {
            delay(TICK_MILLIS)
            value = clock.now()
        }
    }
    val intro = rememberIntro()
    val navigationInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val fieldColor = alertFieldColor(reminder.taskKind)
    // No escuro o campo é claro e leva a tinta do fundo; no claro ele é fechado e leva o branco do cartão.
    val onField = if (LocalBraidDarkTheme.current) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.surface

    BoxWithConstraints(modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        val scale = minOf(1f, maxWidth / DESIGN_WIDTH, maxHeight / DESIGN_HEIGHT)
        val remaining = remainingTimeOf(reminder.anchor, now)
        AlertField(
            kindLabel = alertKindLabel(reminder.taskKind),
            anchorLabel = alertAnchorLabel(now, reminder.anchor, zone, reminder.deadline),
            clockText = alertClock(reminder.anchor, zone),
            remainingLead = remaining?.lead,
            remainingAmount = remaining?.amount?.toString(),
            remainingUnit = remaining?.unit,
            color = fieldColor,
            contentColor = onField,
            scale = scale,
            intro = intro,
            modifier = Modifier.fillMaxSize().padding(bottom = SHEET_HEIGHT - SHEET_OVERLAP + navigationInset),
        )
        AlertSheet(
            name = reminder.name,
            onDismiss = onDismiss,
            onOpenTask = onOpenTask,
            navigationInset = navigationInset,
            intro = intro,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun AlertField(
    kindLabel: String,
    anchorLabel: String,
    clockText: String,
    remainingLead: String?,
    remainingAmount: String?,
    remainingUnit: String?,
    color: Color,
    contentColor: Color,
    scale: Float,
    intro: State<Float>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .drawWithContent {
                    val shown = part(intro.value, CURTAIN_DELAY, CURTAIN_MILLIS, CurtainEasing)
                    clipRect(bottom = size.height * shown) { this@drawWithContent.drawContent() }
                }.background(color)
                .statusBarsPadding()
                .padding(start = SIDE_PADDING, end = SIDE_PADDING, top = 24.dp, bottom = SHEET_OVERLAP + 36.dp * scale),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Text("Braid · lembrete".uppercase(), style = monoLabel(12.sp), color = contentColor, maxLines = 1)
        // Um bloco só para o leitor de tela: "Treino · começa às 14:30, faltam 30 minutos".
        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
            Column(Modifier.rise(intro, CLOCK_DELAY)) {
                Text("$kindLabel · $anchorLabel".uppercase(), style = monoLabel(13.sp), color = contentColor, maxLines = 1)
                Text(
                    text = clockText,
                    style = displayNumber(CLOCK_SIZE * scale),
                    color = contentColor,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier.padding(top = 10.dp * scale),
                )
            }
            Box(
                Modifier
                    .padding(top = 10.dp * scale, bottom = 22.dp * scale)
                    .fillMaxWidth()
                    .height(1.dp)
                    .graphicsLayer {
                        scaleX = part(intro.value, RULE_DELAY, RULE_MILLIS, RuleEasing)
                        transformOrigin = TransformOrigin(0f, 0.5f)
                    }.background(contentColor.copy(alpha = RULE_ALPHA)),
            )
            Column(Modifier.rise(intro, REMAINING_DELAY)) {
                if (remainingLead != null && remainingAmount != null && remainingUnit != null) {
                    Text(remainingLead.uppercase(), style = monoLabel(13.sp), color = contentColor, maxLines = 1)
                    Row(Modifier.padding(top = 2.dp * scale)) {
                        Text(
                            text = remainingAmount,
                            style = displayNumber(REMAINING_SIZE * scale),
                            color = contentColor,
                            maxLines = 1,
                            softWrap = false,
                            modifier = Modifier.alignByBaseline(),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = remainingUnit,
                            style = displayNumber(UNIT_SIZE * scale).copy(letterSpacing = (-0.01).em),
                            color = contentColor,
                            maxLines = 1,
                            softWrap = false,
                            modifier = Modifier.alignByBaseline(),
                        )
                    }
                } else {
                    // O horário chegou com a tela ainda acesa: não falta mais nada.
                    Text("Agora", style = displayNumber(REMAINING_SIZE * scale), color = contentColor, maxLines = 1, softWrap = false)
                }
            }
        }
    }
}

@Composable
private fun AlertSheet(
    name: String,
    onDismiss: () -> Unit,
    onOpenTask: () -> Unit,
    navigationInset: Dp,
    intro: State<Float>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .heightIn(min = SHEET_HEIGHT + navigationInset)
                .graphicsLayer { translationY = (1f - part(intro.value, SHEET_DELAY, SHEET_MILLIS, SheetEasing)) * size.height }
                .clip(RoundedCornerShape(topStart = SHEET_RADIUS, topEnd = SHEET_RADIUS))
                .background(MaterialTheme.colorScheme.background)
                .padding(start = SIDE_PADDING, end = SIDE_PADDING, top = 32.dp, bottom = 28.dp + navigationInset),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = name,
            style =
                TextStyle(
                    fontFamily = BraidSansFont,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 30.sp,
                    lineHeight = 34.sp,
                    letterSpacing = (-0.015).em,
                ),
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.rise(intro, NAME_DELAY).semantics { heading() },
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 24.dp).rise(intro, ACTIONS_DELAY),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = onDismiss,
                modifier = Modifier.weight(1f).height(ACTION_HEIGHT),
                shape = MaterialTheme.shapes.large,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onBackground),
            ) {
                Text("Dispensar", style = actionLabel(FontWeight.Medium), maxLines = 1)
            }
            Button(
                onClick = onOpenTask,
                modifier = Modifier.weight(1.4f).height(ACTION_HEIGHT),
                shape = MaterialTheme.shapes.large,
            ) {
                Text("Abrir tarefa", style = actionLabel(FontWeight.SemiBold), maxLines = 1)
            }
        }
    }
}

/** A cor do campo: a do tipo da tarefa, e o azul de "Só agenda" para o que não é refeição, sono nem treino. */
@Composable
private fun alertFieldColor(kind: TaskKind): Color =
    when (kind) {
        TaskKind.Meal -> documentTokens().meal
        TaskKind.Sleep -> documentTokens().sleep
        TaskKind.Training -> documentTokens().training
        else -> braidTokens().routine
    }

private fun monoLabel(size: TextUnit) =
    TextStyle(fontFamily = BraidMonoFont, fontWeight = FontWeight.Normal, fontSize = size, lineHeight = 1.3.em, letterSpacing = 0.08.em)

private fun actionLabel(weight: FontWeight) =
    TextStyle(fontFamily = BraidSansFont, fontWeight = weight, fontSize = 16.sp, lineHeight = 20.sp)

/**
 * Os números do cartaz, na Newsreader. O tamanho vem em dp do desenho e não cresce com a fonte do sistema: são
 * números de cartaz, medidos para caber na largura da tela.
 */
@Composable
private fun displayNumber(sizeDp: Float): TextStyle {
    val size = with(LocalDensity.current) { sizeDp.dp.toSp() }
    return TextStyle(
        fontFamily = BraidDisplayFont,
        fontWeight = FontWeight.Normal,
        fontSize = size,
        lineHeight = 1.em,
        letterSpacing = (-0.035).em,
    )
}

/** Os milissegundos da entrada, de 0 ao fim; com as animações do sistema desligadas ela já nasce no fim. */
@Composable
private fun rememberIntro(): State<Float> {
    val elapsed = remember { Animatable(0f) }
    LaunchedEffect(Unit) { elapsed.animateTo(INTRO_MILLIS, tween(INTRO_MILLIS.toInt(), easing = LinearEasing)) }
    return elapsed.asState()
}

/** Quanto de um trecho da entrada já passou (0 a 1), dado o atraso e a duração dele. */
private fun part(
    elapsed: Float,
    delay: Int,
    duration: Int,
    easing: Easing,
): Float = easing.transform(((elapsed - delay) / duration).coerceIn(0f, 1f))

private fun Modifier.rise(
    intro: State<Float>,
    delay: Int,
): Modifier =
    graphicsLayer {
        val shown = part(intro.value, delay, RISE_MILLIS, RiseEasing)
        alpha = shown
        translationY = (1f - shown) * RISE_DISTANCE.toPx()
    }
