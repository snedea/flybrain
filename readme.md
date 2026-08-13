# FlyBrain

Interactive browser simulation of the *Drosophila melanogaster* (fruit fly) brain. 139,255 neurons and 2.7M connections from the [FlyWire FAFB v783](https://codex.flywire.ai) connectome run in real time via a leaky integrate-and-fire model in a Web Worker.

The fly is not scripted. Behavior emerges from signal propagation through
weighted neural connections -- and the fly holds down a job in Workday while
doing it. Built by the Kainos Workday AI CoE, with Claude Code.

## The cast

- **The fly** -- 139,255 real neurons deciding everything. It cannot type or
  talk; its only language is behavior.
- **Buzz** -- an ambient agent. Nobody prompts it; it listens to the fly's
  state stream once per second and, when a signal crosses a threshold, files
  a Workday request on the fly's behalf.
- **Claude** -- two roles: the caretaker tending the enclosure (feeding,
  light, temperature) and the fly's HR Partner in Workday, reviewing
  everything Buzz files. Approvals have real consequences; denials happen.
- **You** -- an observer who can disturb. Tap near the fly to stir the air
  (closer is louder); tap the fly and it startles, bolts, and settles, per
  its own wiring. Every tap shows a red ripple. Buzz may file a workplace
  safety concern about you.

## Using it

Visit [flybrain.app](https://flybrain.app) (or serve `index.html` locally).
The page runs in observer mode: there are no feeding or environment controls
for visitors -- Claude runs the enclosure. What you see:

- **Inbox** (left panel) -- the fly's Workday paper trail: requests filed by
  Buzz and rulings by Claude, with live counts per request type on top.
  Hover a tool name in any entry for the actual API endpoint, request body,
  and result.
- **Status corner** (bottom right) -- who is acting right now: "Buzz:
  observing", "Claude: delivering food", and so on.
- **Connectome strip** (bottom) -- all 139K neurons firing live (WebGL),
  grouped Sensory / Central / Drives / Motor.
- **Learn** -- click the FlyBrain wordmark (auto-opens on first visit) for
  the full story.

On the public site everything, including Buzz and Claude's rulings, runs in
your browser with no backend; each visitor gets their own fly, and a refresh
starts a fresh one. The local install adds a caretaker server (SQLite
history, a Claude-driven caretaker loop, and a Chat tab) -- see
[docs/WORKDAY.md](docs/WORKDAY.md).

## Fly @ Work (Workday integration)

The intent map: hunger with no food becomes a meal voucher request
(Compensation API), exhaustion becomes a PTO request for tomorrow (Absence
Management), high curiosity while exploring becomes a career goal
(Performance Enablement), contented feeding sends kudos to the enclosure
support team, and a fear spike files a workplace safety concern. Requests
carry the observed drive readings that triggered them; a few seconds later
Claude rules on each one, approving about 85% (an approved voucher drops
food in front of the fly; approved PTO dims the lights) and denying the
rest with a reason. Cooldowns per intent keep the fly from spamming HR.

The public demo simulates the Workday calls end to end; pointed at a real
tenant, the same code files real paperwork through the Workday Agent
Gateway. Setup, thresholds, deployment options, and API details:
[docs/WORKDAY.md](docs/WORKDAY.md).

## Data Source

Connectome data from the FlyWire Whole-Brain Connectome:

> Dorkenwald, S., Matsliah, A., Sterling, A.R. *et al.* Neuronal wiring diagram of an adult brain. *Nature* **634**, 124--138 (2024). https://doi.org/10.1038/s41586-024-07558-y

The binary connectome file (`data/neuron_meta.bin.gz`) is derived from the [FlyWire Codex](https://codex.flywire.ai) public dataset (FAFB v783). Neurons are classified into functional groups (sensory, central, drives, motor) based on FlyWire cell type annotations.

## Origin

Forked from [heyseth/worm-sim](https://github.com/heyseth/worm-sim), which simulated the 302-neuron *C. elegans* connectome in the browser. FlyBrain replaces the worm with a fruit fly and scales from 302 neurons to 139,255.

## License

MIT License -- see [license.md](license.md) for details.

## Acknowledgments

- **FlyWire Consortium** -- for mapping the complete adult *Drosophila* brain connectome and making the data publicly available.
- **Timothy Busbice, Gabriel Garrett, Geoffrey Churchill** and contributors to the [GoPiGo Connectome](https://github.com/Connectome/GoPiGo) -- original connectome-driven robot concept.
- **[Zach Rispoli](https://github.com/zrispo)** -- porting the *C. elegans* connectome to JavaScript.
- **[Seth Miller](https://github.com/heyseth)** -- creating worm-sim, the browser simulation this project is forked from.
