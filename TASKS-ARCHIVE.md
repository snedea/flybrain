# Archived Tasks


## Phase 1: Foundation

- [x] T1.1: Replace worm body with fly body rendering -- draw a top-down 2D fly (elliptical body, head with compound eyes, 6 articulated legs, 2 wings, proboscis, antennae) on canvas using path drawing. Implement basic idle animation (subtle leg/antenna micro-movements). Replace the IK chain with a fly body structure that can animate individual parts independently. Keep the existing BRAIN object wired up so the fly moves around the canvas using the current C. elegans connectome as a placeholder brain. [SPID:fast]
- [x] T1.2: Replace C. elegans connectome with Drosophila functional circuits -- design ~50-80 functional neuron groups based on real Drosophila brain regions (visual, olfactory, gustatory, mechanosensory, mushroom body, central complex, SEZ, motor neurons). Create new weights in constants.js. Rewire connectome.js: replace sensory stimulation flags with multi-channel input, replace left/right motor accumulators with multi-behavior accumulators (walk, groom, feed, fly, startle). Add internal drive system (hunger, fear, fatigue, curiosity) as biasing inputs to central processing neurons.
- [x] T1.3: Build interaction toolbar and wire user inputs to sensory neurons -- add top toolbar with tool buttons (Feed, Touch, Air, Light). Implement tool selection + canvas click/drag handlers. Map each interaction to the appropriate sensory neuron group stimulation. Add bottom panel with connectome visualization (colored by region: sensory=blue, central=purple, motor=red) and drive meters (hunger, fear, fatigue bars). Update index.html and main.css. [SPI-]

## Phase 2: Behavioral Polish

- [x] T2.1: Implement full behavioral state machine with animations -- create behavior states (walk, groom, feed, startle, fly, rest, explore, phototaxis) with entry/exit conditions driven by motor neuron accumulator outputs. Animate each behavior: tripod gait walking, grooming leg movements, proboscis extension for feeding, wing spread for flight, freeze-then-flee for startle. Add transitions between behaviors with appropriate blending. Tune connectome weights so behaviors emerge naturally from the neural simulation rather than being hardcoded. [SPI-]
