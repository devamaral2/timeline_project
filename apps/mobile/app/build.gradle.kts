import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ktlint)
}

val localProperties =
    Properties().apply {
        rootProject
            .file("local.properties")
            .takeIf { it.exists() }
            ?.inputStream()
            ?.use(::load)
    }

fun localProp(
    name: String,
    fallback: String,
): String = localProperties.getProperty(name, fallback)

val releaseKeystorePath = providers.environmentVariable("MOBILE_KEYSTORE_PATH").orNull
val releaseKeystorePassword = providers.environmentVariable("MOBILE_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("MOBILE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("MOBILE_KEY_PASSWORD").orNull
val releaseApiBaseUrl = providers.environmentVariable("MOBILE_API_BASE_URL").orNull ?: "https://api.SEUDOMINIO"
val releaseAuthBaseUrl = providers.environmentVariable("MOBILE_AUTH_BASE_URL").orNull ?: "https://auth.SEUDOMINIO"
val hasReleaseSigning =
    listOf(
        releaseKeystorePath,
        releaseKeystorePassword,
        releaseKeyAlias,
        releaseKeyPassword,
    ).all { !it.isNullOrBlank() }
val hasProductionUrls =
    listOf(releaseApiBaseUrl, releaseAuthBaseUrl).all {
        it.startsWith("https://") && !it.contains("SEUDOMINIO")
    }

fun buildConfigString(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

android {
    namespace = "app.braid.mobile"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.braid.mobile"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        create("release") {
            if (hasReleaseSigning) {
                storeFile = file(requireNotNull(releaseKeystorePath))
                storePassword = requireNotNull(releaseKeystorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"${localProp("braid.apiUrl", "http://localhost:3001")}\"")
            buildConfigField("String", "AUTH_BASE_URL", "\"${localProp("braid.authUrl", "http://localhost:3002")}\"")
        }
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            buildConfigField("String", "API_BASE_URL", buildConfigString(releaseApiBaseUrl))
            buildConfigField("String", "AUTH_BASE_URL", buildConfigString(releaseAuthBaseUrl))
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

tasks.register("verifyReleaseSigning") {
    doLast {
        if (!hasReleaseSigning) {
            throw GradleException(
                "Release signing is not configured. Set MOBILE_KEYSTORE_PATH, " +
                    "MOBILE_KEYSTORE_PASSWORD, MOBILE_KEY_ALIAS and MOBILE_KEY_PASSWORD.",
            )
        }
    }
}

tasks.register("verifyReleaseProductionUrls") {
    doLast {
        if (!hasProductionUrls) {
            throw GradleException(
                "Release URLs are not configured. Set MOBILE_API_BASE_URL and " +
                    "MOBILE_AUTH_BASE_URL to HTTPS production URLs.",
            )
        }
    }
}

tasks.configureEach {
    if (name == "assembleRelease") {
        dependsOn("verifyReleaseSigning", "verifyReleaseProductionUrls")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.kotlin.serialization)
    implementation(libs.okhttp)
    debugImplementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.datetime)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.tink.android)

    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)

    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.test.espresso.core)
}
