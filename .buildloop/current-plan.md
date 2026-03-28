# Plan: T9.3

## Dependencies
- list: none (no new packages or tools required)
- commands: none

## Context

The iOS project already exists at `ios/FlyBrain.xcodeproj` with `project.yml` (XcodeGen) and a hand-maintained `.pbxproj`. The build settings already reference `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` but no `Assets.xcassets` directory exists yet. Info.plist exists with most metadata already set. No launch screen storyboard exists -- Info.plist uses `UILaunchScreen` dict with `UIColorName = LaunchBG`.

The project uses `project.yml` (XcodeGen format) which generates the `.pbxproj`. Both must be updated in sync.

CSS custom properties from `css/main.css`:
- `--bg: #1a1a2e` (dark background -- use for launch screen and icon background)
- `--surface: #16213e` (neural panel blue)
- `--border: #2a3a5c`
- `--neuron-sensory: #3b82f6` (blue)
- `--neuron-central: #8b5cf6` (purple)
- `--neuron-drives: #f59e0b` (amber)
- `--neuron-motor: #ef4444` (red)
- `--accent: #E3734B` (orange)
- `--text: #e8e8e8`

Font: `system-ui, -apple-system, sans-serif` throughout the web UI.

## File Operations (in execution order)

### 1. CREATE `svg/app-icon.svg`
- operation: CREATE
- reason: Source 1024x1024 SVG for the app icon -- a stylized top-down Drosophila brain silhouette using project colors

#### Content Specification

The SVG must be exactly 1024x1024 viewBox. Design:

**Background**: Rounded rectangle (radius 224 for iOS superellipse simulation) filled with `#1a1a2e` (--bg).

**Brain silhouette**: A top-down Drosophila brain outline (mushroom-shaped: two large mushroom body lobes at top, narrowing to a central body, with optic lobes as lateral bulges). Use two concentric shapes:
- Outer glow/stroke: `#2a3a5c` (--border), 4px stroke, no fill
- Inner fill: linear gradient from `#16213e` (--surface, top) to `#1a2744` (--surface-hover, bottom)

**Neural pathway lines**: 6-8 thin lines (1.5-2px stroke) inside the brain shape representing neural tracts, using these colors:
- 2 lines in `#3b82f6` (--neuron-sensory) -- optic tract paths from lateral lobes to center
- 2 lines in `#8b5cf6` (--neuron-central) -- mushroom body to central complex connections
- 1 line in `#f59e0b` (--neuron-drives) -- central descending pathway
- 1 line in `#ef4444` (--neuron-motor) -- motor output path downward

**Neuron dots**: 12-16 small circles (radius 8-12) scattered along the neural pathway lines, filled with the same neuron colors at 80% opacity, representing active neurons.

