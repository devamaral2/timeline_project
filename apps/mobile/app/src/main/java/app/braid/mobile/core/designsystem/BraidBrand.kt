package app.braid.mobile.core.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight

/** A assinatura: "Agente pessoal" na serifa, sem símbolo. */
@Composable
@Suppress("ktlint:standard:function-naming")
fun BraidWordmark(
    style: TextStyle,
    modifier: Modifier = Modifier,
) {
    Text(
        modifier = modifier,
        text = "Agente pessoal",
        style = style.copy(fontFamily = BraidDisplayFont, fontWeight = FontWeight.Normal),
        color = MaterialTheme.colorScheme.onBackground,
    )
}
