# Scout Report: T9.1

## Key Facts (read this first)

- **Tech stack**: Vanilla JS web app (no build step). Xcode 16.2 at `/Applications/Xcode.app`. `xcodegen` v2.45.3 at `/opt/homebrew/bin/xcodegen` -- use it; do NOT hand-write `project.pbxproj`.
- **`xcode-select` is misconfigured**: points to CLT, not Xcode. All `xcode*` / `xcrun` commands must be prefixed with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- **CDN deps to vendorize**: `index.html:89-90` loads Three.js v0.128.0 and OrbitControls from `cdn.jsdelivr.net`. These must move to `js/vendor/three.min.js` and `js/vendor/OrbitControls.js`.
- **Viewport meta already exists but is incomplete**: `index.html:4` has `width=device-width,initial-scale=1` -- needs `maximum-scale=1.0, user-scalable=no` appended.
- **No `ios/` directory exists**; no `js/vendor/` directory exists -- both must be created.

## Relevant Files

- `index.html` -- load CDN scripts (lines 89-90), viewport meta (line 4), all script tags -- modify to add viewport attrs and local vendor paths
- `js/brain-worker-bridge.js:119` -- `new Worker('js/sim-worker.js')` relative URL; works with `loadFileURL` + `allowingReadAccessTo` pointing to bundle root
- `js/caretaker-bridge.js:2` -- tries `ws://localhost:7600`; silently fails in iOS (no server running), safe to ignore
- `data/connectome.bin.gz` (12MB) -- INCLUDE in bundle
- `data/neuron_meta.json` (7.5KB) -- INCLUDE in bundle
- `data/connections.csv.gz` (50MB), `data/neurons.csv.gz` (1.7MB), `data/coordinates.csv.gz` (5.3MB), `data/classification.csv.gz` (934KB) -- EXCLUDE (build scripts only)
- `css/main.css`, `js/*.js`, `svg/*.svg` -- all INCLUDE in bundle

## Architecture Notes

- **No build step**: JS files are served directly. The iOS app must copy them verbatim into the app bundle via a shell script build phase.
- **Web Worker**: instantiated at `brain-worker-bridge.js:119` with relative path `'js/sim-worker.js'`. WKWebView requires `allowingReadAccessTo:` pointing to the bundle root so that worker's `file://` URL resolves same-origin. iOS 17+ target guarantees this works.
- **DecompressionStream**: used in `brain-worker-bridge.js` to decompress `connectome.bin.gz`. Supported in WKWebView on iOS 16.4+; target is iOS 17.0, so safe.
- **WebSocket (caretaker)**: `caretaker-bridge.js` attempts `ws://localhost:7600` -- will fail in iOS simulator/device (no caretaker server). The bridge has reconnect logic and `console.warn` only. No crash risk.
- **Asset path assumptions**: all JS uses relative paths (`./js/`, `./css/`, `./data/`) from the `index.html` root. The bundle layout must mirror the repo's root directory structure exactly.

## Suggested Approach

1. **Vendorize Three.js first**: `curl` both files into `js/vendor/`. Update `index.html` lines 89-90 to `./js/vendor/three.min.js` and `./js/vendor/OrbitControls.js`. Patch viewport meta on the same edit.

2. **Create Swift sources** in `ios/FlyBrain/`:
   - `FlyBrainApp.swift` -- `@main` SwiftUI app entry
   - `ContentView.swift` -- `UIViewRepresentable` wrapping WKWebView with: JS enabled, bounce/scroll suppressed, link previews off, callouts off, `loadFileURL(indexURL, allowingReadAccessTo: Bundle.main.bundleURL)`
   - `Info.plist` -- minimum keys: `CFBundleName`, `CFBundleIdentifier` (`com.snedea.flybrain`), `UILaunchScreen`, deployment target iOS 17.0

3. **Write `ios/project.yml`** for xcodegen:
   - Target: `FlyBrain`, type `application`, platform `iOS`, deploymentTarget `17.0`
   - Sources: `ios/FlyBrain/` (Swift files)
   - `postBuildScripts` or `prebuildScripts`: shell script that rsyncs `index.html`, `css/`, `js/`, `svg/`, `data/connectome.bin.gz`, `data/neuron_meta.json` from `$SRCROOT/../` into `$BUILT_PRODUCTS_DIR/$CONTENTS_FOLDER_PATH/`
   - Settings: `SWIFT_VERSION: 5.0`, `PRODUCT_BUNDLE_IDENTIFIER: com.snedea.flybrain`, `IPHONEOS_DEPLOYMENT_TARGET: 17.0`

4. **Generate project**: `cd ios && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodegen generate --spec project.yml`

5. **Verify**: `DEVELOPER_DIR=... xcodebuild -project ios/FlyBrain.xcodeproj -scheme FlyBrain -destination 'platform=iOS Simulator,name=iPhone 16' build`

## Risks and Constraints (read this last)

- **xcode-select not switched**: Every xcode/xcrun call needs `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. The build phase shell script in Xcode runs via Xcode itself so it doesn't need the prefix -- only CLI invocations do.
- **xcodegen folder references**: xcodegen doesn't natively create "blue folder" references for the web assets. The shell-script build phase approach (rsync at build time) is the correct workaround -- do NOT try to add web directories as source groups, they would get compiled.
- **Three.js v0.128.0 OrbitControls path**: On jsdelivr the path is `npm/three@0.128.0/examples/js/controls/OrbitControls.js` (NOT `examples/jsm/`). The `jsm` version uses ES modules; the `js` version is the global-script version that the existing `brain3d.js` expects (it accesses `THREE.OrbitControls` as a global).
- **Bundle root access**: `loadFileURL` must set `allowingReadAccessTo:` to `Bundle.main.bundleURL` (the `.app` directory), NOT just the directory containing `index.html`. This grants read access to all siblings so `js/sim-worker.js`, `css/main.css`, `data/connectome.bin.gz` etc. all resolve correctly.
- **callouts CSS vs Swift**: Disabling `-webkit-touch-callout` and `-webkit-user-select` is best done via a WKUserScript injected at `atDocumentStart` to avoid flash, rather than modifying `css/main.css` (which would affect the desktop web app).
- **connectome.bin.gz is 12MB**: bundle size will be ~14MB total. Within App Store limits. No action needed, just noting it.
- **`data/` mkdir in build phase**: The rsync destination `$BUILT_PRODUCTS_DIR/.../data/` won't exist until created; use `mkdir -p` before the rsync for the data directory.
