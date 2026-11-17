package xyz.regulad.pheidippides.notify.util

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.shadows.ShadowSystemProperties

@RunWith(AndroidJUnit4::class)
class SystemPropertyHelperTest {
    @Test
    fun readsASystemProperty() {
        ShadowSystemProperties.override("persist.doppelganger.origin", "https://example.test")
        assertEquals(
            "https://example.test",
            SystemPropertyHelper.getSystemProperty("persist.doppelganger.origin", "unused"),
        )
    }

    @Test
    fun fallsBackWhenThePropertyIsUnset() {
        assertEquals(
            "fallback",
            SystemPropertyHelper.getSystemProperty("persist.doppelganger.unset", "fallback"),
        )
    }
}
