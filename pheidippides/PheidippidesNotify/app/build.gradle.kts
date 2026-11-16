plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")

    id("io.sentry.android.gradle") version "4.10.0"
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
    compileSdk = 34

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
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.1"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    compileOnly("org.projectlombok:lombok:1.18.34")
    annotationProcessor("org.projectlombok:lombok:1.18.34")
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    implementation("androidx.core:core-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.1")
    implementation("androidx.activity:activity-compose:1.7.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}

sentry {
    org.set("regulad")
    projectName.set("pheidippides-notify")

    // this will upload your source code to Sentry to show it as part of the stack traces
    // disable if you don't want to expose your sources
    includeSourceContext.set(true)
}
