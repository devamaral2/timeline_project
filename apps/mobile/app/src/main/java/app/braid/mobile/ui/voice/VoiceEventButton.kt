@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

@Composable
fun VoiceEventButton(
    onFinalTranscript: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val latestCallback by rememberUpdatedState(onFinalTranscript)
    val controller =
        remember(context) {
            SpeechRecognizerController(context) { transcript -> latestCallback(transcript) }
        }
    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) controller.start() else controller.permissionDenied()
        }
    val state = controller.state

    DisposableEffect(controller) {
        onDispose { controller.release() }
    }

    Column(modifier = modifier) {
        IconButton(
            onClick = {
                if (state.listening) {
                    controller.stop()
                } else if (hasRecordAudioPermission(context)) {
                    controller.start()
                } else {
                    permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            },
        ) {
            Icon(
                imageVector = if (state.listening) Icons.Outlined.Stop else Icons.Outlined.Mic,
                contentDescription = if (state.listening) "Parar gravação" else "Gravar evento por voz",
                tint = if (state.listening) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
        }
        val hint = state.error ?: state.interim
        if (!hint.isNullOrBlank()) {
            Text(
                modifier = Modifier.padding(horizontal = 8.dp),
                text = hint,
                color = if (state.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

private fun hasRecordAudioPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
