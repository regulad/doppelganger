package xyz.regulad.pheidippides.notify

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Icon
import android.os.Process
import android.service.notification.StatusBarNotification
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.gson.JsonParser
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowSystemProperties
import xyz.regulad.pheidippides.notify.util.DoppelgangerUtil
import java.util.concurrent.TimeUnit

/**
 * What NotificationRelayService sends to Doppelganger for a posted notification:
 * the request apps/web's /api/devices/[id]/notification route accepts, checked
 * against that route's incomingNotificationSchema (ServerSchema).
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationRelayServiceTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var server: MockWebServer
    private lateinit var service: NotificationRelayService

    @Before
    fun setUp() {
        // What the web app's initial setup sets on each device
        ShadowSystemProperties.override("persist.doppelganger.secret", SECRET)
        ShadowSystemProperties.override("persist.doppelganger.device", DEVICE_ID)
        server = MockWebServer().apply {
            dispatcher = ServerSchema.acceptingDispatcher
            start()
        }
        // The origin is read once per process, so it's pointed at this test's
        // server directly
        DoppelgangerUtil.DOPPELGANGER_ORIGIN = server.url("/").toString().removeSuffix("/")
        service = Robolectric.buildService(NotificationRelayService::class.java).create().get()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun relaysAFullNotification() {
        val reply = PendingIntent.getActivity(context, 0, Intent(), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(context, "chat")
            .setSmallIcon(Icon.createWithBitmap(Bitmap.createBitmap(24, 24, Bitmap.Config.ARGB_8888)))
            .setLargeIcon(Bitmap.createBitmap(32, 24, Bitmap.Config.ARGB_8888))
            .setContentTitle("Alice")
            .setContentText("Lunch?")
            .setSubText("Work")
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setStyle(Notification.InboxStyle().addLine("one").addLine("two").setSummaryText("2 more"))
            .addAction(Notification.Action.Builder(null as Icon?, "Reply", reply).build())
            .build()
        notification.extras.putCharSequence(Notification.EXTRA_BIG_TEXT, "Lunch at noon?")

        service.onNotificationPosted(statusBarNotification(notification, postTime = 1_700_000_000_123))

        val request = takeRelayedRequest()
        val json = request.body.readUtf8().let(JsonParser::parseString).asJsonObject
        ServerSchema.assertMatches(json)
        assertEquals(context.packageName, json["packageName"].asString)
        assertTrue(json["appName"].asString.isNotEmpty())
        assertEquals(1_700_000_000_123, json["postTimeUnixMillis"].asLong)
        assertEquals("Alice", json["title"].asString)
        assertEquals("Lunch?", json["text"].asString)
        assertEquals("Work", json["subText"].asString)
        assertEquals("2 more", json["summaryText"].asString)
        assertEquals("Lunch at noon?", json["bigText"].asString)
        assertEquals(listOf("one", "two"), json["textLines"].asJsonArray.map { it.asString })
        assertEquals(Notification.CATEGORY_MESSAGE, json["category"].asString)
        assertEquals(1, json["actionCount"].asInt)
        ServerSchema.assertPng(json["smallIconDataUrl"].asString, 24, 24)
        ServerSchema.assertPng(json["largeIconDataUrl"].asString, 32, 24)
        // Robolectric has no launcher icon to give for appIconDataUrl; the device
        // test checks that one
    }

    @Test
    fun leavesOutWhatABareNotificationLacks() {
        // The route's schema makes these fields optional, which accepts a field
        // that's absent but rejects one that's null
        val notification = Notification.Builder(context, "bare")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .build()

        service.onNotificationPosted(statusBarNotification(notification, postTime = 42))

        val json = takeRelayedRequest().body.readUtf8().let(JsonParser::parseString).asJsonObject
        ServerSchema.assertMatches(json)
        for (field in listOf("title", "text", "subText", "summaryText", "bigText", "category", "largeIconDataUrl")) {
            assertFalse("$field should be absent", json.has(field))
        }
        assertEquals(0, json["textLines"].asJsonArray.size())
        assertEquals(0, json["actionCount"].asInt)
    }

    @Test
    fun encodesDrawablesAsPngDataUrls() {
        val bitmap = BitmapDrawable(context.resources, Bitmap.createBitmap(3, 2, Bitmap.Config.ARGB_8888))
        ServerSchema.assertPng(NotificationRelayService.drawableToDataUrl(bitmap), 3, 2)

        // A drawable that isn't a bitmap is drawn at its intrinsic size
        val shape = GradientDrawable().apply { setSize(4, 5) }
        ServerSchema.assertPng(NotificationRelayService.drawableToDataUrl(shape), 4, 5)
    }

    // The constructor the SDK makes public; a score of 0 is what the system posts
    @Suppress("DEPRECATION")
    private fun statusBarNotification(notification: Notification, postTime: Long) = StatusBarNotification(
        context.packageName, context.packageName, 1, "tag", Process.myUid(), 0, 0,
        notification, Process.myUserHandle(), postTime,
    )

    private fun takeRelayedRequest(): RecordedRequest {
        val request = server.takeRequest(10, TimeUnit.SECONDS)
        assertNotNull("NotificationRelayService sent nothing", request)
        request!!
        assertEquals("POST", request.method)
        assertEquals("/api/devices/$DEVICE_ID/notification", request.path)
        assertEquals(SECRET, request.getHeader(DoppelgangerUtil.CUSTOM_HEADER_NAME))
        assertTrue(request.getHeader("Content-Type")!!.startsWith("application/json"))
        return request
    }

    companion object {
        private const val SECRET = "test-secret"
        private const val DEVICE_ID = "test-device"
    }
}
