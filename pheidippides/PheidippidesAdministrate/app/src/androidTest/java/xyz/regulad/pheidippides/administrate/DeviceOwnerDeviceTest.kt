package xyz.regulad.pheidippides.administrate

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import io.sentry.Sentry
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Pheidippides Administrate on a device: made device owner as apps/web's
 * initial setup (server/src/adb/initial-setup.ts) makes it, then blocking and
 * unblocking a package's uninstallation and giving up device ownership, each
 * with the exact command initial-setup.ts runs.
 */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 31) // executeShellCommandRwe
class DeviceOwnerDeviceTest {
    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val admin = ComponentName(context, DeviceAdminReceiver::class.java)

    @Before
    fun becomeDeviceOwnerAsDoppelgangerDoes() {
        if (!dpm.isDeviceOwnerApp(PACKAGE)) {
            // A forfeit that just ran removes the admin a moment after the
            // ownership; taking the role back in between fails
            await("Administrate's admin removal to finish") { !dpm.isAdminActive(admin) }
            val output = shell("dpm set-device-owner $PACKAGE/.DeviceAdminReceiver")
            assertFalse(output, output.contains("Error"))
        }
        assertTrue(dpm.isDeviceOwnerApp(PACKAGE))
        assertTrue(dpm.isAdminActive(admin))
    }

    @Test
    fun blocksAndUnblocksUninstallingAPackage() {
        // The test APK stands in for a protected package; it's unblocked again
        // below, or uninstalling it after the run would fail
        val target = InstrumentationRegistry.getInstrumentation().context.packageName
        try {
            // lockPackageFromUninstall
            shell("am start -n $PACKAGE/.LockAppActivity -d package:$target")
            awaitUninstallBlocked(target, true)
        } finally {
            // unlockPackageFromUninstall
            shell("am start -n $PACKAGE/.UnlockAppActivity -d package:$target")
            awaitUninstallBlocked(target, false)
        }
    }

    @Test
    fun forfeitsDeviceOwnership() {
        // forfeitDeviceOwnership
        shell("am start -n $PACKAGE/.ForfeitAdminActivity")

        // Android removes the ownership first and the admin a moment later
        await("Administrate to give up device ownership") { !dpm.isDeviceOwnerApp(PACKAGE) }
        await("Administrate's admin to be removed") { !dpm.isAdminActive(admin) }
    }

    @Test
    fun sentryIsOnButNotReportingToProduction() {
        assertTrue(Sentry.isEnabled())
        assertEquals("http://devicetest@127.0.0.1:9/0", Sentry.getCurrentScopes().options.dsn)
    }

    private fun awaitUninstallBlocked(packageName: String, blocked: Boolean) {
        await("uninstalling $packageName to become ${if (blocked) "blocked" else "unblocked"}") {
            dpm.isUninstallBlocked(admin, packageName) == blocked
        }
    }

    /** Waits up to 10 seconds for [condition], failing with what was awaited. */
    private fun await(what: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 10_000
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return
            Thread.sleep(100)
        }
        throw AssertionError("Timed out waiting for $what")
    }

    companion object {
        private const val PACKAGE = "xyz.regulad.pheidippides.administrate"

        /** A device owner can't be uninstalled, so the run gives the role up. */
        @AfterClass
        @JvmStatic
        fun giveUpDeviceOwnership() {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (dpm.isDeviceOwnerApp(PACKAGE)) {
                @Suppress("DEPRECATION")
                dpm.clearDeviceOwnerApp(PACKAGE)
            }
        }
    }
}
