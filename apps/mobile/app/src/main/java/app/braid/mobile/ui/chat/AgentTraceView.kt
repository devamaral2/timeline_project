package app.braid.mobile.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.chat.ChatRoute
import app.braid.mobile.domain.chat.ChatTrace
import app.braid.mobile.domain.chat.TraceEntry
import app.braid.mobile.domain.chat.TraceKind
import app.braid.mobile.domain.chat.TraceLane
import app.braid.mobile.domain.chat.TraceRunStatus
import app.braid.mobile.domain.chat.TraceStatus
import app.braid.mobile.domain.chat.timelineBars
import app.braid.mobile.domain.chat.traceDuration
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val KindIcons: Map<TraceKind, List<SvgPart>> =
    mapOf(
        TraceKind.Request to ChatIcons.traceRequest,
        TraceKind.Routing to ChatIcons.traceRouting,
        TraceKind.Thought to ChatIcons.traceThought,
        TraceKind.Agent to ChatIcons.traceAgent,
        TraceKind.Tool to ChatIcons.traceTool,
        TraceKind.Message to ChatIcons.traceMessage,
        TraceKind.Answer to ChatIcons.traceAnswer,
    )

private val Lanes = listOf(TraceLane.Talk, TraceLane.Model, TraceLane.Tool)
private const val EMPTY_TRACE =
    "O processo de cada pedido aparece aqui: o que a IA pensou, que agentes e ferramentas usou e quanto tempo levou."

/**
 * A aba "Processo" do chat: para cada pedido, a linha do tempo e a lista de tudo o que a IA fez — o que pensou, que agentes e
 * ferramentas usou, o que entrou e saiu de cada um e quanto levou. Ao vivo enquanto ela trabalha e, depois, o registro. Todo
 * texto vem do servidor e é mostrado como texto.
 */
@Composable
internal fun AgentTraceView(
    turns: List<ChatTurn>,
    modifier: Modifier = Modifier,
) {
    // Um passo aberto por vez, no pedido em que ele está.
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    if (turns.isEmpty()) {
        Text(
            text = EMPTY_TRACE,
            modifier = modifier.fillMaxWidth().padding(vertical = 20.dp).semantics { contentDescription = "Processo da IA" },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 14.sp,
            lineHeight = 22.sp,
        )
        return
    }
    LazyColumn(
        modifier.fillMaxWidth().semantics { contentDescription = "Processo da IA" },
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        items(turns, key = { it.id }) { turn ->
            TraceTurn(
                turn = turn,
                openEntry = open?.takeIf { it.startsWith("${turn.id}:") }?.removePrefix("${turn.id}:"),
                onToggle = { entryId ->
                    val key = "${turn.id}:$entryId"
                    open = if (open == key) null else key
                },
            )
        }
    }
}

@Composable
private fun TraceTurn(
    turn: ChatTurn,
    openEntry: String?,
    onToggle: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val trace = turn.trace
    val failed = !turn.running && (trace == null || trace.status == TraceRunStatus.Failed)
    val stateText =
        if (turn.running) {
            "em andamento"
        } else if (failed) {
            "não concluído"
        } else {
            "concluído"
        }
    val entries = trace?.entries.orEmpty()
    Column(
        Modifier.fillMaxWidth().semantics {
            contentDescription = "Pedido: ${turn.request}"
        },
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "${if (turn.route == ChatRoute.Hermes) "Hermes" else "Assistente"} · $stateText".uppercase(),
                color = if (failed) scheme.error else scheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.1.em,
            )
            Text(text = turn.request, color = scheme.onBackground, fontSize = 17.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
            if (trace != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(20.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                    trace.durationMs?.let { Total("Duração", traceDuration(it)) }
                    Total("Passos", entries.size.toString())
                    for (field in trace.fields) Total(field.label, field.value)
                }
            }
        }
        if (trace != null) TraceTimeline(trace, openEntry, onToggle)
        if (entries.isEmpty()) {
            Text(
                text = if (turn.running) "Esperando o primeiro passo…" else "Sem detalhes deste pedido.",
                color = scheme.onSurfaceVariant,
                fontSize = 13.sp,
            )
        } else {
            Column(Modifier.semantics { contentDescription = "Passos do pedido" }) {
                for (entry in entries) TraceEntryRow(entry, open = openEntry == entry.id, onToggle = { onToggle(entry.id) })
            }
        }
    }
}

