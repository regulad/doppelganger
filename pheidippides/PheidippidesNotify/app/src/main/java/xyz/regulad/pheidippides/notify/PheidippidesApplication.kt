package xyz.regulad.pheidippides.notify

import android.app.Application
import io.sentry.android.core.SentryAndroid

/**
 * Starts Sentry, which the manifest keeps from starting itself
 * (io.sentry.auto-init), so that its events go through
 * [DeviceIdEventProcessor]. Its other options still come from the manifest.
 */
class PheidippidesApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SentryAndroid.init(this) { options ->
            options.addEventProcessor(DeviceIdEventProcessor())
        }
    }
}
