plugins {
    id("com.android.application")
}

// Adresse du site emballé (TWA). Un seul endroit à changer.
val siteHost = "tamilya.yt"

android {
    namespace = "yt.tamilya.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "yt.tamilya.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        manifestPlaceholders["hostName"] = siteHost
        manifestPlaceholders["defaultUrl"] = "https://$siteHost/"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
