package xyz.regulad.pheidippides.administrate

import android.os.ParcelFileDescriptor
import androidx.test.platform.app.InstrumentationRegistry

/**
 * Runs [command] through the device's shell, quoting and all, as apps/web's
 * `adb shell` calls do, and returns its stdout and stderr.
 */
fun shell(command: String): String {
    val (stdout, stdin, stderr) = InstrumentationRegistry.getInstrumentation().uiAutomation
        .executeShellCommandRwe("sh")
    ParcelFileDescriptor.AutoCloseOutputStream(stdin).use { it.write("$command\n".toByteArray()) }
    val out = ParcelFileDescriptor.AutoCloseInputStream(stdout).use { it.readBytes().decodeToString() }
    val err = ParcelFileDescriptor.AutoCloseInputStream(stderr).use { it.readBytes().decodeToString() }
    return out + err
}

/**
 * Sets a system property as apps/web does, as root. The instrumentation's shell
 * is root once `adb root` has run; otherwise this goes through su, which the
 * emulator's userdebug images have.
 */
fun setRootProperty(name: String, value: String) {
    shell("setprop $name '$value'")
    if (shell("getprop $name").trim() != value) {
        shell("su 0 setprop $name '$value'")
    }
    check(shell("getprop $name").trim() == value) {
        "Couldn't set $name; run `adb root` before the device tests"
    }
}
