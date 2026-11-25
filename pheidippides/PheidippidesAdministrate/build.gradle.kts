// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    id("com.android.application") version "9.5.2" apply false
    // The Android Gradle plugin compiles Kotlin itself since 9.0; declaring
    // Kotlin's plugin here, unapplied, only sets the Kotlin version it uses
    id("org.jetbrains.kotlin.android") version "2.4.21" apply false
}