@Composable
private fun Total(
    label: String,
    value: String,
) {
    val scheme = MaterialTheme.colorScheme
    Column {
        Text(text = label, color = scheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
        Text(text = value, color = scheme.onBackground, fontFamily = BraidMonoFont, fontSize = 13.sp, lineHeight = 18.sp)
    }
}

/** A cor de uma barra ou marca, pelo estado do passo. */
@Composable
private fun statusColor(status: TraceStatus) =
    when (status) {
        TraceStatus.Done -> braidTokens().brand
        TraceStatus.Running -> MaterialTheme.colorScheme.tertiary
        TraceStatus.Failed -> MaterialTheme.colorScheme.error
        TraceStatus.Pending -> MaterialTheme.colorScheme.outlineVariant
    }

/** A linha do tempo do pedido, uma raia por tipo de trabalho; tocar numa barra abre o passo na lista. */
@Composable
private fun TraceTimeline(
    trace: ChatTrace,
    openEntry: String?,
    onToggle: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val timeline = remember(trace) { timelineBars(trace, System.currentTimeMillis()) }
    if (timeline.bars.isEmpty()) return
    val lanes = Lanes.filter { lane -> timeline.bars.any { it.lane == lane } }
    Column(
        Modifier.fillMaxWidth().semantics {
            contentDescription = "Linha do tempo do pedido, ${traceDuration(timeline.totalMs)}"
        },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        for (lane in lanes) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = lane.title, color = scheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 14.sp)
                BoxWithConstraints(Modifier.fillMaxWidth().height(12.dp).background(scheme.secondary, RoundedCornerShape(3.dp))) {
                    val track = maxWidth
                    for (bar in timeline.bars.filter { it.lane == lane }) {
                        val width = (track * bar.width.toFloat()).coerceAtLeast(3.dp)
                        Box(
                            Modifier
                                .offset(x = (track * bar.left.toFloat()).coerceAtMost(track - width))
                                .width(width)
                                .height(12.dp)
                                .background(statusColor(bar.entry.status), RoundedCornerShape(3.dp))
                                .then(
                                    if (openEntry ==
                                        bar.entry.id
                                    ) {
                                        Modifier.border(1.dp, scheme.onBackground, RoundedCornerShape(3.dp))
                                    } else {
                                        Modifier
                                    },
                                ).clickable(role = Role.Button) { onToggle(bar.entry.id) }
                                .semantics {
                                    contentDescription = bar.entry.label + (bar.entry.durationMs?.let { ", ${traceDuration(it)}" } ?: "")
                                },
                        )
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(text = "0", color = scheme.onSurfaceVariant, fontFamily = BraidMonoFont, fontSize = 11.sp)
            Text(text = traceDuration(timeline.totalMs), color = scheme.onSurfaceVariant, fontFamily = BraidMonoFont, fontSize = 11.sp)
        }
    }
}

@Composable
private fun TraceEntryRow(
    entry: TraceEntry,
    open: Boolean,
    onToggle: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .clickable(role = Role.Button, onClick = onToggle)
                .semantics { stateDescription = "${entry.status.text}, ${if (open) "aberto" else "fechado"}" }
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) {
                if (entry.status == TraceStatus.Running) {
                    Spinner(16.dp, scheme.tertiary)
                } else {
                    SvgIcon(KindIcons.getValue(entry.kind), size = 16.dp, color = statusColor(entry.status), strokeWidth = 1.75f)
                }
            }
            Column(Modifier.weight(1f)) {
                Text(text = entry.label, color = scheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
                entry.summary?.let {
                    Text(
                        text = it,
                        color = scheme.onSurfaceVariant,
                        fontFamily = BraidMonoFont,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            entry.durationMs?.let {
                Text(
                    text = traceDuration(it),
                    color = scheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontSize = 12.sp,
                )
            }
            SvgIcon(
                ChatIcons.chevronRight,
                size = 16.dp,
                color = scheme.outlineVariant,
                strokeWidth = 2f,
                modifier = Modifier.rotate(if (open) 90f else 0f),
            )
        }
        if (open) TraceDetail(entry)
        Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
    }
}

@Composable
private fun TraceDetail(entry: TraceEntry) {
    val scheme = MaterialTheme.colorScheme
    var raw by rememberSaveable(entry.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp, start = 36.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            for ((label, isRaw) in listOf("Resumo" to false, "Bruto" to true)) {
                Text(
                    text = label.uppercase(),
                    modifier =
                        Modifier
                            .heightIn(min = 36.dp)
                            .clickable(role = Role.Button) { raw = isRaw }
                            .semantics { selected = raw == isRaw }
                            .padding(top = 10.dp),
                    color = if (raw == isRaw) scheme.onBackground else scheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontSize = 12.sp,
                    letterSpacing = 0.1.em,
                    fontWeight = if (raw == isRaw) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
        if (raw) {
            Text(
                text = entry.rawJson,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(
                            scheme.secondary,
                            RoundedCornerShape(5.dp),
                        ).horizontalScroll(rememberScrollState())
                        .padding(10.dp),
                color = scheme.onBackground,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                softWrap = false,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Field("Tipo", entry.kind.title)
                entry.source?.let { Field("Origem", it, mono = true) }
                Field("Estado", entry.status.text)
                entry.startedAtMs?.let { Field("Início", clock(it)) }
                entry.durationMs?.let { Field("Duração", traceDuration(it)) }
                for (field in entry.fields) Field(field.label, field.value)
            }
            for (section in entry.sections) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(text = section.title, color = scheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    if (section.code) {
                        Text(
                            text = section.text,
                            modifier = Modifier.fillMaxWidth().background(scheme.secondary, RoundedCornerShape(5.dp)).padding(10.dp),
                            color = scheme.onBackground,
                            fontFamily = BraidMonoFont,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                        )
                    } else {
                        Text(text = section.text, color = scheme.onBackground, fontSize = 13.sp, lineHeight = 20.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun Field(
    label: String,
    value: String,
    mono: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(text = label, modifier = Modifier.width(72.dp), color = scheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
        Text(
            text = value,
            modifier = Modifier.weight(1f),
            color = scheme.onBackground,
            fontFamily = if (mono) BraidMonoFont else null,
            fontSize = 12.sp,
            lineHeight = 18.sp,
        )
    }
}

private val ClockFormat = DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.of(TIMELINE_TIME_ZONE))

private fun clock(ms: Long): String = ClockFormat.format(Instant.ofEpochMilli(ms))
