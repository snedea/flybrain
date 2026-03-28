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
