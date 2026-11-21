package xyz.regulad.pheidippides.notify

import android.annotation.SuppressLint
import io.sentry.EventProcessor
import io.sentry.Hint
import io.sentry.SentryBaseEvent
import io.sentry.SentryEvent
import io.sentry.protocol.SentryTransaction

/**
 * Tags each Sentry event with the Doppelganger device it comes from, as
 * device.id, the tag apps/web's server puts on its own events, so one search
 * finds both sides of a failure.
 *
 * The ID is read from persist.doppelganger.device as each event is sent, not
 * once at start: Doppelganger's setup (apps/web/server/src/adb/initial-setup.ts)
 * sets it once the device is up, which can be after this app has started.
 *
 * An event from a device without it isn't sent. Doppelganger hasn't set that
 * device up, so the app fails there as it would, without reporting it.
 *
 * Each Pheidippides app has its own copy of this file.
 */
class DeviceIdEventProcessor : EventProcessor {
    override fun process(event: SentryEvent, hint: Hint): SentryEvent? = tagged(event)

    override fun process(transaction: SentryTransaction, hint: Hint): SentryTransaction? =
        tagged(transaction)

    private fun <T : SentryBaseEvent> tagged(event: T): T? {
        val deviceId = readSystemProperty(DEVICE_ID_PROPERTY)
        if (deviceId.isBlank()) return null
        event.setTag(TAG, deviceId)
        return event
    }

    companion object {
        const val TAG = "device.id"
        const val DEVICE_ID_PROPERTY = "persist.doppelganger.device"

        /** android.os.SystemProperties.get, hidden from apps; "" when unset */
        @SuppressLint("PrivateApi")
        private fun readSystemProperty(name: String): String =
            try {
                Class.forName("android.os.SystemProperties")
                    .getMethod("get", String::class.java, String::class.java)
                    .invoke(null, name, "") as String
            } catch (e: ReflectiveOperationException) {
                ""
            }
    }
}
