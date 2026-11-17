package xyz.regulad.pheidippides.locate

import android.app.Application
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationManager
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf

/**
 * MockLocationActivity as apps/web's location route starts it: with the
 * location the browser reported, as that route's locationSchema shapes it.
 */
@RunWith(AndroidJUnit4::class)
class MockLocationActivityTest {
    private val application: Application = ApplicationProvider.getApplicationContext()

    @Test
    fun passesDoppelgangersLocationToTheService() {
        allowMockLocation()

        val activity = launch(SERVER_LOCATION)

        assertTrue(activity.isFinishing)
        val locationManager = application.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        assertTrue(locationManager.isProviderEnabled(MockLocationForegroundService.PROVIDER_NAME))
        val started = shadowOf(application).nextStartedService
        assertEquals(MockLocationForegroundService::class.java.name, started.component!!.className)
        assertEquals(MockLocationForegroundService.ACTION_START_SERVICE, started.action)
        @Suppress("DEPRECATION")
        val location = started.getParcelableExtra<Location>(MockLocationForegroundService.EXTRA_LOCATION)!!
        assertEquals(MockLocationForegroundService.PROVIDER_NAME, location.provider)
        assertEquals(40.7128, location.latitude, 0.0)
        assertEquals(-74.006, location.longitude, 0.0)
        assertEquals(12.5f, location.accuracy, 0f)
        assertEquals(1_700_000_000_123, location.time)
    }

    @Test
    fun doesNothingWithoutTheMockLocationSetting() {
        val activity = launch(SERVER_LOCATION)

        assertTrue(activity.isFinishing)
        assertNull(shadowOf(application).nextStartedService)
    }

    @Test
    fun doesNothingWithoutALocation() {
        allowMockLocation()

        val activity = launch(null)

        assertTrue(activity.isFinishing)
        assertNull(shadowOf(application).nextStartedService)
    }

    @Test
    fun doesNothingWithAMalformedLocation() {
        allowMockLocation()

        val activity = launch("{\"latitude\":")

        assertTrue(activity.isFinishing)
        assertNull(shadowOf(application).nextStartedService)
    }

    /** What apps/web's initial setup turns on for this app. */
    private fun allowMockLocation() {
        @Suppress("DEPRECATION")
        Settings.Secure.putString(application.contentResolver, Settings.Secure.ALLOW_MOCK_LOCATION, "1")
    }

    private fun launch(locationData: String?): MockLocationActivity {
        val intent = Intent(application, MockLocationActivity::class.java)
        locationData?.let { intent.putExtra("LOCATION_DATA", it) }
        return Robolectric.buildActivity(MockLocationActivity::class.java, intent).create().get()
    }

    companion object {
        /** A location as the route sends it: JSON, with nulls where the browser has no value. */
        const val SERVER_LOCATION = "{\"latitude\":40.7128,\"longitude\":-74.006,\"altitude\":null," +
            "\"accuracy\":12.5,\"altitudeAccuracy\":null,\"heading\":null,\"speed\":null," +
            "\"timestamp\":1700000000123}"
    }
}
