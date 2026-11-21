package xyz.regulad.pheidippides.locate

import androidx.test.ext.junit.runners.AndroidJUnit4
import io.sentry.Hint
import io.sentry.Sentry
import io.sentry.SentryEvent
import io.sentry.protocol.SentryTransaction
import io.sentry.protocol.TransactionInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.shadows.ShadowSystemProperties

@RunWith(AndroidJUnit4::class)
class DeviceIdEventProcessorTest {
    private val processor = DeviceIdEventProcessor()

    @Test
    fun tagsAnEventWithItsDevice() {
        ShadowSystemProperties.override("persist.doppelganger.device", DEVICE_ID)

        val event = processor.process(SentryEvent(), Hint())

        assertEquals(DEVICE_ID, event!!.getTag("device.id"))
    }

    @Test
    fun tagsATransactionWithItsDevice() {
        ShadowSystemProperties.override("persist.doppelganger.device", DEVICE_ID)

        val transaction = processor.process(transaction(), Hint())

        assertEquals(DEVICE_ID, transaction!!.getTag("device.id"))
    }

    @Test
    fun sendsNothingFromADeviceDoppelgangerHasntSetUp() {
        assertNull(processor.process(SentryEvent(), Hint()))
        assertNull(processor.process(transaction(), Hint()))
    }

    @Test
    fun theAppStartsSentryWithIt() {
        assertTrue(Sentry.isEnabled())
        assertTrue(Sentry.getCurrentScopes().options.eventProcessors.any { it is DeviceIdEventProcessor })
    }

    private fun transaction() =
        SentryTransaction("test", 0.0, 1.0, emptyList(), emptyMap(), TransactionInfo("custom"))

    companion object {
        // the ID of the device in DOPPELGANGER-DT and DE
        private const val DEVICE_ID = "wxwkf52pvtkdtnmz0u2dlvxe"
    }
}
