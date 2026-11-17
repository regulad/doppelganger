package xyz.regulad.pheidippides.notify

import android.graphics.BitmapFactory
import android.util.Base64
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest

/** What apps/web's /api/devices/[id]/notification route accepts. */
object ServerSchema {
    private const val PNG_DATA_URL_PREFIX = "data:image/png;base64,"

    /** Answers every relayed notification as the route does when it accepts one. */
    val acceptingDispatcher = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest) = MockResponse().setBody("{}")
    }

    /**
     * The route's incomingNotificationSchema, field by field. Its optional fields
     * accept a field that's absent but reject one that's null.
     */
    fun assertMatches(json: JsonObject) {
        assertNoNulls(json)
        assertTrue(json["packageName"].asJsonPrimitive.isString)
        assertTrue(json["appName"].asJsonPrimitive.isString)
        assertTrue(json["postTimeUnixMillis"].asJsonPrimitive.isNumber)
        assertTrue(json["textLines"].asJsonArray.all { it.asJsonPrimitive.isString })
        assertTrue(json["priority"].asJsonPrimitive.isNumber)
        assertTrue(json["actionCount"].asJsonPrimitive.isNumber)
        for (optional in listOf(
            "title", "text", "subText", "summaryText", "bigText", "category",
            "appIconDataUrl", "smallIconDataUrl", "largeIconDataUrl",
        )) {
            if (json.has(optional)) assertTrue("$optional must be a string", json[optional].asJsonPrimitive.isString)
        }
    }

    private fun assertNoNulls(element: JsonElement) {
        assertFalse("null in $element", element.isJsonNull)
        when {
            element.isJsonObject -> element.asJsonObject.entrySet().forEach { assertNoNulls(it.value) }
            element.isJsonArray -> element.asJsonArray.forEach(::assertNoNulls)
        }
    }

    /** Checks that [dataUrl] is a PNG, and its size when [width] and [height] are given. */
    fun assertPng(dataUrl: String, width: Int? = null, height: Int? = null) {
        assertTrue(dataUrl.take(40), dataUrl.startsWith(PNG_DATA_URL_PREFIX))
        val bytes = Base64.decode(dataUrl.removePrefix(PNG_DATA_URL_PREFIX), Base64.DEFAULT)
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        assertEquals("image/png", options.outMimeType)
        assertTrue(options.outWidth > 0 && options.outHeight > 0)
        width?.let { assertEquals(it, options.outWidth) }
        height?.let { assertEquals(it, options.outHeight) }
    }
}
