package xyz.regulad.pheidippides.notify

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import io.sentry.Sentry
import okhttp3.mockwebserver.MockWebServer
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith
import java.net.InetAddress
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Pheidippides Notify on a device, set up the way apps/web's initial setup
 * (server/src/adb/initial-setup.ts) sets it up: a notification another app posts
 * reaches Doppelganger, played here by a local server.
 */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 31) // executeShellCommandRwe
class NotificationRelayDeviceTest {
    @Test
    fun relaysAnotherAppsNotificationToDoppelganger() {
        val id = UUID.randomUUID().toString()
        // Posted by the shell's user (com.android.shell), as another app's would
        // be; as root, which `adb root` makes this shell, it can't post at all
        shell(
            "su 2000 cmd notification post -S inbox --line 'first $id' --line second " +
                "-t 'Title $id' 'tag-$id' 'Text $id'"
        )

        val json = awaitRelayed { it["title"]?.asString == "Title $id" }
        ServerSchema.assertMatches(json)
        assertEquals("com.android.shell", json["packageName"].asString)
        assertEquals("Text $id", json["text"].asString)
        assertEquals(listOf("first $id", "second"), json["textLines"].asJsonArray.map { it.asString })
        assertTrue(json["postTimeUnixMillis"].asLong > 0)
        ServerSchema.assertPng(json["appIconDataUrl"].asString)
        ServerSchema.assertPng(json["smallIconDataUrl"].asString)
    }

    @Test
    fun sentryIsOnButNotReportingToProduction() {
        assertTrue(Sentry.isEnabled())
        assertEquals(TEST_DSN, Sentry.getCurrentScopes().options.dsn)
    }

    /** Waits for the relayed notification [matches] picks out of all those relayed. */
    private fun awaitRelayed(matches: (JsonObject) -> Boolean): JsonObject {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30)
        while (System.nanoTime() < deadline) {
            val request = server.takeRequest(1, TimeUnit.SECONDS) ?: continue
            assertEquals("POST", request.method)
            assertEquals("/api/devices/$DEVICE_ID/notification", request.path)
            assertEquals(SECRET, request.getHeader("X-Doppelganger-Secret"))
            val json = JsonParser.parseString(request.body.readUtf8()).asJsonObject
            if (matches(json)) return json
        }
        fail("The notification never reached Doppelganger")
        throw AssertionError()
    }

    companion object {
        private const val PORT = 18765
        private const val SECRET = "device-test-secret"
        private const val DEVICE_ID = "device-test"
        // src/deviceTest/AndroidManifest.xml
        private const val TEST_DSN = "http://devicetest@127.0.0.1:9/0"

        private val server = MockWebServer().apply { dispatcher = ServerSchema.acceptingDispatcher }

        @BeforeClass
        @JvmStatic
        fun setUpAsDoppelgangerDoes() {
            server.start(InetAddress.getByName("127.0.0.1"), PORT)
            setRootProperty("persist.doppelganger.origin", "http://127.0.0.1:$PORT")
            setRootProperty("persist.doppelganger.secret", SECRET)
            setRootProperty("persist.doppelganger.device", DEVICE_ID)
            shell("cmd notification allow_listener xyz.regulad.pheidippides.notify/.NotificationRelayService")
            shell("am start xyz.regulad.pheidippides.notify/.MainActivity")
        }

        @AfterClass
        @JvmStatic
        fun tearDown() {
            shell("cmd notification disallow_listener xyz.regulad.pheidippides.notify/.NotificationRelayService")
            server.shutdown()
        }
    }
}
