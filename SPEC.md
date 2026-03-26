# FlyBrain - Interactive Virtual Drosophila

A browser-based virtual fruit fly driven by a simplified connectome. Users interact with the fly (feed, touch, blow air, change light) and it responds with biologically-plausible behaviors.

## Origin
Forked from [heyseth/worm-sim](https://github.com/heyseth/worm-sim). Same concept (connectome-driven creature in the browser), different organism.

## Core Concept

A 2D fly lives on a canvas. It has internal drives (hunger, fear, fatigue, curiosity) that change over time. Users interact with it through a toolbar of actions. The fly's "brain" -- a simplified Drosophila connectome (~50-80 functional neuron groups) -- processes sensory input and produces behavioral output.

The fly is not scripted. Its behavior emerges from signal propagation through weighted neural connections, just like the original worm-sim, but with fly-appropriate circuits and behaviors.

## Interactions

| Action | Input Method | Sensory Pathway | Fly Response |
|--------|-------------|-----------------|-------------|
| **Feed** | Click food tool, then click near fly | Gustatory neurons (GR) | Proboscis extension, feeding, satiation |
| **Touch** | Click touch tool, then click on fly body | Mechanosensory neurons (bristle) | Startle, groom, or flee depending on location + stress |
| **Blow air** | Click air tool, then click/drag near fly | Wind-sensing neurons (JO, arista) | Brace, orient, or take off |
| **Light** | Toggle light level (bright/dim/dark) | Photoreceptor neurons (R1-R8) | Phototaxis (move toward light), or settle in dark |
| **Offer mate** | Click mate tool (stretch goal) | Olfactory neurons (OR) | Courtship or avoidance depending on state |
| **Do nothing** | Wait | Internal clock | Idle behaviors: grooming, exploring, resting |

## Fly Body

Top-down 2D view:
- Elliptical body (thorax + abdomen)
- Head with compound eyes (2 red ovals)
- 6 legs (3 pairs, articulated)
- 2 wings (folded at rest, spread when flying)
- Proboscis (retracted, extends when feeding)
- Antennae (2, on head)

Rendered as canvas paths or SVG overlay. Body parts animate independently based on current behavior.

## Brain Architecture

### Functional Regions (~50-80 neuron groups)

Abstracted from the FlyWire connectome into functional clusters:

**Sensory (input)**
- Visual: R1-R6 (motion), R7-R8 (color), lobula plate (direction-selective)
- Olfactory: ORN (odor receptor neurons), projection neurons
- Gustatory: GRN (sugar, bitter, water)
- Mechanosensory: bristle neurons (touch), Johnston's organ (wind/gravity), chordotonal (proprioception)

**Central Processing**
- Mushroom body: learning, memory, context
- Central complex: navigation, orientation, locomotion coordination
- Lateral horn: innate odor responses
- SEZ (subesophageal zone): feeding command center

**Motor (output)**
- Leg motor neurons (6 legs, walk CPG)
- Wing motor neurons (flight muscles)
- Proboscis motor neurons (feeding)
- Head/neck motor neurons (orientation)
- Abdominal motor neurons (grooming)

### Signal Flow
```
User Interaction -> Sensory Neurons -> Central Processing -> Motor Neurons -> Behavior
                                            ^
                                            |
                                    Internal Drives (hunger, fear, fatigue)
```

### Internal Drives
Each drive is a float 0.0-1.0 that changes over time:
- **Hunger**: increases steadily (~0.01/sec), decreases when fed, modulates food-seeking
- **Fear**: spikes on touch/air, decays over ~10s, modulates startle threshold
- **Fatigue**: increases with activity, decreases at rest, modulates movement speed
- **Curiosity**: fluctuates randomly, modulates exploration vs. staying put

Drives bias the central processing neurons, shifting which motor outputs win.

## Behaviors

Each behavior is a state with entry conditions, animations, and exit conditions:

| Behavior | Trigger | Animation | Duration |
|----------|---------|-----------|----------|
| **Walk** | Default when curious + not tired | Legs alternate in tripod gait | Continuous |
| **Groom** | After touch, or periodic (idle) | Legs rub head/body, specific to touched area | 2-5s |
| **Feed** | Food nearby + hungry | Proboscis extends, body lowers | Until sated or food removed |
| **Startle** | Sudden touch or air blast | Freeze 200ms, then jump/fly away | 0.5-2s |
| **Fly** | High fear, or strong air stimulus | Wings spread, lift off, relocate | 1-3s |
| **Rest** | High fatigue | Wings fold tight, legs tuck, minimal movement | 5-15s |
| **Explore** | Moderate curiosity, low fear | Slow walk with direction changes, antenna movement | Continuous |
| **Phototaxis** | Light gradient detected | Walk toward brighter area | Until in bright zone |

## UI Layout

```
+----------------------------------------------------------+
|  [Feed] [Touch] [Air] [Light] [?]      FlyBrain v0.1    |
+----------------------------------------------------------+
|                                                          |
|                                                          |
|                    [fly on canvas]                        |
|                                                          |
|                                                          |
+----------------------------------------------------------+
|  Connectome: [ooo ooo ooo ooo ooo ooo]   |  Hunger: === |
|  [toggle]                                 |  Fear:   =   |
|                                           |  Fatigue:==  |
+----------------------------------------------------------+
```

- Top toolbar: interaction tools (click to select, then click on canvas to use)
- Center: full-width canvas with the fly
- Bottom left: connectome visualization (colored dots by region)
- Bottom right: drive meters (hunger, fear, fatigue, curiosity)

## Tech Stack
- Vanilla JS (keeping it simple, no build step, same as worm-sim)
- HTML5 Canvas for fly body + environment
- CSS for UI chrome
- No backend, no dependencies

## Stretch Goals (not in v0.1)
- Multiple flies with social behavior
- Learning: fly remembers where food was
- Sound: wing buzz, feeding sounds
- Mobile touch support
- Connectome editor: adjust weights in real-time
- Export/import fly "personality" (weight presets)
