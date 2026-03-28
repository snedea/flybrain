# Build Claims -- T9.1

## Files Changed
- [CREATE] js/vendor/three.min.js -- Vendored Three.js v0.128.0 (~603KB)
- [CREATE] js/vendor/OrbitControls.js -- Vendored OrbitControls from Three.js v0.128.0 (~26KB, UMD global version)
- [MODIFY] index.html -- Updated viewport meta (maximum-scale=1.0, user-scalable=no), replaced CDN script tags with local vendor paths (js/vendor/three.min.js, js/vendor/OrbitControls.js)
- [CREATE] ios/FlyBrain/FlyBrainApp.swift -- SwiftUI @main app entry point
- [CREATE] ios/FlyBrain/ContentView.swift -- ContentView with WebView (UIViewRepresentable wrapping WKWebView)
- [CREATE] ios/FlyBrain/Info.plist -- App metadata (bundle ID, orientations, launch screen config)
- [CREATE] ios/project.yml -- xcodegen spec defining the FlyBrain target with post-build script for web asset copying
- [CREATE] ios/FlyBrain.xcodeproj/ -- Generated Xcode project (via xcodegen)
- [MODIFY] .gitignore -- Added Xcode build artifact exclusions (xcuserdata, build/, DerivedData/)

## Verification Results
- Build: PASS (`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/FlyBrain.xcodeproj -scheme FlyBrain -destination 'platform=iOS Simulator,name=iPhone 16' -quiet build`)
- Tests: SKIPPED (no Swift tests exist)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: index.html viewport meta is `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no`
- [ ] Claim 2: index.html references `./js/vendor/three.min.js` and `./js/vendor/OrbitControls.js` (no CDN references remain)
- [ ] Claim 3: js/vendor/three.min.js is Three.js v0.128.0 (~603KB, downloaded from cdn.jsdelivr.net)
- [ ] Claim 4: js/vendor/OrbitControls.js is the UMD global version from Three.js v0.128.0 examples/js/controls/ (~26KB)
- [ ] Claim 5: WKWebView configuration includes: javaScriptEnabled=true, allowUniversalAccessFromFileURLs=true, bounces=false, isScrollEnabled=false, allowsLinkPreview=false, user script disabling touch callout and user select
- [ ] Claim 6: WKWebView loads index.html via loadFileURL with allowingReadAccessTo set to the parent directory (app bundle root)
- [ ] Claim 7: Post-build script copies index.html, css/, js/ (including vendor/), svg/, and data/connectome.bin.gz + data/neuron_meta.json into the app bundle
- [ ] Claim 8: Post-build script excludes connections.csv.gz, neurons.csv.gz, and other large CSV files from the bundle
- [ ] Claim 9: App builds for iOS Simulator (iPhone 16, iOS 18.3.1) without errors
- [ ] Claim 10: App installs and launches in iOS Simulator without crash (PID 55123 confirmed)
- [ ] Claim 11: All 11 bundle content checks pass (index.html, three.min.js, OrbitControls.js, main.js, sim-worker.js, main.css, center.svg, connectome.bin.gz, neuron_meta.json present; connections.csv.gz and neurons.csv.gz absent)

## Gaps and Assumptions
- Visual verification (connectome loads, fly walks, neuron panel renders) requires manual inspection in Simulator -- the app launched but rendering was not programmatically verified
- The deprecation warning for `javaScriptEnabled` (deprecated in iOS 14.0) is cosmetic -- the property still functions correctly
- `allowUniversalAccessFromFileURLs` uses a private KVC key -- this works but could theoretically break in a future iOS version
- No AppIcon or Assets.xcassets catalog was created (deferred to T9.3 per plan constraints)
- The caretaker WebSocket bridge (js/caretaker-bridge.js) will silently fail in iOS (no localhost server) -- this is expected and safe per plan
- The xcodegen-generated .xcodeproj is committed to git; regeneration requires `xcodegen generate --spec project.yml` from the ios/ directory
