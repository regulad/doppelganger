package xyz.regulad.pheidippides.locate

import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import io.sentry.Sentry
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Pheidippides Locate on a device, set up as apps/web's initial setup
 * (server/src/adb/initial-setup.ts) sets it up and driven as its location route
 * drives it: the location Doppelganger sends is the one apps on the device get.
 */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 31) // executeShellCommandRwe
class MockLocationDeviceTest {
    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    @Test
    fun appsOnTheDeviceGetDoppelgangersLocation() {
        val received = LinkedBlockingQueue<Location>()
        val listener = LocationListener { received.add(it) }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, listener, Looper.getMainLooper())
        }
        try {
            sendLocation(40.7128, -74.006)
            awaitLocation(received, 40.7128, -74.006)

            // Each update starts the activity again, as the route does
            sendLocation(34.0522, -118.2437)
            awaitLocation(received, 34.0522, -118.2437)
        } finally {
            locationManager.removeUpdates(listener)
        }
    }

    @Test
    fun sentryIsOnButNotReportingToProduction() {
        assertTrue(Sentry.isEnabled())
        assertEquals("http://devicetest@127.0.0.1:9/0", Sentry.getCurrentScopes().options.dsn)
    }

    /** The location route's command (apps/web/src/app/api/devices/[id]/location/route.ts). */
    private fun sendLocation(latitude: Double, longitude: Double) {
        val json = "{\"latitude\":$latitude,\"longitude\":$longitude,\"altitude\":null,\"accuracy\":8," +
            "\"altitudeAccuracy\":null,\"heading\":null,\"speed\":null,\"timestamp\":${System.currentTimeMillis()}}"
        val escaped = json.replace("\"", "\\\"")
        shell("am start -n xyz.regulad.pheidippides.locate/.MockLocationActivity -e LOCATION_DATA \"$escaped\"")
    }

    private fun awaitLocation(received: LinkedBlockingQueue<Location>, latitude: Double, longitude: Double) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20)
        var last: Location? = null
        while (System.nanoTime() < deadline) {
            last = received.poll(1, TimeUnit.SECONDS) ?: continue
            if (last.latitude == latitude && last.longitude == longitude) return
        }
        throw AssertionError("Apps never got ($latitude, $longitude); the last location was $last")
    }

    companion object {
        private const val PACKAGE = "xyz.regulad.pheidippides.locate"

        @BeforeClass
        @JvmStatic
        fun setUpAsDoppelgangerDoes() {
            shell("settings put global development_settings_enabled 1")
            shell("settings put secure mock_location 1")
            shell("appops set $PACKAGE android:mock_location allow")
            shell("settings put secure mock_location_app $PACKAGE")
            // Doppelganger grants each app the permissions it requests; this test
            // reads the location as this app
            shell("pm grant $PACKAGE android.permission.ACCESS_FINE_LOCATION")
            shell("pm grant $PACKAGE android.permission.ACCESS_COARSE_LOCATION")
            shell("cmd location set-location-enabled true")
        }

        @AfterClass
        @JvmStatic
        fun stopTheService() {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            context.startService(
                Intent(context, MockLocationForegroundService::class.java)
                    .setAction(MockLocationForegroundService.ACTION_STOP_SERVICE),
            )
        }
    }
}
