package app.braid.mobile.ui.notes

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Note
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.BraidNoteBodyStyle
import app.braid.mobile.core.designsystem.BraidNoteExcerptStyle
import app.braid.mobile.core.designsystem.BraidNoteTitleStyle
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.tagColors

// Prévia visual: os mesmos exemplos dos HTMLs e do web, sem persistência.
private data class NotePreview(
    val title: String,
    val body: String,
    val source: String,
    val time: String,
    val group: String,
    val tags: List<String>,
)

private val examples =
    listOf(
        NotePreview(
            "Frango grelhado com arroz integral e legumes",
            "Informações nutricionais e receita. 512 kcal, 51 g de proteína, preparo em 35 min.",
            "Evento · Almoço",
            "09:40",
            "Hoje",
            listOf("caseiro"),
        ),
        NotePreview(
            "Treino A · peito e tríceps",
            "415 kcal gastas em 1 h. Esteira por 20 min e musculação com supino, crucifixo e tríceps na polia.",
            "Evento · Academia",
            "08:05",
            "Hoje",
            listOf("saúde", "força"),
        ),
        NotePreview(
            "Noite de 13 para 14 de setembro",
            "Pontuação do sono 82 de 100. O app registrou 7 h 02; na agenda foram 7 h 30.",
            "Evento · Noite de sono",
            "06:45",
            "Hoje",
            listOf(),
        ),
        NotePreview(
            "Ideias para a proposta",
            "Começar pelo problema do cliente, não pela solução. Mostrar o cronograma da segunda fase numa página só.",
            "Tarefa · Revisar proposta",
            "21:12",
            "Ontem",
            listOf("trabalho"),
        ),
        NotePreview(
            "Livros para ler",
            "O avesso da pele, Torto arado, A hora da estrela e o novo da Conceição Evaristo.",
            "Nota solta",
            "sex., 11 set.",
            "Esta semana",
            listOf("pessoal"),
        ),
        NotePreview(
            "Lista do mercado",
            "Arroz integral, frango, brócolis, cenoura, azeite, café e aveia.",
            "Nota solta",
            "qua., 9 set.",
            "Esta semana",
            listOf("casa"),
        ),
    )

