package app.braid.mobile.ui.documents

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.tagColors

/**
 * O formulário do documento: criação (o `/nota` do chat, com o nome já digitado) e edição da nota de texto própria.
 * [onSaved] recebe o id do documento salvo ou criado e abre a leitura dele; [onDiscard] volta de onde a pessoa veio.
 */
@Composable
fun DocumentEditPage(
    onSaved: (id: String) -> Unit,
    onDiscard: () -> Unit,
    viewModel: DocumentEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val form = state as? DocumentEditUiState.Form
    val savedId = form?.savedId
    LaunchedEffect(savedId) { if (savedId != null) onSaved(savedId) }
    BackHandler(onBack = onDiscard)
    DocumentEditScreen(state, viewModel, onDiscard = onDiscard)
}

@Composable
fun DocumentEditScreen(
    state: DocumentEditUiState,
    actions: DocumentEditActions,
    onDiscard: () -> Unit,
) {
    val form = state as? DocumentEditUiState.Form
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
            .windowInsetsPadding(WindowInsets.ime)
            .navigationBarsPadding(),
    ) {
        Text(
            text = (if (form?.existing == false) "Novo documento" else "Editar documento").uppercase(),
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.1.em,
            textAlign = TextAlign.Center,
        )
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            when (state) {
                DocumentEditUiState.Loading -> Message("Carregando documento…", alert = false)
                DocumentEditUiState.NotEditable -> Message("Este documento não se edita aqui.", alert = true)
                DocumentEditUiState.Failed -> {
                    Message("Não foi possível carregar o documento. Tente novamente.", alert = true)
                    BraidPill(text = "Tentar de novo", onClick = actions::retry)
                }
                is DocumentEditUiState.Form -> FormBody(state, actions)
            }
        }
        Footer(form, onDiscard = onDiscard, onSave = actions::save)
    }
}

/** O que o formulário faz com a tela; o `ViewModel` implementa e a pré-visualização pode passar outra coisa. */
interface DocumentEditActions {
    fun retry()

    fun selectKind(kind: NewDocumentKind)

    fun setName(name: String)

    fun setBody(body: String)

    fun setMeal(meal: String)

    fun setMode(mode: EditorMode)

    fun setTagText(text: String)

    fun commitTag()

    fun removeTag(tag: String)

    fun save()
}

