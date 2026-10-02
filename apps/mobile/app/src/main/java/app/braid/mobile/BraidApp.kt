package app.braid.mobile

import android.app.Application
import app.braid.mobile.data.reminders.ReminderNotification
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class BraidApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ReminderNotification.ensureChannel(this)
    }
}
