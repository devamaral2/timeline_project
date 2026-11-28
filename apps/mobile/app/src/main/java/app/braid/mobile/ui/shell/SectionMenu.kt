package app.braid.mobile.ui.shell

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.Motion
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.scaledSpring
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.domain.executor.ViewMode
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** A mola padrão do `fadeIn` e do `fadeOut` (`StiffnessMediumLow`), na escala do Motion. */
private val FadeSpring = scaledSpring<Float>(Spring.StiffnessMediumLow)

/** A linha escolhida acende antes de o menu fechar. */
private const val PICK_CLOSE_DELAY_MS = Motion.MENU_PICK_CLOSE_MS.toLong()

/** A configuração só volta ao início depois de o menu fechar, para não trocar de corpo no meio da saída. */
private const val SETTINGS_RESET_DELAY_MS = Motion.MENU_SETTLE_MS.toLong()

private val Layers =
    listOf(
        SvgPart("M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"),
        SvgPart("M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"),
        SvgPart("M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"),
    )
private val User = listOf(SvgPart("M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"), SvgPart(svgCircle(12f, 7f, 4f)))
private val SearchGlyph = listOf(SvgPart("m21 21-4.34-4.34"), SvgPart(svgCircle(11f, 11f, 8f)))

/** A engrenagem de duas linhas do web (`TwoLineSliders`). */
private val Sliders = listOf(SvgPart("M3 8h7M14 8h7M14 6v4"), SvgPart("M3 16h7M14 16h7M10 14v4"))

/** De quem são as tarefas: três linhas como as outras listas, cada uma com o ponto da cor do seu modo. */
private data class ModeRow(
    val mode: ViewMode,
    val name: String,
    val description: String,
    val documentsDescription: String,
    val icon: List<SvgPart>,
)

private val ModeRows =
    listOf(
        ModeRow(ViewMode.All, "Todos", "você e agentes", "você e agentes", Layers),
        ModeRow(ViewMode.Human, "Você", "só as suas tarefas", "só os seus artefatos", User),
        ModeRow(ViewMode.Agent, "Agentes", "só tarefas de agentes", "só artefatos de agentes", BraidIcons.bot),
    )

/**
 * O corpo do menu da seção, que a dock mostra acima das abas quando se toca de novo na aba atual:
 * o nome da seção com a contagem, a engrenagem, as listas (Todos, Você, Agentes e as da tela) e a busca.
 * Escolher uma lista fecha o menu; a engrenagem troca o corpo pela configuração.
 */
@Composable
fun SectionMenuBody(
    tab: MainTab,
    model: SectionMenuModel?,
    mode: ViewMode,
    open: Boolean,
    onSelectMode: (ViewMode) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    val settings = model?.settings.orEmpty()
    val lower = tab.label.lowercase()

    LaunchedEffect(open) {
        if (!open) {
            delay(SETTINGS_RESET_DELAY_MS)
            settingsOpen = false
        }
    }
    // Sem configuração (a tela mudou) o corpo volta às listas.
    if (settings.isEmpty() && settingsOpen) settingsOpen = false

    fun pick(action: () -> Unit) {
        action()
        scope.launch {
            delay(PICK_CLOSE_DELAY_MS)
            onClose()
        }
    }

    Column(
        modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Opções de $lower" }
            .padding(9.dp),
    ) {
        Header(
            title = tab.label,
            count = model?.count,
            hasSettings = settings.isNotEmpty(),
            settingsOpen = settingsOpen,
            lower = lower,
            onToggleSettings = { settingsOpen = !settingsOpen },
        )
        AnimatedContent(
            targetState = settingsOpen,
            transitionSpec = { fadeIn(FadeSpring) togetherWith fadeOut(FadeSpring) },
            label = "menuPane",
        ) { inSettings ->
            if (inSettings) {
                SettingsPane(settings = settings, model = model)
            } else {
                ListsPane(
                    tab = tab,
                    model = model,
                    mode = mode,
                    onPickMode = { picked -> pick { onSelectMode(picked) } },
                    onPickList = { list -> pick(list.onPick) },
                    onClose = onClose,
                )
            }
        }
    }
}

