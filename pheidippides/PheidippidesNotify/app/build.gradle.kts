plugins {
    id("com.android.application")

    id("io.sentry.android.gradle") version "6.25.0"
}

// versionCode is the number of commits that touched this app, so every change
// to it ships as a new, higher version: devices install a Pheidippides APK only
// when its versionCode is higher than the one they have
// (apps/web/server/src/adb/initial-setup.ts). The count needs the whole
// history, so a shallow clone fails the build rather than count too few.
fun git(vararg args: String): String =
    providers.exec {
        workingDir = rootDir
        commandLine("git", *args)
    }.standardOutput.asText.get().trim()

check(git("rev-parse", "--is-shallow-repository") == "false") {
    "versionCode counts this app's commits, which needs a full clone, not a shallow one"
}
val commitCount = git("rev-list", "--count", "HEAD", "--", ".").toInt()

android {
    namespace = "xyz.regulad.pheidippides.notify"
    compileSdk = 37

    defaultConfig {
        applicationId = "xyz.regulad.pheidippides.notify"
        minSdk = 29
        targetSdk = 34
        versionCode = commitCount
        versionName = "1.6"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    // CI signs every build with Pheidippides' own key, decrypted from
    // pheidippides/signing.sops.yaml, so each version installs over the one
    // before it in place. Without it, builds use the default debug key, which
    // each machine generates for itself.
    val keystore = System.getenv("PHEIDIPPIDES_KEYSTORE")
    if (keystore != null) {
        signingConfigs {
            create("pheidippides") {
                storeFile = file(keystore)
                // PKCS12 keeps one password for the store and its key
                storePassword = System.getenv("PHEIDIPPIDES_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("PHEIDIPPIDES_KEY_ALIAS")
                keyPassword = System.getenv("PHEIDIPPIDES_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        getByName("debug") {
            if (keystore != null) {
                signingConfig = signingConfigs.getByName("pheidippides")
            }
        }
        // The debug build as shipped, but with Sentry's DSN pointed at a port
        // nothing listens on (src/deviceTest/AndroidManifest.xml), so a test run
        // exercises the SDK without reporting to production
        create("deviceTest") {
            initWith(getByName("debug"))
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    // Instrumented tests run against deviceTest rather than debug, whose DSN is
    // production's
    testBuildType = "deviceTest"
    testOptions {
        // Robolectric reads the merged manifest and resources
        unitTests.isIncludeAndroidResources = true
    }
    // Checks that both the unit tests and the device tests use
    sourceSets {
        getByName("test").kotlin.directories.add("src/sharedTest/java")
        getByName("androidTest").kotlin.directories.add("src/sharedTest/java")
    }
}

androidComponents {
    // Unit tests run once, against deviceTest: the other build types compile the
    // same code, and debug's manifest carries production's DSN
    beforeVariants { variant ->
        variant.hostTests[com.android.build.api.variant.HostTestBuilder.UNIT_TEST_TYPE]?.enable =
            variant.buildType == "deviceTest"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_1_8)
    }
}

dependencies {
    compileOnly("org.projectlombok:lombok:1.18.48")
    annotationProcessor("org.projectlombok:lombok:1.18.48")
    implementation("com.google.code.gson:gson:2.15.0")
    implementation("com.squareup.okhttp3:okhttp:5.5.1")

    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("androidx.test.ext:junit:1.2.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:5.5.1")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("com.squareup.okhttp3:mockwebserver:5.5.1")
}

sentry {
    org.set("regulad")
    projectName.set("pheidippides-notify")

    // this will upload your source code to Sentry to show it as part of the stack traces
    // disable if you don't want to expose your sources
    includeSourceContext.set(true)
}