**Exact SVG content** (the builder must use this exact SVG -- do not modify):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="brainFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#16213e"/>
      <stop offset="100%" stop-color="#1a2744"/>
    </linearGradient>
    <clipPath id="roundedBg">
      <rect width="1024" height="1024" rx="224" ry="224"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" rx="224" ry="224" fill="#1a1a2e"/>

  <g clip-path="url(#roundedBg)">
    <!-- Brain silhouette: top-down Drosophila brain -->
    <!-- Two mushroom body lobes (top), optic lobes (sides), central body -->
    <path d="
      M 512 180
      C 420 180, 340 220, 310 300
      C 280 370, 240 380, 180 370
      C 140 365, 110 400, 110 450
      C 110 520, 160 570, 230 560
      C 280 555, 310 580, 330 640
      C 350 700, 400 760, 440 800
      C 470 830, 500 845, 512 850
      C 524 845, 554 830, 584 800
      C 624 760, 674 700, 694 640
      C 714 580, 744 555, 794 560
      C 864 570, 914 520, 914 450
      C 914 400, 884 365, 844 370
      C 784 380, 744 370, 714 300
      C 684 220, 604 180, 512 180
      Z"
      fill="url(#brainFill)"
      stroke="#2a3a5c"
      stroke-width="4"
    />

    <!-- Mushroom body lobes (two top bulges) -->
    <ellipse cx="410" cy="280" rx="80" ry="60" fill="url(#brainFill)" stroke="#2a3a5c" stroke-width="2.5"/>
    <ellipse cx="614" cy="280" rx="80" ry="60" fill="url(#brainFill)" stroke="#2a3a5c" stroke-width="2.5"/>

    <!-- Neural pathway lines -->
    <!-- Sensory: optic tract from left optic lobe to center -->
    <path d="M 180 450 Q 280 440, 380 380 Q 440 340, 480 320" fill="none" stroke="#3b82f6" stroke-width="2" opacity="0.7"/>
    <!-- Sensory: optic tract from right optic lobe to center -->
    <path d="M 844 450 Q 744 440, 644 380 Q 584 340, 544 320" fill="none" stroke="#3b82f6" stroke-width="2" opacity="0.7"/>

    <!-- Central: mushroom body connections -->
    <path d="M 410 310 Q 430 380, 470 440 Q 500 480, 512 520" fill="none" stroke="#8b5cf6" stroke-width="2" opacity="0.7"/>
    <path d="M 614 310 Q 594 380, 554 440 Q 524 480, 512 520" fill="none" stroke="#8b5cf6" stroke-width="2" opacity="0.7"/>

    <!-- Drives: central descending -->
    <path d="M 512 320 L 512 520 Q 512 600, 512 680" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.7"/>

    <!-- Motor: output pathway -->
    <path d="M 512 680 Q 490 740, 470 790" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.7"/>
    <path d="M 512 680 Q 534 740, 554 790" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.7"/>

    <!-- Neuron dots along pathways -->
    <!-- Sensory neurons (blue) -->
    <circle cx="230" cy="450" r="10" fill="#3b82f6" opacity="0.85"/>
    <circle cx="380" cy="385" r="8" fill="#3b82f6" opacity="0.85"/>
    <circle cx="794" cy="450" r="10" fill="#3b82f6" opacity="0.85"/>
    <circle cx="644" cy="385" r="8" fill="#3b82f6" opacity="0.85"/>

    <!-- Central neurons (purple) -->
    <circle cx="420" cy="350" r="9" fill="#8b5cf6" opacity="0.85"/>
    <circle cx="604" cy="350" r="9" fill="#8b5cf6" opacity="0.85"/>
    <circle cx="480" cy="440" r="8" fill="#8b5cf6" opacity="0.85"/>
    <circle cx="544" cy="440" r="8" fill="#8b5cf6" opacity="0.85"/>

    <!-- Drive neurons (amber) -->
    <circle cx="512" cy="420" r="10" fill="#f59e0b" opacity="0.85"/>
    <circle cx="512" cy="580" r="9" fill="#f59e0b" opacity="0.85"/>

    <!-- Motor neurons (red) -->
    <circle cx="480" cy="760" r="9" fill="#ef4444" opacity="0.85"/>
    <circle cx="544" cy="760" r="9" fill="#ef4444" opacity="0.85"/>
    <circle cx="512" cy="700" r="8" fill="#ef4444" opacity="0.85"/>
  </g>