@Composable
private fun Header(
    title: String,
    count: Int?,
    hasSettings: Boolean,
    settingsOpen: Boolean,
    lower: String,
    onToggleSettings: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(start = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        if (settingsOpen) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconCircle(BraidIcons.chevronLeft, "Voltar para as listas", outlined = true, onClick = onToggleSettings)
                Text(
                    text = "Configurar $lower".uppercase(),
                    modifier = Modifier.semantics { heading() },
                    color = scheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontWeight = FontWeight.Medium,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    letterSpacing = 0.12.em,
                )
            }
        } else {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = title,
                    modifier = Modifier.semantics { heading() },
                    color = scheme.onBackground,
                    fontFamily = BraidDisplayFont,
                    fontSize = 22.sp,
                    lineHeight = 28.sp,
                    letterSpacing = (-0.01).em,
                )
                if (count != null) {
                    Text(
                        text = count.toString(),
                        modifier = Modifier.padding(bottom = 4.dp),
                        color = scheme.onSurfaceVariant,
                        fontFamily = BraidMonoFont,
                        fontWeight = FontWeight.Medium,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                    )
                }
            }
            if (hasSettings) {
                IconCircle(Sliders, "Configurar $lower", outlined = false, onClick = onToggleSettings)
            }
        }
    }
}

/** O botão redondo do cabeçalho: a engrenagem (44dp, fundo secundário) ou o voltar da configuração (36dp, contorno). */
@Composable
private fun IconCircle(
    icon: List<SvgPart>,
    description: String,
    outlined: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val size = if (outlined) 36.dp else 44.dp
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .then(
                    if (outlined) {
                        Modifier.border(
                            1.dp,
                            scheme.outline,
                            CircleShape,
                        )
                    } else {
                        Modifier.background(scheme.secondary, CircleShape)
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            SvgIcon(icon, size = 20.dp, color = if (outlined) scheme.onSurfaceVariant else scheme.onBackground, strokeWidth = 1.75f)
        }
    }
}

@Composable
private fun ListsPane(
    tab: MainTab,
    model: SectionMenuModel?,
    mode: ViewMode,
    onPickMode: (ViewMode) -> Unit,
    onPickList: (SectionList) -> Unit,
    onClose: () -> Unit,
) {
    Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = 296.dp)
                .verticalScroll(rememberScrollState())
                .semantics { contentDescription = "Listas" },
        ) {
            SectionLabel("Listas", Modifier.padding(horizontal = 10.dp).padding(top = 8.dp, bottom = 6.dp))
            for (row in ModeRows) {
                val description = if (tab == MainTab.Documents) row.documentsDescription else row.description
                MenuItem(
                    name = row.name,
                    description = description,
                    icon = row.icon,
                    selected = mode == row.mode,
                    dot = modeDotColor(row.mode),
                    count = null,
                    onClick = { onPickMode(row.mode) },
                )
            }
            for (list in model?.lists.orEmpty()) {
                MenuItem(
                    name = list.name,
                    description = list.description,
                    icon = list.icon,
                    selected = list.selected,
                    dot = null,
                    count = list.count,
                    onClick = { onPickList(list) },
                )
            }
        }
        model?.search?.let { SearchField(it, onSubmit = onClose) }
        // No web o botão mora na configuração; só uma seção sem engrenagem o mostra aqui, para não ficar inalcançável.
        if (model != null && model.settings.isEmpty() && model.filtered && model.onClear != null) ClearFilters(model.onClear)
    }
}

@Composable
private fun modeDotColor(mode: ViewMode): Color =
    when (mode) {
        ViewMode.All -> braidTokens().modeAll
        ViewMode.Human -> MaterialTheme.colorScheme.primary
        ViewMode.Agent -> MaterialTheme.colorScheme.tertiary
    }

@Composable
private fun SectionLabel(
    text: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = text.uppercase(),
        modifier = modifier,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = BraidMonoFont,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.1.em,
    )
}

