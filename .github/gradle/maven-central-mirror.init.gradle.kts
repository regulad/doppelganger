// Maven Central answers GitHub's runners with "429 Too Many Requests" at
// times, which fails whichever Gradle build was resolving at the moment. CI
// fetches Maven Central through regulad's Nexus instead, whose maven-central
// proxy caches what it serves. The mirror is regulad's own because neither
// GitHub nor Microsoft hosts a public mirror of Maven Central for runners to
// use: Azure Artifacts can proxy it, but only through a feed of one's own. It
// signs in with a token of its own, from the MAVEN_MIRROR_USERNAME and
// MAVEN_MIRROR_PASSWORD secrets.
//
// CI copies this into ~/.gradle/init.d. Without the token, as on a fork's pull
// request, it does nothing and Gradle uses Maven Central directly. The builds
// themselves still name mavenCentral(), so local builds and Dependabot's
// updater use Maven Central too.
val mirror = uri("https://repo.regulad.xyz/repository/maven-central/")
val mirrorUsername: String? = System.getenv("MAVEN_MIRROR_USERNAME")?.takeIf { it.isNotBlank() }
val mirrorPassword: String? = System.getenv("MAVEN_MIRROR_PASSWORD")?.takeIf { it.isNotBlank() }

if (mirrorUsername != null && mirrorPassword != null) {
    logger.lifecycle("Fetching Maven Central through $mirror")
}

fun RepositoryHandler.fetchCentralFromMirror() {
    if (mirrorUsername == null || mirrorPassword == null) return
    all {
        if (this is MavenArtifactRepository && url.host == "repo.maven.apache.org") {
            setUrl(mirror)
            credentials {
                username = mirrorUsername
                password = mirrorPassword
            }
        }
    }
}

beforeSettings {
    pluginManagement.repositories.fetchCentralFromMirror()
    dependencyResolutionManagement.repositories.fetchCentralFromMirror()
}

allprojects {
    buildscript.repositories.fetchCentralFromMirror()
    repositories.fetchCentralFromMirror()
}
