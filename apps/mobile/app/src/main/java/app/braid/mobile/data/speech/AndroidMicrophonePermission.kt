package app.braid.mobile.data.speech

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import app.braid.mobile.domain.speech.MicrophonePermission
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject

class AndroidMicrophonePermission
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) : MicrophonePermission {
        override fun isGranted(): Boolean =
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }
