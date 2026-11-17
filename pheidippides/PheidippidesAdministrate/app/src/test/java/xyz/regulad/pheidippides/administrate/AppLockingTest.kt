package xyz.regulad.pheidippides.administrate

import android.app.Activity
import android.app.Application
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf

/** Blocking and unblocking a package's uninstallation, and giving up the admin role. */
@RunWith(AndroidJUnit4::class)
class AppLockingTest {
    private val application: Application = ApplicationProvider.getApplicationContext()
    private val dpm = application.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val admin = ComponentName(application, DeviceAdminReceiver::class.java)

    @Test
    fun theManifestRoutesTheLockAndUnlockActions() {
        assertEquals(LockAppActivity::class.java.name, resolve(LOCK_ACTION))
        assertEquals(UnlockAppActivity::class.java.name, resolve(UNLOCK_ACTION))
    }

    @Test
    fun locksAndUnlocksAPackageAsDeviceOwner() {
        shadowOf(dpm).setDeviceOwner(admin)

        launch<LockAppActivity>(LOCK_ACTION, "package:$TARGET")
        assertTrue(dpm.isUninstallBlocked(admin, TARGET))

        launch<UnlockAppActivity>(UNLOCK_ACTION, "package:$TARGET")
        assertFalse(dpm.isUninstallBlocked(admin, TARGET))
    }

    @Test
    fun locksNothingWithoutBeingAnAdmin() {
        val activity = launch<LockAppActivity>(LOCK_ACTION, "package:$TARGET")

        assertTrue(activity.isFinishing)
        assertFalse(dpm.isUninstallBlocked(null, TARGET))
    }

    @Test
    fun locksNothingWithoutAPackage() {
        shadowOf(dpm).setDeviceOwner(admin)

        val activity = launch<LockAppActivity>(LOCK_ACTION, null)

        assertTrue(activity.isFinishing)
    }

    // Giving up device ownership (clearDeviceOwnerApp) isn't modelled by
    // Robolectric; DeviceOwnerDeviceTest covers it on a device
    @Test
    fun forfeitsTheAdminRole() {
        shadowOf(dpm).setActiveAdmin(admin)

        launch<ForfeitAdminActivity>(null, null)

        assertFalse(dpm.isAdminActive(admin))
    }

    private fun resolve(action: String): String? = application.packageManager
        .resolveActivity(Intent(action, Uri.parse("package:$TARGET")), PackageManager.MATCH_DEFAULT_ONLY)
        ?.activityInfo?.name

    private inline fun <reified T : Activity> launch(action: String?, data: String?): T {
        val intent = Intent(application, T::class.java).setAction(action)
        data?.let { intent.data = Uri.parse(it) }
        return Robolectric.buildActivity(T::class.java, intent).create().get()
    }

    companion object {
        // The actions the manifest declares
        const val LOCK_ACTION = "xyz.regulad.pheidippides.administrate.LOCK_APP"
        const val UNLOCK_ACTION = "xyz.regulad.pheidippides.administrate.UNLOCK_APP"
        const val TARGET = "com.example.locked"
    }
}
