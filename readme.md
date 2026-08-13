# FlyBrain

Interactive browser simulation of the *Drosophila melanogaster* (fruit fly) brain. 139,255 neurons and 2.7M connections from the [FlyWire FAFB v783](https://codex.flywire.ai) connectome run in real time via a leaky integrate-and-fire model in a Web Worker.

The fly is not scripted. Behavior emerges from signal propagation through weighted neural connections: place food and watch it seek, touch it and watch it startle, change the light and watch it navigate.

## Usage

Open `index.html` in a browser (or visit the hosted version). The fly loads the full connectome and begins exploring. The app runs in observer mode: Claude is the caretaker (feeding, light, temperature), the fly's agent handles its Workday paperwork, and you watch. The **Learn** button (shown automatically on first visit) explains the whole setup; **Brain 3D** and the Brain Guide explore the anatomy.

The bottom panel shows all 139K neurons firing in real time (WebGL), grouped by region: Sensory, Central, Drives, Motor.

## Fly @ Work (Workday integration)

The fly has a job, but no keyboard -- its only language is behavior. An agent
watches the fly through its state stream, interprets behavior as
communication, and files real Workday actions on its behalf via native
Workday MCP tools: hungry with no food means a meal voucher request,
exhausted means a PTO request for tomorrow, high curiosity becomes a career
goal, contented feeding sends kudos to the enclosure support team, and a fear
spike files a workplace safety concern. A few seconds after each request, Claude plays the
fly's HR Partner and reviews it: usually approved with a real effect where one
fits (an approved meal voucher drops food in front of the fly; approved PTO
dims the lights), occasionally denied with a reason.

Watch the observed/filed/resolved chain land in the sidebar's **Inbox** tab,
each entry labeled by actor (the fly's agent or Claude). Runs in
mock mode by default (no credentials, no network); live mode targets a real
tenant through the Workday Agent Gateway. Setup, intent thresholds, and API
details: [docs/WORKDAY.md](docs/WORKDAY.md).

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
