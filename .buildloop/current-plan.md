# Plan: T9.1

## Dependencies
- list: [xcodegen v2.45.3 (already installed at /opt/homebrew/bin/xcodegen), Xcode 16.2 (already installed at /Applications/Xcode.app)]
- commands: none -- all tools are already installed

## CRITICAL: xcode-select is misconfigured
Every `xcodebuild`, `xcrun`, or `xcodegen` CLI invocation MUST be prefixed with:
```
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```
Build phase shell scripts run inside Xcode itself and do NOT need this prefix.

## File Operations (in execution order)

### 1. CREATE js/vendor/three.min.js
- operation: CREATE
- reason: Vendorize Three.js v0.128.0 so the app works offline and in the iOS bundle without CDN access

#### Download Command
```bash
mkdir -p /Users/name/homelab/flybrain/js/vendor
curl -fsSL "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js" -o /Users/name/homelab/flybrain/js/vendor/three.min.js
```

#### Verification
- File must be non-empty (expect ~600KB)
- Run: `head -1 /Users/name/homelab/flybrain/js/vendor/three.min.js` -- should contain `// threejs.org/license` or similar header comment

### 2. CREATE js/vendor/OrbitControls.js
- operation: CREATE
- reason: Vendorize OrbitControls from the same pinned Three.js version (UMD global-script version, NOT the ESM jsm version)

#### Download Command
```bash
curl -fsSL "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js" -o /Users/name/homelab/flybrain/js/vendor/OrbitControls.js
```

#### Verification
- File must be non-empty (expect ~30KB)
- Run: `head -5 /Users/name/homelab/flybrain/js/vendor/OrbitControls.js` -- should reference `THREE.OrbitControls`

### 3. MODIFY index.html
- operation: MODIFY
- reason: (a) Update viewport meta to disable user scaling on mobile, (b) Replace CDN script tags with local vendor paths

#### Change 1: Viewport meta
- anchor: `<meta name="viewport" content="width=device-width,initial-scale=1">`
- Replace the entire line with:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  ```

#### Change 2: Three.js CDN -> local vendor
- anchor: `<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>`
- Replace with:
  ```html
  <!-- Three.js v0.128.0 (vendored) -- do NOT upgrade one without the other -->
  <script src="./js/vendor/three.min.js"></script>
  ```

#### Change 3: OrbitControls CDN -> local vendor
- anchor: `<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>`
- Replace with:
  ```html
  <script src="./js/vendor/OrbitControls.js"></script>
  ```

### 4. CREATE ios/FlyBrain/FlyBrainApp.swift
- operation: CREATE
- reason: SwiftUI app entry point (@main)

#### Content (exact):
```swift
import SwiftUI

@main
struct FlyBrainApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea()
        }
    }
}
```

### 5. CREATE ios/FlyBrain/ContentView.swift
- operation: CREATE
- reason: UIViewRepresentable wrapping WKWebView with all required configuration

#### Imports
```swift
import SwiftUI
import WebKit
```

#### Structs / Types

**WebView: UIViewRepresentable**
- purpose: Wrap WKWebView for SwiftUI with all iOS-specific configuration

#### Functions

- signature: `func makeUIView(context: Context) -> WKWebView`
  - purpose: Create and configure the WKWebView instance
  - logic:
    1. Create a `WKWebViewConfiguration` instance
    2. Set `configuration.preferences.javaScriptEnabled = true` (default, but explicit)
    3. Set `configuration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")` to ensure Web Workers can load from file:// same-origin
    4. Create a `WKUserScript` with source:
       ```javascript
       document.documentElement.style.webkitTouchCallout='none';
       document.documentElement.style.webkitUserSelect='none';
       ```
       injection time: `.atDocumentStart`, forMainFrameOnly: `false`
    5. Add the user script to `configuration.userContentController`
    6. Create `WKWebView(frame: .zero, configuration: configuration)`
    7. Set `webView.scrollView.bounces = false`
    8. Set `webView.scrollView.isScrollEnabled = false`
    9. Set `webView.scrollView.contentInsetAdjustmentBehavior = .never`
    10. Set `webView.allowsLinkPreview = false`
    11. Set `webView.isOpaque = false`
    12. Set `webView.backgroundColor = .black`
    13. Locate `index.html` in the app bundle: `guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html") else { fatalError("index.html not found in bundle") }`
    14. Get the parent directory of indexURL: `let webDir = indexURL.deletingLastPathComponent()`
    15. Call `webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)` -- webDir is the directory containing index.html plus all subdirectories (css/, js/, svg/, data/), granting same-origin access for Workers
    16. Return `webView`
  - returns: `WKWebView`
  - error handling: `fatalError` if index.html is not found (build phase guarantees it exists)