</svg>
```

### 2. CREATE `ios/FlyBrain/Assets.xcassets/Contents.json`
- operation: CREATE
- reason: Root asset catalog manifest required by Xcode

#### Content (exact JSON)
```json
{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

### 3. CREATE `ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/Contents.json`
- operation: CREATE
- reason: App icon asset catalog entry -- iOS 17+ only needs a single 1024x1024 image

#### Content (exact JSON)

Since the deployment target is iOS 17.0, use the single-size icon format (iOS 17+ does automatic resizing from a single 1024x1024 source):

```json
{
  "images" : [
    {
      "filename" : "app-icon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

### 4. CREATE `ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png`
- operation: CREATE
- reason: The actual 1024x1024 PNG icon image rendered from the source SVG

#### Generation Steps

The builder must create the PNG from the SVG. Use one of these approaches (in order of preference):

**Option A: Use `rsvg-convert` (if available)**
```bash
rsvg-convert -w 1024 -h 1024 svg/app-icon.svg -o ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png
```

**Option B: Use `sips` (macOS built-in) with a two-step process**

`sips` cannot read SVG directly. Use Python with `cairosvg` if available:
```bash
python3 -c "import cairosvg; cairosvg.svg2png(url='svg/app-icon.svg', write_to='ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png', output_width=1024, output_height=1024)"
```

**Option C: Use `qlmanage` (macOS built-in, always available)**
```bash
qlmanage -t -s 1024 -o /tmp/ svg/app-icon.svg && cp /tmp/app-icon.svg.png ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png
```

**Option D: Use `convert` from ImageMagick (if available)**
```bash
convert -background none -density 300 -resize 1024x1024 svg/app-icon.svg ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png
```

**Option E: Use `python3` with `Pillow` and `cairosvg`**
```bash
pip3 install cairosvg 2>/dev/null; python3 -c "import cairosvg; cairosvg.svg2png(url='svg/app-icon.svg', write_to='ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png', output_width=1024, output_height=1024)"
```

**Option F: If no SVG-to-PNG converter is available**, create a programmatic PNG using Python's built-in modules. Write a Python script that:
1. Creates a 1024x1024 image filled with `#1a1a2e`
2. Draws a simplified brain shape using basic ellipses and circles for the neuron dots
3. Saves as PNG

```python
#!/usr/bin/env python3
"""Generate app icon PNG when no SVG converter is available."""
import struct
import zlib
import os

WIDTH = HEIGHT = 1024

def make_png(width, height, pixels):
    """Create a minimal PNG from raw RGBA pixel data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter none
        raw += pixels[y * width * 4:(y + 1) * width * 4]
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def hex_to_rgba(h, a=255):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)

def dist(x1, y1, x2, y2):
    return ((x1-x2)**2 + (y1-y2)**2) ** 0.5

bg = hex_to_rgba('#1a1a2e')
surface = hex_to_rgba('#16213e')
border_c = hex_to_rgba('#2a3a5c')
blue = hex_to_rgba('#3b82f6', 217)
purple = hex_to_rgba('#8b5cf6', 217)
amber = hex_to_rgba('#f59e0b', 217)
red = hex_to_rgba('#ef4444', 217)

pixels = bytearray(WIDTH * HEIGHT * 4)

# Fill background
for i in range(WIDTH * HEIGHT):
    pixels[i*4:i*4+4] = bytes(bg)

# Draw brain shape (simplified: large ellipse for main body + two top lobes + two side lobes)
def in_ellipse(px, py, cx, cy, rx, ry):
    return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1.0

def blend(base, overlay):
    a = overlay[3] / 255.0
    return (
        int(base[0] * (1 - a) + overlay[0] * a),
        int(base[1] * (1 - a) + overlay[1] * a),
        int(base[2] * (1 - a) + overlay[2] * a),
        255
    )

def set_pixel(x, y, color):
    if 0 <= x < WIDTH and 0 <= y < HEIGHT:
        idx = (y * WIDTH + x) * 4
        existing = tuple(pixels[idx:idx+4])
        blended = blend(existing, color)
        pixels[idx:idx+4] = bytes(blended)

def fill_ellipse(cx, cy, rx, ry, color):
    for y in range(max(0, int(cy - ry) - 1), min(HEIGHT, int(cy + ry) + 2)):
        for x in range(max(0, int(cx - rx) - 1), min(WIDTH, int(cx + rx) + 2)):
            if in_ellipse(x, y, cx, cy, rx, ry):
                set_pixel(x, y, color)

def fill_circle(cx, cy, r, color):
    fill_ellipse(cx, cy, r, r, color)

def stroke_ellipse(cx, cy, rx, ry, color, width=3):
    for y in range(max(0, int(cy - ry) - width - 1), min(HEIGHT, int(cy + ry) + width + 2)):
        for x in range(max(0, int(cx - rx) - width - 1), min(WIDTH, int(cx + rx) + width + 2)):
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if abs(d - 1.0) < width / min(rx, ry):
                set_pixel(x, y, color)

# Main brain body
fill_ellipse(512, 500, 250, 300, surface)
stroke_ellipse(512, 500, 250, 300, border_c, 4)

# Left optic lobe
fill_ellipse(220, 440, 110, 80, surface)
stroke_ellipse(220, 440, 110, 80, border_c, 3)

# Right optic lobe
fill_ellipse(804, 440, 110, 80, surface)
stroke_ellipse(804, 440, 110, 80, border_c, 3)

# Left mushroom body lobe
fill_ellipse(410, 270, 85, 65, surface)
stroke_ellipse(410, 270, 85, 65, border_c, 3)

# Right mushroom body lobe
fill_ellipse(614, 270, 85, 65, surface)
stroke_ellipse(614, 270, 85, 65, border_c, 3)

# Neuron dots
# Sensory (blue)
for cx, cy, r in [(230, 445, 12), (380, 380, 10), (794, 445, 12), (644, 380, 10)]:
    fill_circle(cx, cy, r, blue)

# Central (purple)
for cx, cy, r in [(420, 340, 11), (604, 340, 11), (480, 430, 10), (544, 430, 10)]:
    fill_circle(cx, cy, r, purple)

# Drives (amber)
for cx, cy, r in [(512, 410, 12), (512, 570, 11)]:
    fill_circle(cx, cy, r, amber)

# Motor (red)
for cx, cy, r in [(480, 720, 11), (544, 720, 11), (512, 660, 10)]:
    fill_circle(cx, cy, r, red)

png_data = make_png(WIDTH, HEIGHT, bytes(pixels))
os.makedirs('ios/FlyBrain/Assets.xcassets/AppIcon.appiconset', exist_ok=True)
with open('ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png', 'wb') as f:
    f.write(png_data)

print("Generated app-icon-1024.png")
```

**Attempt order**: Try Option A, then C, then D, then E. If all fail, use Option F (the Python fallback -- it always works with no dependencies). Verify the output file exists and is a valid PNG (file size > 1000 bytes).

### 5. CREATE `ios/FlyBrain/Assets.xcassets/LaunchBG.colorset/Contents.json`
- operation: CREATE
- reason: Color set referenced by Info.plist UILaunchScreen.UIColorName for the launch screen background

#### Content (exact JSON)

The color must match `--bg: #1a1a2e` (RGB: 26, 26, 46 -> 0.102, 0.102, 0.180):

```json
{
  "colors" : [
    {
      "color" : {
        "color-space" : "srgb",
        "components" : {
          "alpha" : "1.000",
          "blue" : "0.180",
          "green" : "0.102",
          "red" : "0.102"
        }
      },
      "idiom" : "universal"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

### 6. MODIFY `ios/FlyBrain/Info.plist`
- operation: MODIFY
- reason: Add launch screen image reference to show app icon during launch, and add ITSAppUsesNonExemptEncryption=false for App Store compliance
- anchor: `<key>UILaunchScreen</key>`

#### Changes

Replace the entire `UILaunchScreen` dict block (lines 19-23) with a richer configuration that shows the app icon centered on the launch background:

**Old (lines 19-23):**
```xml
    <key>UILaunchScreen</key>
    <dict>
        <key>UIColorName</key>
        <string>LaunchBG</string>
    </dict>
```

**New:**
```xml
    <key>UILaunchScreen</key>
    <dict>
        <key>UIColorName</key>
        <string>LaunchBG</string>
        <key>UIImageName</key>
        <string>AppIcon</string>
        <key>UIImageRespectsSafeAreaInsets</key>
        <false/>
    </dict>
    <key>ITSAppUsesNonExemptEncryption</key>
    <false/>
```

Note: `UILaunchScreen` dict with `UIImageName` displays the named image centered on the background color. This provides the launch screen with the app icon centered on the dark background. The `ITSAppUsesNonExemptEncryption = false` avoids the export compliance question during App Store submission (the app has no encryption).

IMPORTANT: Do NOT use a LaunchScreen.storyboard. The Info.plist `UILaunchScreen` dictionary approach is the modern replacement and is already partially configured. A storyboard would conflict with it.

### 7. MODIFY `ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/Contents.json`
- operation: MODIFY (only if needed -- this is a conditional step)
- reason: If the build fails because Xcode cannot find the icon, verify the Contents.json matches exactly what was written in step 3.
- anchor: `"filename" : "app-icon-1024.png"`

No changes expected -- this is a validation checkpoint. If the icon PNG was generated correctly in step 4, the asset catalog should resolve.

### 8. MODIFY `ios/project.yml`
- operation: MODIFY
- reason: Add Assets.xcassets to the sources so XcodeGen includes the asset catalog in the project
- anchor: `sources:`

The current sources section:
```yaml
    sources:
      - path: FlyBrain
        type: group
```

This already includes the entire `FlyBrain/` directory as a group, which should automatically pick up `Assets.xcassets` since it is inside `FlyBrain/`. No change needed UNLESS the build fails to find the asset catalog.

**However**, verify that the `.pbxproj` includes a Resources build phase for the asset catalog. The current `.pbxproj` has no `PBXResourcesBuildPhase` section -- it only has Sources and Copy Web Assets (shell script). This means the asset catalog will NOT be compiled.

Add a `PBXResourcesBuildPhase` by updating `project.yml` to explicitly include Assets.xcassets as a resource:

**Old:**
```yaml
    sources:
      - path: FlyBrain
        type: group
```

**New:**
```yaml
    sources:
      - path: FlyBrain
        type: group
        excludes:
          - "Assets.xcassets"
      - path: FlyBrain/Assets.xcassets
        type: folder
        buildPhase: resources
```

Wait -- XcodeGen with `type: group` should automatically handle `.xcassets` as resources. The issue is the hand-maintained `.pbxproj` not having a resources build phase. Since `project.yml` exists and XcodeGen was used to generate the project, the builder should re-run XcodeGen after adding the assets to regenerate the `.pbxproj` with proper build phases.

**Revised approach**: Do NOT manually edit `.pbxproj`. Instead, after creating all asset files, run `xcodegen generate` from the `ios/` directory to regenerate `.pbxproj`. This will automatically add the Assets.xcassets to a Resources build phase.

### 9. MODIFY `ios/FlyBrain.xcodeproj/project.pbxproj` (via XcodeGen regeneration)
- operation: MODIFY (automatic -- via running `xcodegen generate`)
- reason: The current .pbxproj has no PBXResourcesBuildPhase, so Assets.xcassets won't be compiled into the app bundle. Regenerating from project.yml with the new asset catalog in place will add the proper build phases.
- anchor: N/A (regenerated entirely)

#### Steps
1. Check if `xcodegen` is installed: `which xcodegen`
2. If available: `cd ios && xcodegen generate`
3. If NOT available: manually add these sections to `project.pbxproj`:

**Manual .pbxproj edits (only if xcodegen is unavailable):**

Add to `PBXFileReference section`:
```
		AA000001000000000000001 /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
```

Add `AA000001000000000000001 /* Assets.xcassets */,` to the FlyBrain group children (after `91A09BBBE9C48B988915F03D /* Info.plist */,`):
```
			B8EEAB892B081557566A14BB /* FlyBrain */ = {
				isa = PBXGroup;
				children = (
					AA000001000000000000001 /* Assets.xcassets */,
					9E8070875B6BC05A09AB1F20 /* ContentView.swift */,
					A948A5CD778FD0FDC1CFC702 /* FlyBrainApp.swift */,
					91A09BBBE9C48B988915F03D /* Info.plist */,
				);
```

Add a new `PBXResourcesBuildPhase section` before `PBXShellScriptBuildPhase`:
```
/* Begin PBXResourcesBuildPhase section */
		AA000002000000000000001 /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				AA000003000000000000001 /* Assets.xcassets in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */
```

Add a PBXBuildFile entry:
```
		AA000003000000000000001 /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = AA000001000000000000001 /* Assets.xcassets */; };
```

Add `AA000002000000000000001 /* Resources */,` to the target's buildPhases array, BEFORE the Sources phase:
```
			buildPhases = (
				AA000002000000000000001 /* Resources */,
				53BE5A6DDB27A8C541627024 /* Sources */,
				BEE1DBE999BF872436D030FB /* Copy Web Assets */,
			);
```

### 10. CREATE `metadata/appstore.md`
- operation: CREATE
- reason: App Store submission reference document with description, keywords, and screenshots checklist

#### Content (exact markdown)

```markdown
# FlyBrain - App Store Metadata

## App Name
FlyBrain

## Subtitle (30 chars max)
Virtual Fruit Fly Brain Sim

## Category
Education

## Price
Free

## Description

FlyBrain is an interactive simulation of a fruit fly (Drosophila melanogaster) driven by a simplified connectome of 139,000 neurons. Watch a virtual fly respond to stimuli with biologically plausible behaviors that emerge from real neural signal propagation -- not scripted animations.

Feed it, touch it, blow air on it, or change the light. The fly's internal drives (hunger, fear, fatigue, curiosity) shift its behavior between walking, grooming, feeding, flying, resting, and exploring. Every response is computed by signal flow through weighted neural connections modeled after the FlyWire FAFB connectome.

Features:
- 139,000-neuron connectome running in real time via Web Workers
- Interactive tools: feed, touch, air, light, temperature
- Live neuron firing visualization panel (color-coded by brain region)
- 3D brain view showing the connectome in three dimensions
- Internal drive meters (hunger, fear, fatigue, curiosity)
- Education panel explaining each brain region's role
- Fully offline after install -- no network requests, no tracking, no data collection

Built for neuroscience enthusiasts, students, educators, and anyone curious about how a tiny brain produces complex behavior.

## Keywords (100 chars max)
neuroscience,connectome,drosophila,brain,simulation,fly,biology,education,neurons,interactive

## Privacy Policy URL
N/A (no data collected -- declare "Data Not Collected" in App Store Connect)

## App Store Privacy Details
- Data Not Collected
- No tracking
- No third-party analytics
- No network requests after install

## Screenshots Checklist
- [ ] 6.7" (iPhone 15 Pro Max) -- 1290 x 2796 or 2796 x 1290
  - [ ] Main canvas with fly walking (portrait)
  - [ ] Feeding interaction with food on canvas (portrait)
  - [ ] Neuron panel open showing firing activity (portrait)
  - [ ] 3D brain view (landscape)
  - [ ] Education panel open (portrait)
- [ ] 6.5" (iPhone 14 Plus) -- 1284 x 2778 or 2778 x 1284
  - [ ] Same set as 6.7"
- [ ] 5.5" (iPhone 8 Plus) -- 1242 x 2208 or 2208 x 1242 (optional but recommended)
  - [ ] Same set as 6.7"

## App Review Notes
This app is fully offline. It loads a bundled HTML/JS/CSS simulation in a WKWebView. There are no network requests, no user accounts, no in-app purchases, and no external dependencies. The simulation runs entirely on-device using Web Workers for the neural computation. No camera or microphone access is needed.

## Version
1.0.0

## Copyright
2026 snedea

## Support URL
https://github.com/snedea/homelab/tree/master/flybrain
```

## Verification

### Build verification
```bash
# Check if xcodegen is available and regenerate project
which xcodegen && (cd ios && xcodegen generate) || echo "xcodegen not available -- manual pbxproj edits required"
```

```bash
# Verify asset catalog structure
ls -la ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png
ls -la ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/Contents.json
ls -la ios/FlyBrain/Assets.xcassets/LaunchBG.colorset/Contents.json
ls -la ios/FlyBrain/Assets.xcassets/Contents.json
```

```bash
# Verify PNG is valid (should output "PNG image data, 1024 x 1024")
file ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png
```

```bash
# Verify SVG source exists
file svg/app-icon.svg
```

```bash
# Verify metadata file exists
test -f metadata/appstore.md && echo "OK" || echo "MISSING"
```

```bash
# Verify Info.plist is valid XML
plutil -lint ios/FlyBrain/Info.plist
```

```bash
# Verify the .pbxproj includes Assets.xcassets (either via xcodegen or manual edit)
grep -c "Assets.xcassets" ios/FlyBrain.xcodeproj/project.pbxproj
```

```bash
# Build the project (if Xcode CLI tools are available)
xcodebuild -project ios/FlyBrain.xcodeproj -scheme FlyBrain -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -configuration Debug build 2>&1 | tail -5
```

- build: `xcodebuild -project ios/FlyBrain.xcodeproj -scheme FlyBrain -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -configuration Debug build`
- lint: `plutil -lint ios/FlyBrain/Info.plist`
- test: no existing tests for the iOS shell
- smoke: Verify `app-icon-1024.png` exists and is 1024x1024, verify `metadata/appstore.md` contains "FlyBrain", verify Info.plist contains `ITSAppUsesNonExemptEncryption`

## Constraints

- Do NOT create a `LaunchScreen.storyboard` file. The `UILaunchScreen` dictionary in Info.plist is the modern replacement and is already in use.
- Do NOT modify `ios/FlyBrain/ContentView.swift` or `ios/FlyBrain/FlyBrainApp.swift`.
- Do NOT modify any web files (`css/`, `js/`, `index.html`).
- Do NOT modify SPEC.md, TASKS.md, or CLAUDE.md.
- Do NOT add any third-party dependencies.
- The PNG icon MUST be exactly 1024x1024 pixels. Verify with `file` or `sips -g pixelWidth -g pixelHeight`.
- If xcodegen is available, use it to regenerate `.pbxproj`. If not, manually edit `.pbxproj` as specified in step 9.
- The `metadata/` directory is at the project root (`/Users/name/homelab/flybrain/metadata/`), not inside `ios/`.
- All colors must come from the CSS custom properties listed in the Context section. No arbitrary hex values.
- The app icon SVG uses a gradient, which is intentional and acceptable (it is for the icon, not a UI surface background -- the known pattern about no gradients applies to UI backgrounds/cards only).
