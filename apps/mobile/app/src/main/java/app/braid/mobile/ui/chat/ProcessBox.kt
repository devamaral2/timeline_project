@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.chat

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidSuccess
import app.braid.mobile.data.dto.AiProcessDto
import app.braid.mobile.data.dto.AiProcessQueryResultDto
import app.braid.mobile.data.dto.AiProcessStepDto
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/** Antes de o servidor responder o primeiro estado, a caixa já mostra o título, como o servidor o escreve. */
private const val FALLBACK_TITLE = "Realizando processos:"

/**
 * `.processBox` do web: o título e a lista de passos, com check verde ao concluir e vermelho ao falhar. Todo texto
 * vem predefinido do servidor; só a mensagem do fim (resposta do fallback ou o que falhou) é livre.
 */
@Composable
internal fun ProcessBox(
    process: AiProcessDto?,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val steps = process?.steps.orEmpty()
    val query = steps.firstNotNullOfOrNull { it.result }
    Column(
        modifier =
            modifier
                .fillMaxWidth(0.96f)
                .border(BorderStroke(1.dp, colors.outline), RoundedCornerShape(14.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp)
                .semantics { contentDescription = "Processo" },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = process?.title ?: FALLBACK_TITLE,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = colors.onSurfaceVariant,
        )
        if (steps.isEmpty() && process?.message == null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = braidBrand())
                Text(text = "Entendendo o pedido…", fontSize = 12.sp, color = colors.onSurfaceVariant)
            }
        }
        steps.forEach { ProcessStepRow(it) }
        query?.let { ProcessRows(it) }
        process?.message?.let { message ->
            Text(
                text = message,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                color = if (process.status == "failed") colors.error else colors.onSurface,
            )
        }
    }
}

/** O texto que o leitor de tela diz para o estado do passo. */
internal fun stepStatusText(step: AiProcessStepDto): String =
    when (step.status) {
        "succeeded" -> "concluído"
        "failed" -> "falhou"
        "running" -> "em andamento"
        else -> "aguardando"
    }

@Composable
private fun ProcessStepRow(step: AiProcessStepDto) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "${step.label}, ${stepStatusText(step)}" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StepMark(step)
        Text(
            text = step.label,
            fontSize = 13.sp,
            color = if (step.status == "pending") colors.onSurfaceVariant else colors.onSurface,
        )
    }
}

/** Check verde, X vermelho, giro da marca enquanto roda e círculo vazio enquanto espera. */
@Composable
private fun StepMark(step: AiProcessStepDto) {
    val colors = MaterialTheme.colorScheme
    when {
        step.succeeded ->
            FilledMark(braidSuccess()) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
            }
        step.failed ->
            FilledMark(colors.error) {
                Icon(Icons.Filled.Close, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
            }
        step.running -> CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = braidBrand())
        else -> Box(modifier = Modifier.size(18.dp).border(BorderStroke(1.dp, colors.outline), CircleShape))
    }
}

@Composable
private fun FilledMark(
    color: Color,
    content: @Composable () -> Unit,
) {
    Box(modifier = Modifier.size(18.dp).background(color, CircleShape), contentAlignment = Alignment.Center) { content() }
}

@Composable
private fun ProcessRows(result: AiProcessQueryResultDto) {
    val colors = MaterialTheme.colorScheme
    if (result.rows.isEmpty()) {
        Text(text = "Nenhum resultado.", fontSize = 12.sp, color = colors.onSurfaceVariant)
        return
    }
    Column(
        modifier =
            Modifier
                .semantics { contentDescription = "Resultado da consulta" }
                .heightIn(max = 220.dp)
                .verticalScroll(rememberScrollState())
                .horizontalScroll(rememberScrollState()),
    ) {
        Row { result.columns.forEach { Cell(it, header = true) } }
        result.rows.forEach { row -> Row { row.forEach { Cell(cellText(it), header = false) } } }
    }
    if (result.truncated) Text(text = "Mostrando só as primeiras linhas.", fontSize = 12.sp, color = colors.onSurfaceVariant)
}

@Composable
private fun Cell(
    text: String,
    header: Boolean,
) {
    Text(
        modifier = Modifier.width(120.dp).padding(end = 8.dp, top = 4.dp, bottom = 4.dp),
        text = text,
        fontSize = 12.sp,
        fontWeight = if (header) FontWeight.SemiBold else FontWeight.Normal,
        color = if (header) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** Uma célula como texto: nulo vazio, texto sem aspas, o resto como o servidor o escreveu. */
internal fun cellText(cell: kotlinx.serialization.json.JsonElement): String =
    when (cell) {
        is JsonNull -> ""
        is JsonPrimitive -> cell.content
        else -> cell.toString()
    }