- signature: `func updateUIView(_ uiView: WKWebView, context: Context)`
  - purpose: No-op, required by protocol
  - logic: empty body
  - returns: void

#### Full struct:
```swift
struct ContentView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea()
    }
}

struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptEnabled = true
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        let script = WKUserScript(
            source: "document.documentElement.style.webkitTouchCallout='none';document.documentElement.style.webkitUserSelect='none';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(script)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.bounces = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = .black

        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html") else {
            fatalError("index.html not found in bundle")
        }
        let webDir = indexURL.deletingLastPathComponent()
        webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
```

### 6. CREATE ios/FlyBrain/Info.plist
- operation: CREATE
- reason: App metadata -- bundle ID, name, deployment target, launch screen config

#### Content (exact):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>FlyBrain</string>
    <key>CFBundleDisplayName</key>
    <string>FlyBrain</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>UILaunchScreen</key>
    <dict>
        <key>UIColorName</key>
        <string>LaunchBG</string>
    </dict>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>UIRequiresFullScreen</key>
    <false/>
</dict>
</plist>
```

### 7. CREATE ios/project.yml
- operation: CREATE
- reason: xcodegen spec that generates the Xcode project -- avoids hand-editing pbxproj

#### Content (exact):
```yaml
name: FlyBrain
options:
  bundleIdPrefix: com.snedea
  deploymentTarget:
    iOS: "17.0"
  xcodeVersion: "16.2"
  generateEmptyDirectories: true

targets:
  FlyBrain:
    type: application
    platform: iOS
    deploymentTarget:
      iOS: "17.0"
    sources:
      - path: FlyBrain
        type: group
    settings:
      base:
        SWIFT_VERSION: "5.0"
        PRODUCT_BUNDLE_IDENTIFIER: com.snedea.flybrain
        IPHONEOS_DEPLOYMENT_TARGET: "17.0"
        INFOPLIST_FILE: FlyBrain/Info.plist
        GENERATE_INFOPLIST_FILE: false
        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
    postBuildScripts:
      - name: "Copy Web Assets"
        script: |
          set -euo pipefail
          WEB_ROOT="${SRCROOT}/.."
          DEST="${BUILT_PRODUCTS_DIR}/${CONTENTS_FOLDER_PATH}"

          # Copy index.html
          cp "${WEB_ROOT}/index.html" "${DEST}/index.html"

          # Copy css/
          mkdir -p "${DEST}/css"
          rsync -a --delete "${WEB_ROOT}/css/" "${DEST}/css/"

          # Copy js/ (includes js/vendor/)
          mkdir -p "${DEST}/js"
          rsync -a --delete "${WEB_ROOT}/js/" "${DEST}/js/"

          # Copy svg/
          mkdir -p "${DEST}/svg"
          rsync -a --delete "${WEB_ROOT}/svg/" "${DEST}/svg/"

          # Copy data/ (only connectome.bin.gz and neuron_meta.json -- exclude large CSVs)
          mkdir -p "${DEST}/data"
          cp "${WEB_ROOT}/data/connectome.bin.gz" "${DEST}/data/connectome.bin.gz"
          cp "${WEB_ROOT}/data/neuron_meta.json" "${DEST}/data/neuron_meta.json"

          echo "Web assets copied to ${DEST}"
        basedOnDependencyAnalysis: false
        inputFiles: []
        outputFiles: []
```

### 8. Generate the Xcode project
- operation: COMMAND (not a file create -- run after writing project.yml)

#### Command:
```bash
cd /Users/name/homelab/flybrain/ios && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer /opt/homebrew/bin/xcodegen generate --spec project.yml
```

#### Expected output:
- `ios/FlyBrain.xcodeproj/` directory created
- Console output: `Generated FlyBrain project at ...`

### 9. MODIFY .gitignore
- operation: MODIFY
- reason: Exclude Xcode build artifacts and user-specific project settings from git

#### Append to end of file:
```
# Xcode
ios/FlyBrain.xcodeproj/xcuserdata/
ios/FlyBrain.xcodeproj/project.xcworkspace/xcuserdata/
ios/build/
DerivedData/
```

## Verification

### Build (copy-paste ready):
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project /Users/name/homelab/flybrain/ios/FlyBrain.xcodeproj -scheme FlyBrain -destination 'platform=iOS Simulator,name=iPhone 16' -quiet build
```
Expected: `BUILD SUCCEEDED`

### Lint:
No linter configured for this project. Skip.

