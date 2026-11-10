Many of the redroid-images are compiled with one of the following tools:

1. https://github.com/remote-android/redroid-doc
2. https://github.com/ayasa520/redroid-script
3. https://github.com/abing7k/redroid-script
4. https://github.com/regulad/redroid-script (mine with the mods required to run)

Some prebuilts are available here. https://repo.regulad.xyz/#browse/browse:cr:v2%2Fregulad%2Fredroid-script

The catalog is `redroid-images.json5`, which is the file to edit.
`pnpm catalog:generate` writes `redroid-images.json` from it, which the code
imports and git ignores. The dev, build, server:build, test and type-check
scripts run it first; run it yourself after an edit if one of them is already
running, or if your editor reports the JSON missing.
