package app.braid.mobile.ui.aiedit

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect

/** O sistema pergunta pelo microfone na primeira vez que [askPermission] liga; a resposta volta em [onResult]. */
@Composable
fun MicrophonePermissionEffect(
    askPermission: Boolean,
    onResult: (Boolean) -> Unit,
) {
    val askMicrophone = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> onResult(granted) }
    LaunchedEffect(askPermission) {
        if (askPermission) askMicrophone.launch(Manifest.permission.RECORD_AUDIO)
    }
}
