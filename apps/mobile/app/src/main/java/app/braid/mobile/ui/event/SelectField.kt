package app.braid.mobile.ui.event

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidBrandSoft
import kotlinx.coroutines.launch

/** Uma escolha de [SelectField]: o valor que a tela guarda, o texto e, se houver, o ícone. */
data class SelectOption<T>(
    val value: T,
    val label: String,
    val icon: ImageVector? = null,
)

/**
 * Seletor de uma opção, no padrão do web (`entitySelectButton` e `pickerOption`
 * em `mockups/eventos/mobile-navigation.tsx`): um campo com rótulo pequeno,
 * ícone, texto e seta; ao tocar, abre uma folha com uma linha por opção, a
 * escolhida em destaque com ✓. Substitui as fileiras de chips, que não existem
 * no web.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
@Suppress("ktlint:standard:function-naming")
fun <T> SelectField(
    label: String,
    options: List<SelectOption<T>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    sheetTitle: String = label,
    enabled: Boolean = true,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val current = options.firstOrNull { it.value == selected }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            modifier = Modifier.padding(start = 2.dp),
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Surface(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 54.dp)
                    .semantics {
                        role = Role.DropdownList
                        contentDescription = "$label: ${current?.label.orEmpty()}"
                    },
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            onClick = { open = true },
            enabled = enabled,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                current?.icon?.let { icon ->
                    Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(20.dp))
                }
                Text(
                    modifier = Modifier.weight(1f),
                    text = current?.label.orEmpty(),
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Icon(
                    imageVector = Icons.Outlined.ExpandMore,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    if (open) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        val scope = rememberCoroutineScope()

        fun close(afterClose: () -> Unit = {}) {
            scope.launch { sheetState.hide() }.invokeOnCompletion {
                open = false
                afterClose()
            }
        }

        ModalBottomSheet(
            onDismissRequest = { open = false },
            sheetState = sheetState,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            containerColor = MaterialTheme.colorScheme.surface,
            dragHandle = {
                BottomSheetDefaults.DragHandle(
                    modifier = Modifier.padding(top = 10.dp),
                    width = 30.dp,
                    height = 3.dp,
                    color = MaterialTheme.colorScheme.outline,
                )
            },
        ) {
            Column(
                modifier = Modifier.navigationBarsPadding().padding(start = 26.dp, end = 26.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        modifier = Modifier.weight(1f).padding(start = 12.dp),
                        text = sheetTitle,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    IconButton(onClick = { close() }) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = "Fechar painel",
                            modifier = Modifier.size(17.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                options.forEach { option ->
                    SelectOptionRow(
                        option = option,
                        selected = option.value == selected,
                        onClick = { close { onSelect(option.value) } },
                    )
                }
            }
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun <T> SelectOptionRow(
    option: SelectOption<T>,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val brand = braidBrand()
    Surface(
        modifier =
            Modifier
                .fillMaxWidth()
                .semantics {
                    role = Role.RadioButton
                    this.selected = selected
                },
        shape = MaterialTheme.shapes.large,
        color = if (selected) braidBrandSoft() else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if (selected) brand.copy(alpha = 0.55f) else MaterialTheme.colorScheme.outline),
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.heightIn(min = 54.dp).padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            option.icon?.let { icon ->
                Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(22.dp))
            }
            Text(modifier = Modifier.weight(1f), text = option.label, fontSize = 15.sp)
            if (selected) {
                Icon(
                    imageVector = Icons.Outlined.Check,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = brand,
                )
            }
        }
    }
}

/** Os avisos antes do início que o web oferece; `0.0` é “Sem aviso”. */
val reminderOptions: List<SelectOption<Double>> =
    listOf(0.0, 5.0, 15.0, 60.0).map { minutes ->
        SelectOption(minutes, if (minutes == 0.0) "Sem aviso" else "${minutes.toInt()} min antes")
    }

/** A opção de aviso marcada: a primeira antecedência do evento, ou “Sem aviso”. */
fun List<Double>.selectedReminder(): Double = firstOrNull() ?: 0.0
