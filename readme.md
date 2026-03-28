# FlyBrain

Interactive browser simulation of the *Drosophila melanogaster* (fruit fly) brain. 139,255 neurons and 2.7M connections from the [FlyWire FAFB v783](https://codex.flywire.ai) connectome run in real time via a leaky integrate-and-fire model in a Web Worker.

The fly is not scripted. Behavior emerges from signal propagation through weighted neural connections: place food and watch it seek, touch it and watch it startle, change the light and watch it navigate.

## Usage

Open `index.html` in a browser (or visit the hosted version). The fly loads the full connectome and begins exploring. Use the toolbar to interact:

- **Feed** -- click to place food. The fly seeks and eats it when hungry.
- **Touch** -- click on the fly. Head, thorax, abdomen, and legs trigger different responses.
- **Air** -- click and drag near the fly to blow wind.
- **Light** -- cycle through Bright, Dim, Dark. The fly exhibits phototaxis.
- **Temp** -- cycle through Neutral, Warm, Cool.

The bottom panel shows all 139K neurons firing in real time (WebGL), grouped by region: Sensory, Central, Drives, Motor.

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
