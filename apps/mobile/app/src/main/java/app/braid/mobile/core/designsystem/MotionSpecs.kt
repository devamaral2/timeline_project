package app.braid.mobile.core.designsystem

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring

/**
 * A mola padrão do Compose na escala do [Motion]: a mesma rigidez e o mesmo amortecimento do padrão da API, com a rigidez
 * passada por [Motion.stiffness]. Serve para as animações que seguem a mola padrão (`animate*AsState`, `fadeIn`,
 * `expandVertically`...), que sem isso ficariam no tempo cheio enquanto o resto do app anda na escala.
 *
 * O padrão de cada API: `animate*AsState` e `AnimatedContent` usam [Spring.StiffnessMedium] (cor, `Dp`) ou
 * [Spring.StiffnessMediumLow] (`fadeIn`, `fadeOut`, `expand*`, `shrink*`); [visibilityThreshold] é o do padrão da API
 * (`0.01f` no `Float`, `Dp.VisibilityThreshold` no `Dp`, `IntSize.VisibilityThreshold` no tamanho, nada na cor).
 */
fun <T> scaledSpring(
    stiffness: Float = Spring.StiffnessMedium,
    visibilityThreshold: T? = null,
): SpringSpec<T> = spring(stiffness = Motion.stiffness(stiffness), visibilityThreshold = visibilityThreshold)
