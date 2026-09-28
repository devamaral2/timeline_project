package app.braid.mobile.core.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * A escala de raio de `radii` em `packages/theme/src/tokens.ts`: 5 nas tags e
 * selos, 8 nos botões e campos, 14 nos cartões e 18 nos painéis e diálogos. A
 * pílula fica para escolhas.
 */
val BraidShapes =
    Shapes(
        extraSmall = RoundedCornerShape(5.dp),
        small = RoundedCornerShape(8.dp),
        medium = RoundedCornerShape(10.dp),
        large = RoundedCornerShape(14.dp),
        extraLarge = RoundedCornerShape(18.dp),
    )