@Composable
@Suppress("ktlint:standard:function-naming")
fun NotesScreen(modifier: Modifier = Modifier) {
    var filter by remember { mutableStateOf("Todas") }
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<NotePreview?>(null) }
    var creating by remember { mutableStateOf(false) }
    var expandedWorkout by remember { mutableStateOf(false) }
    var source by remember { mutableStateOf("Nota solta") }
    var content by remember { mutableStateOf("") }
    var tags by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf(examples) }
    BackHandler(enabled = creating || selected != null) {
        if (creating) creating = false else selected = null
    }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        val note = selected
        if (creating) {
            TextButton(onClick = { creating = false }) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null)
                Text("Notas")
            }
            Text("Nota", style = MaterialTheme.typography.displayMedium)
            OutlinedTextField(
                value = content,
                onValueChange = { content = it },
                label = { Text("Conteúdo da nota") },
                placeholder = { Text("Fim de semana\n\nSuas anotações…") },
                minLines = 6,
                modifier = Modifier.fillMaxWidth(),
            )
            Text("A primeira linha vira o título.", style = MaterialTheme.typography.bodySmall, color = muted)
            Text("Ligada a", style = MaterialTheme.typography.bodySmall, color = muted)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (listOf("Nota solta") + examples.map { it.source }.filter { it != "Nota solta" }).forEach { value ->
                    FilterChip(selected = source == value, onClick = { source = value }, label = {
                        Text(
                            if (value ==
                                "Nota solta"
                            ) {
                                "Evento ou tarefa · opcional"
                            } else {
                                value
                            },
                        )
                    })
                }
            }
            OutlinedTextField(value = tags, onValueChange = {
                tags = it
            }, label = { Text("Tags") }, placeholder = { Text("#pessoal") }, modifier = Modifier.fillMaxWidth())
            Button(
                enabled = content.isNotBlank(),
                onClick = {
                    val lines = content.trim().lines()
                    val draft =
                        NotePreview(
                            lines.first(),
                            lines
                                .drop(
                                    1,
                                ).joinToString("\n"),
                            source,
                            "Agora",
                            "Hoje",
                            tags
                                .split(Regex("[,\\s]+"))
                                .map {
                                    it.removePrefix("#")
                                }.filter { it.isNotBlank() },
                        )
                    notes = listOf(draft) + notes
                    selected = draft
                    creating = false
                    content = ""
                    tags = ""
                    source = "Nota solta"
                },
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Criar nota") }
            Text("Prévia · rascunho apenas nesta sessão", style = MaterialTheme.typography.bodySmall, color = muted)
        } else if (note != null) {
            TextButton(onClick = { selected = null }) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null)
                Text("Notas")
            }
            Text(note.title, style = BraidNoteTitleStyle)
            Text(note.source, style = MaterialTheme.typography.bodySmall, color = muted)
            NoteTags(note.tags)
            Text("Criada ${note.group.lowercase()}, ${note.time}", style = MaterialTheme.typography.bodySmall, color = muted)
            HorizontalDivider()
            if (note.source.contains("Academia")) {
                Text("Calorias gastas", style = MaterialTheme.typography.bodySmall, color = muted)
                Text("415 kcal    1 h", style = MaterialTheme.typography.displayLarge)
                Text("Treinos", style = MaterialTheme.typography.headlineMedium)
                Text("Esteira", style = MaterialTheme.typography.titleLarge)
                Text("20 min · 3,2 km · 6′15″/km    190 kcal", style = MaterialTheme.typography.bodySmall, color = muted)
                HorizontalDivider()
                TextButton(onClick = { expandedWorkout = !expandedWorkout }) {
                    Text("Musculação · 225 kcal")
                }
                Text("40 min · 3 exercícios · 10 séries", style = MaterialTheme.typography.bodySmall, color = muted)
                if (expandedWorkout) Text("Supino, crucifixo e tríceps na polia.", style = BraidNoteBodyStyle)
            } else {
                Text(
                    if (note.title ==
                        "Ideias para a proposta"
                    ) {
                        "Começar pelo problema do cliente, não pela solução. Eles reclamaram duas vezes do prazo da primeira fase, e é isso que a proposta precisa resolver primeiro."
                    } else {
                        note.body
                    },
                    style = BraidNoteBodyStyle,
                )
            }
            if (note.title == "Ideias para a proposta") {
                Text("Pontos para a reunião", style = MaterialTheme.typography.headlineMedium)
                Text(
                    "• Mostrar o cronograma da segunda fase numa página só.\n• Separar o preço da fase 2 do suporte mensal.\n• Levar os números de uso de agosto.",
                    style = BraidNoteBodyStyle,
                )
                Text("Dúvida", style = MaterialTheme.typography.headlineMedium)
                Text("O desconto de 10% vale para o contrato anual inteiro ou só para o primeiro ano?", style = BraidNoteBodyStyle)
            }
            Text("Prévia · dados de exemplo", style = MaterialTheme.typography.bodySmall, color = muted)
        } else {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Notas", style = MaterialTheme.typography.displayMedium)
                    Text("${notes.size} notas", style = MaterialTheme.typography.bodySmall, color = muted)
                }
                IconButton(onClick = { searching = !searching }) { Icon(Icons.Outlined.Search, contentDescription = "Buscar notas") }
            }
            if (searching) {
                OutlinedTextField(value = query, onValueChange = {
                    query = it
                }, label = { Text("Buscar notas") }, modifier = Modifier.fillMaxWidth())
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Todas", "Eventos", "Tarefas", "Soltas").forEach { value ->
                    FilterChip(selected = filter == value, onClick = { filter = value }, label = { Text(value) })
                }
            }
            Button(onClick = { creating = true }, shape = MaterialTheme.shapes.small) { Text("Nova nota") }
            val visible =
                notes.filter {
                    (
                        filter == "Todas" ||
                            (filter == "Eventos" && it.source.startsWith("Evento")) ||
                            (filter == "Tarefas" && it.source.startsWith("Tarefa")) ||
                            (filter == "Soltas" && it.source == "Nota solta")
                    ) &&
                        "${it.title} ${it.body} ${it.tags.joinToString()}".contains(query, ignoreCase = true)
                }
            listOf("Hoje", "Ontem", "Esta semana").forEach { group ->
                val items = visible.filter { it.group == group }
                if (items.isNotEmpty()) {
                    Text("${group.uppercase()}   ${items.size}", style = MaterialTheme.typography.labelMedium)
                    items.forEach { item ->
                        Surface(
                            onClick = { selected = item },
                            shape = MaterialTheme.shapes.large,
                            color = MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Icon(
                                        when {
                                            item.source.contains("Academia") -> Icons.Outlined.FitnessCenter
                                            item.source.contains("Almoço") -> Icons.Outlined.Restaurant
                                            item.source.contains("sono") -> Icons.Outlined.Bedtime
                                            item.source.startsWith("Tarefa") -> Icons.Outlined.Schedule
                                            else -> Icons.Outlined.Note
                                        },
                                        contentDescription = null,
                                        tint = muted,
                                    )
                                    Text(
                                        item.source,
                                        modifier = Modifier.weight(1f),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = muted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(item.time, style = MaterialTheme.typography.bodySmall, color = muted)
                                }
                                Text(item.title, style = MaterialTheme.typography.headlineSmall)
                                Text(
                                    item.body,
                                    style = BraidNoteExcerptStyle,
                                    color = muted,
                                    maxLines = 3,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                NoteTags(item.tags)
                            }
                        }
                    }
                }
            }
            if (visible.isEmpty()) Text("Nenhuma nota encontrada.", color = muted)
            Text("Prévia · dados de exemplo · rascunhos apenas nesta sessão", style = MaterialTheme.typography.bodySmall, color = muted)
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun NoteTags(tags: List<String>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        tags.forEach { tag ->
            val colors = tagColors(tag, LocalBraidDarkTheme.current)
            Surface(color = colors.backgroundColor, shape = MaterialTheme.shapes.extraSmall) {
                Text(
                    "#$tag",
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    color = colors.color,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}