@Composable
private fun MenuItem(
    name: String,
    description: String?,
    icon: List<SvgPart>,
    selected: Boolean,
    dot: Color?,
    count: Int?,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(15.dp))
            .background(if (selected) scheme.secondaryContainer else Color.Transparent)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { stateDescription = if (selected) "Selecionado" else "" }
            .padding(start = 10.dp, end = 12.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(24.dp).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
            SvgIcon(icon, size = 19.dp, color = if (selected) scheme.onBackground else scheme.onSurfaceVariant, strokeWidth = 1.75f)
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(
                    text = name,
                    color = scheme.onBackground,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (dot != null) Box(Modifier.size(7.dp).background(dot, CircleShape).clearAndSetSemantics {})
            }
            if (description != null) {
                Text(
                    text = description,
                    color = scheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontWeight = FontWeight.Medium,
                    fontSize = 11.5.sp,
                    lineHeight = 15.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (count != null) {
            Text(
                text = count.toString(),
                color = scheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontWeight = FontWeight.Medium,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
    }
}

@Composable
private fun SearchField(
    search: SectionSearch,
    onSubmit: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    var focused by remember { mutableStateOf(false) }
    val tint = if (focused) MaterialTheme.colorScheme.tertiary else scheme.onSurfaceVariant
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(CircleShape)
            .background(scheme.secondary)
            .then(if (focused) Modifier.border(1.dp, braidBrand(), CircleShape) else Modifier)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SvgIcon(SearchGlyph, size = 18.dp, color = tint, strokeWidth = 1.75f, modifier = Modifier.clearAndSetSemantics {})
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            BasicTextField(
                value = search.value,
                onValueChange = search.onChange,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .onFocusChanged {
                            focused = it.isFocused
                        }.semantics { contentDescription = search.label },
                singleLine = true,
                textStyle = TextStyle(color = scheme.onBackground, fontSize = 16.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
                cursorBrush = SolidColor(braidBrand()),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSubmit() }),
            )
            if (search.value.isEmpty()) {
                Text(
                    text = search.label,
                    color = scheme.onSurfaceVariant,
                    fontSize = 16.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
        }
    }
}

@Composable
private fun ClearFilters(onClear: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .heightIn(min = 44.dp)
            .clip(CircleShape)
            .border(1.dp, scheme.outline, CircleShape)
            .clickable(role = Role.Button, onClick = onClear)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("Limpar filtros", color = scheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun SettingsPane(
    settings: List<SectionSetting>,
    model: SectionMenuModel?,
) {
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
        for (setting in settings) {
            when (setting) {
                is SectionSetting.Switch -> SwitchSetting(setting)
                is SectionSetting.Segment -> ChoiceSetting(setting.label, setting.options, segmented = true)
                is SectionSetting.Toggles -> ChoiceSetting(setting.label, setting.options, segmented = false)
            }
        }
        if (model != null && model.filtered && model.onClear != null) ClearFilters(model.onClear)
    }
}

@Composable
private fun SettingLabel(text: String) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier.fillMaxWidth().padding(bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = text.uppercase(),
            color = scheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontWeight = FontWeight.Medium,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
        Box(Modifier.weight(1f).size(width = 0.dp, height = 1.dp).background(scheme.outline))
    }
}

@Composable
private fun ChoiceSetting(
    label: String,
    options: List<SectionChoice>,
    segmented: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    Column {
        SettingLabel(label)
        Row(
            Modifier
                .padding(start = if (segmented) 10.dp else 0.dp)
                .then(if (segmented) Modifier.widthIn(max = 280.dp).fillMaxWidth() else Modifier)
                .clip(CircleShape)
                .then(if (segmented) Modifier.background(scheme.secondary, CircleShape).padding(3.dp) else Modifier),
            horizontalArrangement = Arrangement.spacedBy(if (segmented) 0.dp else 8.dp),
        ) {
            for (option in options) {
                Box(
                    Modifier
                        .then(if (segmented) Modifier.weight(1f) else Modifier)
                        .heightIn(min = if (segmented) 38.dp else 40.dp)
                        .clip(CircleShape)
                        .background(
                            if (option.selected) (if (segmented) scheme.background else scheme.secondaryContainer) else Color.Transparent,
                        ).then(if (!segmented) Modifier.border(1.dp, scheme.outline, CircleShape) else Modifier)
                        .clickable(role = Role.Button, onClick = option.onPick)
                        .semantics { selected = option.selected }
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(option.label, color = scheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun SwitchSetting(setting: SectionSetting.Switch) {
    val scheme = MaterialTheme.colorScheme
    Column {
        SettingLabel(setting.label)
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(15.dp))
                .clickable(role = Role.Switch, onClick = setting.onToggle)
                .semantics { stateDescription = if (setting.on) "Ligado" else "Desligado" },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier
                    .size(width = 44.dp, height = 26.dp)
                    .clip(CircleShape)
                    .background(if (setting.on) braidBrand() else scheme.secondaryContainer),
                contentAlignment = if (setting.on) Alignment.CenterEnd else Alignment.CenterStart,
            ) {
                Box(Modifier.padding(3.dp).size(20.dp).background(scheme.background, CircleShape))
            }
            if (setting.hint != null) {
                Text(setting.hint, color = scheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 18.sp)
            }
            Spacer(Modifier.weight(1f))
        }
    }
}
