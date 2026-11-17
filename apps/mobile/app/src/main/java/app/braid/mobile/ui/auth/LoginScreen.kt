package app.braid.mobile.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.braidBrand

@Composable
fun LoginScreen(viewModel: LoginViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LoginContent(
        state = state,
        onEmailChange = viewModel::onEmailChange,
        onPasswordChange = viewModel::onPasswordChange,
        onSubmit = viewModel::submit,
    )
}

/** A tela de entrar do web no celular: a assinatura na serifa e o formulário no pé da tela. */
@Composable
fun LoginContent(
    state: LoginUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .imePadding(),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(40.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    text = "Agente pessoal",
                    style = MaterialTheme.typography.displayLarge.copy(fontSize = 48.sp, lineHeight = 48.sp, letterSpacing = (-0.02).em),
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    text = "Sua vida organizada.\nSua mente em equilíbrio.",
                    style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 25.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                LoginField(
                    label = "E-mail",
                    value = state.email,
                    onValueChange = onEmailChange,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                )
                LoginField(
                    label = "Senha",
                    value = state.password,
                    onValueChange = onPasswordChange,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                )
                state.error?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall.copy(lineHeight = 20.sp),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                SubmitButton(
                    text = if (state.submitting) "Entrando..." else "Entrar",
                    enabled = state.canSubmit,
                    onClick = onSubmit,
                )
            }
        }
    }
}

/** Rótulo em mono maiúsculo e campo de 56dp com borda de 18dp, que ganha o verde da marca no foco. */
@Composable
private fun LoginField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    keyboardOptions: KeyboardOptions,
    modifier: Modifier = Modifier,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = label.uppercase(),
            style =
                MaterialTheme.typography.labelMedium.copy(
                    fontFamily = BraidMonoFont,
                    letterSpacing = 0.1.em,
                ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            interactionSource = interaction,
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onBackground),
            cursorBrush = SolidColor(braidBrand()),
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(56.dp)
                            .border(1.dp, if (focused) braidBrand() else MaterialTheme.colorScheme.outline, RoundedCornerShape(18.dp))
                            .padding(horizontal = 18.dp),
                    contentAlignment = Alignment.CenterStart,
                ) { inner() }
            },
        )
    }
}

@Composable
private fun SubmitButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .padding(top = 8.dp)
                .fillMaxWidth()
                .height(56.dp)
                .alpha(if (enabled) 1f else 0.5f)
                .background(MaterialTheme.colorScheme.primary, CircleShape)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onPrimary,
            textAlign = TextAlign.Center,
        )
    }
}