@Composable
private fun Message(
    text: String,
    alert: Boolean,
) {
    Text(
        text = text,
        modifier = Modifier.padding(top = 12.dp).semantics { liveRegion = if (alert) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )
}

@Composable
private fun FormBody(
    form: DocumentEditUiState.Form,
    actions: DocumentEditActions,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (form.existing) {
            TypeMark()
        } else {
            KindSwitch(form.kind, enabled = !form.saving, onSelect = actions::selectKind)
        }
        if (!form.isMeal) {
            TextBox(
                value = form.name,
                onValueChange = actions::setName,
                description = "Nome do documento",
                placeholder = "Nome (opcional)",
                singleLine = true,
                enabled = !form.saving,
                capitalization = KeyboardCapitalization.Sentences,
            )
        }
    }
    if (form.isMeal) {
        MealSection(form, actions)
    } else {
        ContentSection(form, actions)
        TagsSection(form, actions)
    }
    form.error?.let {
        Text(
            text = it,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            color = MaterialTheme.colorScheme.error,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
    }
}

@Composable
private fun TypeMark() {
    Text(
        text = "TEXT",
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = BraidMonoFont,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.1.em,
    )
}

/** Nota ou Alimento (só na criação): dois botões de pílula, o escolhido preenchido. */
@Composable
private fun KindSwitch(
    selected: NewDocumentKind,
    enabled: Boolean,
    onSelect: (NewDocumentKind) -> Unit,
) {
    Row(
        Modifier
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
            .padding(2.dp)
            .semantics { contentDescription = "Tipo" },
    ) {
        NewDocumentKind.entries.forEach { kind ->
            ModeButton(kind.label, selected = kind == selected, enabled = enabled) { onSelect(kind) }
        }
    }
}

@Composable
private fun ModeButton(
    label: String,
    selected: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .defaultMinSize(minHeight = 44.dp)
            .clip(CircleShape)
            .background(if (selected) scheme.onBackground.copy(alpha = 0.1f) else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp)
            .semantics { this.selected = selected },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (selected) scheme.onBackground else scheme.onSurfaceVariant,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun SectionLabel(title: String) {
    Text(
        title.uppercase(),
        modifier = Modifier.padding(bottom = 10.dp).semantics { heading() },
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = BraidMonoFont,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.1.em,
        fontWeight = FontWeight.Medium,
    )
}

@Composable
private fun MealSection(
    form: DocumentEditUiState.Form,
    actions: DocumentEditActions,
) {
    Column {
        SectionLabel("O que você comeu")
        TextBox(
            value = form.meal,
            onValueChange = actions::setMeal,
            description = "O que você comeu",
            placeholder = "Ex.: arroz, feijão, frango grelhado e salada",
            singleLine = false,
            minHeight = 112.dp,
            enabled = !form.saving,
            capitalization = KeyboardCapitalization.Sentences,
        )
        Text(
            "Os nutrientes são calculados depois de salvar.",
            modifier = Modifier.padding(top = 8.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            lineHeight = 18.sp,
        )
    }
}

@Composable
private fun ContentSection(
    form: DocumentEditUiState.Form,
    actions: DocumentEditActions,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("Conteúdo")
        Row(
            Modifier.border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)).padding(2.dp).semantics {
                contentDescription = "Modo do editor"
            },
        ) {
            EditorMode.entries.forEach { mode -> ModeButton(mode.label, selected = mode == form.mode) { actions.setMode(mode) } }
        }
        if (form.mode == EditorMode.Write) {
            TextBox(
                value = form.body,
                onValueChange = actions::setBody,
                description = "Conteúdo da nota",
                placeholder = "Escreva em markdown: ## subtítulo, **negrito**, - lista, - [ ] tarefa, > citação.",
                singleLine = false,
                minHeight = 256.dp,
                enabled = !form.saving,
                capitalization = KeyboardCapitalization.Sentences,
                mono = true,
            )
        } else {
            Box(
                Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 256.dp)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .semantics { contentDescription = "Visualização" },
            ) {
                if (form.body.isBlank()) {
                    Text(
                        "Nada para visualizar ainda.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                } else {
                    MarkdownView(form.body)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagsSection(
    form: DocumentEditUiState.Form,
    actions: DocumentEditActions,
) {
    Column {
        SectionLabel("Tags")
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            form.tags.forEach { tag ->
                Row(
                    Modifier
                        .defaultMinSize(minHeight = 44.dp)
                        .clip(CircleShape)
                        .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                        .clickable(role = Role.Button) { actions.removeTag(tag) }
                        .padding(horizontal = 14.dp)
                        .semantics { contentDescription = "Remover tag $tag" },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("#$tag", color = tagColors(tag).color, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
                    SvgIcon(
                        BraidIcons.close,
                        size = 14.dp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clearAndSetSemantics {},
                    )
                }
            }
            TagField(form.tagText, enabled = !form.saving, onChange = actions::setTagText, onCommit = actions::commitTag)
        }
    }
}

@Composable
private fun TagField(
    text: String,
    enabled: Boolean,
    onChange: (String) -> Unit,
    onCommit: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    BasicTextField(
        value = text,
        onValueChange = { next ->
            // A vírgula confirma a tag, como no web.
            if (next.endsWith(",")) {
                onChange(next.dropLast(1))
                onCommit()
            } else {
                onChange(next)
            }
        },
        enabled = enabled,
        singleLine = true,
        interactionSource = interaction,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onCommit() }),
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp),
        cursorBrush = SolidColor(braidBrand()),
        modifier =
            Modifier
                .semantics { contentDescription = "Nova tag" }
                .onFocusChanged { if (!it.isFocused) onCommit() },
        decorationBox = { inner ->
            Row(
                Modifier
                    .defaultMinSize(minWidth = 120.dp, minHeight = 44.dp)
                    .border(1.dp, if (focused) braidBrand() else MaterialTheme.colorScheme.outline, CircleShape)
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SvgIcon(
                    BraidIcons.plus,
                    size = 14.dp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clearAndSetSemantics {},
                )
                Box {
                    if (text.isEmpty()) Text("Nova tag", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                    inner()
                }
            }
        },
    )
}

/** O campo de texto do formulário: borda de 18dp que ganha o verde da marca no foco, como os campos do login. */
@Composable
private fun TextBox(
    value: String,
    onValueChange: (String) -> Unit,
    description: String,
    placeholder: String,
    singleLine: Boolean,
    enabled: Boolean,
    capitalization: KeyboardCapitalization,
    minHeight: androidx.compose.ui.unit.Dp = 52.dp,
    mono: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = singleLine,
        interactionSource = interaction,
        keyboardOptions =
            KeyboardOptions(
                capitalization = capitalization,
                imeAction = if (singleLine) ImeAction.Next else ImeAction.Default,
            ),
        textStyle =
            MaterialTheme.typography.bodyLarge.copy(
                color = scheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 24.sp,
                fontFamily = if (mono) BraidMonoFont else MaterialTheme.typography.bodyLarge.fontFamily,
            ),
        cursorBrush = SolidColor(braidBrand()),
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = description },
        decorationBox = { inner ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = minHeight)
                    .border(1.dp, if (focused) braidBrand() else scheme.outline, RoundedCornerShape(18.dp))
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                contentAlignment = Alignment.TopStart,
            ) {
                if (value.isEmpty()) {
                    Text(placeholder, color = scheme.onSurfaceVariant.copy(alpha = 0.7f), fontSize = 15.sp, lineHeight = 24.sp)
                }
                inner()
            }
        },
    )
}

@Composable
private fun Footer(
    form: DocumentEditUiState.Form?,
    onDiscard: () -> Unit,
    onSave: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BraidPill(text = "Descartar", onClick = onDiscard)
        if (form != null) {
            Box(
                Modifier
                    .defaultMinSize(minHeight = 44.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary)
                    .clickable(enabled = !form.saving, role = Role.Button, onClick = onSave)
                    .padding(horizontal = 24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (form.saving) "Salvando…" else "Salvar",
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