### Test:
No existing tests for Swift code. Skip.

### Smoke test -- verify web assets in build product:
```bash
BUILD_DIR=$(DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project /Users/name/homelab/flybrain/ios/FlyBrain.xcodeproj -scheme FlyBrain -showBuildSettings 2>/dev/null | grep -m1 'BUILT_PRODUCTS_DIR' | awk '{print $3}')
APP_PATH="${BUILD_DIR}/FlyBrain.app"
echo "--- Checking bundle contents ---"
test -f "${APP_PATH}/index.html" && echo "PASS: index.html" || echo "FAIL: index.html"
test -f "${APP_PATH}/js/vendor/three.min.js" && echo "PASS: three.min.js" || echo "FAIL: three.min.js"
test -f "${APP_PATH}/js/vendor/OrbitControls.js" && echo "PASS: OrbitControls.js" || echo "FAIL: OrbitControls.js"
test -f "${APP_PATH}/js/main.js" && echo "PASS: main.js" || echo "FAIL: main.js"
test -f "${APP_PATH}/js/sim-worker.js" && echo "PASS: sim-worker.js" || echo "FAIL: sim-worker.js"
test -f "${APP_PATH}/css/main.css" && echo "PASS: main.css" || echo "FAIL: main.css"
test -f "${APP_PATH}/svg/center.svg" && echo "PASS: center.svg" || echo "FAIL: center.svg"
test -f "${APP_PATH}/data/connectome.bin.gz" && echo "PASS: connectome.bin.gz" || echo "FAIL: connectome.bin.gz"
test -f "${APP_PATH}/data/neuron_meta.json" && echo "PASS: neuron_meta.json" || echo "FAIL: neuron_meta.json"
test ! -f "${APP_PATH}/data/connections.csv.gz" && echo "PASS: connections.csv.gz excluded" || echo "FAIL: connections.csv.gz should be excluded"
test ! -f "${APP_PATH}/data/neurons.csv.gz" && echo "PASS: neurons.csv.gz excluded" || echo "FAIL: neurons.csv.gz should be excluded"
```

### Smoke test -- verify index.html changes:
```bash
grep -q 'maximum-scale=1.0, user-scalable=no' /Users/name/homelab/flybrain/index.html && echo "PASS: viewport meta" || echo "FAIL: viewport meta"
grep -q 'js/vendor/three.min.js' /Users/name/homelab/flybrain/index.html && echo "PASS: local three.js path" || echo "FAIL: local three.js path"
grep -q 'js/vendor/OrbitControls.js' /Users/name/homelab/flybrain/index.html && echo "PASS: local OrbitControls path" || echo "FAIL: local OrbitControls path"
grep -qv 'cdn.jsdelivr.net' /Users/name/homelab/flybrain/index.html && echo "PASS: no CDN refs" || echo "FAIL: CDN refs still present"
```

### Smoke test -- Simulator launch:
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl boot "iPhone 16" 2>/dev/null || true
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl install "iPhone 16" "${APP_PATH}"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl launch "iPhone 16" com.snedea.flybrain
```
Expected: app launches without crash. The connectome loading, fly walking, and neuron panel rendering require visual inspection in the Simulator UI -- the builder should open Simulator.app and observe.

## Constraints
- Do NOT modify any existing JS files (js/*.js) -- only index.html is modified
- Do NOT modify css/main.css -- touch/layout changes are deferred to T9.2
- Do NOT hand-edit the .pbxproj file -- use xcodegen exclusively
- Do NOT add web asset files as Xcode source groups -- they are copied via the build phase shell script
- Do NOT include data/connections.csv.gz, data/neurons.csv.gz, data/coordinates.csv.gz, or data/classification.csv.gz in the build phase -- these are build-script-only files
- The `allowingReadAccessTo:` parameter MUST point to the directory containing index.html (which is the .app bundle root after the copy), NOT `Bundle.main.bundleURL` -- since assets are copied flat into the .app root, the parent of index.html IS the .app root, so `indexURL.deletingLastPathComponent()` is correct and equivalent
- Every `xcodebuild`/`xcrun`/`xcodegen` CLI call MUST be prefixed with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
- Three.js CDN URL for OrbitControls MUST use `examples/js/controls/OrbitControls.js` (UMD global), NOT `examples/jsm/controls/OrbitControls.js` (ES module)
- Do NOT create an Assets.xcassets catalog or AppIcon -- that is T9.3's scope
- The caretaker WebSocket bridge (js/caretaker-bridge.js) will silently fail in iOS (no localhost server) -- this is expected and safe, do not add special handling
