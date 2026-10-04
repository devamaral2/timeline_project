package app.braid.mobile.ui.hub

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidBrandSoft

/**
 * O campo de texto do web para `hubComposer`, `hubSearch` e `entityControl`: caixa
 * com fio, raio 14 e fundo de cartão, texto de 16, e o fio na cor da marca
 * enquanto tem o foco. Os adornos (ícone de busca, botão de enviar) ficam dentro
 * da caixa, como no web.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun HubTextBox(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else 4,
    label: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    imeAction: ImeAction = ImeAction.Default,
    onImeAction: () -> Unit = {},
) {
    val interaction = remember { MutableInteractionSource() }
    val focused = interaction.collectIsFocusedAsState().value
    val colors = MaterialTheme.colorScheme
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (label != null) {
            Text(
                modifier = Modifier.padding(start = 2.dp),
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = colors.onSurfaceVariant,
            )
        }
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 54.dp)
                    .clip(MaterialTheme.shapes.large)
                    .background(colors.surface)
                    .border(
                        BorderStroke(1.dp, if (focused) braidBrand().copy(alpha = 0.6f) else colors.outline),
                        MaterialTheme.shapes.large,
                    ).padding(start = 14.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            leading?.invoke()
            BasicTextField(
                modifier = Modifier.weight(1f),
                value = value,
                onValueChange = onValueChange,
                enabled = enabled,
                singleLine = singleLine,
                minLines = minLines,
                maxLines = maxLines,
                interactionSource = interaction,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.onSurface, fontSize = 16.sp),
                cursorBrush = SolidColor(braidBrand()),
                keyboardOptions = KeyboardOptions(imeAction = imeAction),
                keyboardActions = KeyboardActions(onAny = { onImeAction() }),
                decorationBox = { inner ->
                    Box(modifier = Modifier.padding(vertical = 8.dp)) {
                        if (value.isEmpty()) {
                            Text(
                                text = placeholder,
                                style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp),
                                color = colors.onSurfaceVariant,
                            )
                        }
                        inner()
                    }
                },
            )
            trailing?.invoke()
        }
    }
}

/** O botão quadrado de 38 dp do compositor (`.hubComposer button`): fundo suave da marca, ícone da marca. */
@Composable
@Suppress("ktlint:standard:function-naming")
fun HubSquareButton(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Box(
        modifier =
            modifier
                .size(38.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(braidBrandSoft().copy(alpha = if (enabled) 1f else 0.4f))
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = braidBrand().copy(alpha = if (enabled) 1f else 0.4f),
            modifier = Modifier.size(18.dp),
        )
    }
}

data class PillOption<T>(
    val value: T,
    val label: String,
    val icon: ImageVector,
)

/**
 * Grupo de botões do `hubModes` e do `creationToggle`: base suave, o ativo na
 * cor da marca (na Noite, em `accent` com tinta cheia).
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun <T> PillToggle(
    options: List<PillOption<T>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val dark = LocalBraidDarkTheme.current
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(colors.secondary)
                .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        options.forEach { option ->
            val isSelected = option.value == selected
            val background =
                when {
                    isSelected && dark -> colors.secondaryContainer
                    isSelected -> braidBrandSoft()
                    dark -> Color.Transparent
                    else -> colors.outline
                }
            val tint =
                when {
                    isSelected && dark -> colors.onBackground
                    isSelected -> braidBrand()
                    else -> colors.onSurfaceVariant
                }
            Row(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(background)
                        .clickable(role = Role.Tab) { onSelect(option.value) }
                        .semantics { this.selected = isSelected }
                        .padding(horizontal = 3.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(
                    imageVector = option.icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    modifier = Modifier.padding(start = 6.dp),
                    text = option.label,
                    fontSize = 11.sp,
                    color = tint,
                    maxLines = 1,
                )
            }
        }
    }
}

/** O campo de busca do hub (`.hubSearch`): lupa à esquerda dentro da caixa. */
@Composable
@Suppress("ktlint:standard:function-naming")
fun HubSearchBox(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    HubTextBox(
        modifier = modifier,
        value = value,
        onValueChange = onValueChange,
        placeholder = placeholder,
        leading = {
            Icon(
                imageVector = LucideIcons.search(),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        },
        imeAction = ImeAction.Search,
    )
}
