import java.util.Properties

plugins {
    id("com.android.application")
}

// Clé définitive : keystore.properties et keys/ restent hors de Git. Sans eux, seule la version de test se compile.
val signing = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "yt.tamilya.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "yt.tamilya.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "1.2.0"
    }

    signingConfigs {
        if (!signing.isEmpty) {
            create("release") {
                storeFile = file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Connexion Google sans quitter l'app : panneau de compte d'Android (Credential Manager).
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    // Tamilya Connect : messages de téléphone en téléphone, sans internet.

    testImplementation("junit:junit:4.13.2")
    // Vraie bibliothèque JSON pour les tests sur l ordinateur (celle d Android n y est qu une coquille).
    testImplementation("org.json:json:20240303")
}
