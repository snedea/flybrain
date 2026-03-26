/* Drosophila melanogaster Functional Connectome
 * Simplified from FlyWire connectome data into ~70 functional neuron groups.
 *
 * Neuron naming convention:
 *   Sensory:  VIS_*, OLF_*, GUS_*, MECH_*, THERMO
 *   Central:  MB_*, LH_*, CX_*, SEZ_*, DN_*, GNG_*, ANTENNAL_*
 *   Drives:   DRIVE_*
 *   Motor:    MN_*
 *
 * Weight magnitudes:
 *   Strong excitatory:   8-15  (escape, startle)
 *   Moderate excitatory: 4-7   (standard pathways)
 *   Weak excitatory:     1-3   (modulatory, background)
 *   Inhibitory:          -3 to -10
 *
 * Based on: Dorkenwald et al. 2024, FlyWire whole-brain connectome;
 * Hulse et al. 2021, central complex; Aso et al. 2014, mushroom body.
 */

var weights = {

	// ============================================================
	// SENSORY INPUT NEURONS
	// ============================================================

	// --- Visual ---

	// R1-R6 motion-detecting photoreceptors (outer photoreceptors)
	VIS_R1R6: {
		VIS_ME: 8,           // primary target: medulla
		VIS_LPTC: 4,        // direct optic flow path
		DRIVE_CURIOSITY: 2, // visual novelty
	},

	// R7/R8 color photoreceptors (inner photoreceptors)
	VIS_R7R8: {
		VIS_ME: 6,           // medulla processing
		LH_APP: 4,          // innate color attraction (UV, blue-green)
		MB_KC: 3,           // learned color associations
	},

	// Medulla (intermediate visual processing, columnar neurons)
	VIS_ME: {
		VIS_LO: 7,          // forward to lobula for pattern recognition
		VIS_LPTC: 6,        // motion -> optic flow
		VIS_LC: 5,          // looming detection layer
		CX_EPG: 3,          // visual heading input
	},

	// Lobula (visual pattern recognition, object detection)
	VIS_LO: {
		VIS_LC: 5,          // object -> looming channel
		MB_KC: 4,           // visual learning via mushroom body
		CX_EPG: 3,          // visual landmarks for compass
		LH_APP: 2,          // some innate visual attraction
	},

	// Lobula columnar neurons (looming / collision detection)
	VIS_LC: {
		DN_STARTLE: 12,     // strong: looming triggers escape
		DRIVE_FEAR: 6,      // looming elevates fear
		DN_FLIGHT: 5,       // triggers flight initiation
		GNG_DESC: 3,        // general alert
	},

	// Lobula plate tangential cells (optic flow / self-motion estimation)
	VIS_LPTC: {
		CX_EPG: 6,          // updates heading estimate
		CX_HDELTA: 5,       // heading correction from optic flow
		CX_PFN: 4,          // path integration input
		DN_TURN: 3,         // compensatory turning
	},

	// --- Olfactory ---

	// Olfactory receptor neurons -- food odors
	OLF_ORN_FOOD: {
		OLF_PN: 10,         // strong projection to PN
		OLF_LN: 5,          // lateral interneurons for contrast
		MB_KC: 2,           // weak direct-to-KC path
	},

	// Olfactory receptor neurons -- danger/noxious odors (NOTE: weights defined but no user interaction currently sets dangerOdor stimulus)
	OLF_ORN_DANGER: {
		OLF_PN: 10,         // strong projection to PN
		OLF_LN: 5,          // lateral interneurons for contrast
		DRIVE_FEAR: 3,      // noxious odor raises fear
	},

	// Olfactory local interneurons (lateral inhibition in antennal lobe)
	OLF_LN: {
		OLF_PN: 4,           // sharpened odor signal to projection neurons
		OLF_ORN_FOOD: -2,    // lateral inhibition (contrast enhancement)
		OLF_ORN_DANGER: -2,  // lateral inhibition
	},

	// Olfactory projection neurons (relay from antenna lobe to MB and LH)
	OLF_PN: {
		MB_KC: 8,           // primary input to mushroom body
		LH_APP: 5,          // innate appetitive pathway
		LH_AV: 5,           // innate aversive pathway
	},

	// --- Gustatory ---

	// Sweet taste receptors
	GUS_GRN_SWEET: {
		SEZ_FEED: 10,       // strong: sugar triggers feeding
		MB_DAN_REW: 7,      // reward signal to mushroom body
		MB_MBON_APP: 4,     // reinforces appetitive memory
		DRIVE_HUNGER: -5,   // eating reduces hunger signal
	},

	// Bitter taste receptors (NOTE: weights defined but not yet wired to any user interaction)
	GUS_GRN_BITTER: {
		SEZ_FEED: -8,       // suppress feeding
		MB_DAN_PUN: 7,      // punishment signal
		DRIVE_FEAR: 4,      // bitter triggers mild alarm
		MB_MBON_AV: 5,      // aversive memory formation
		LH_AV: 4,           // innate aversion
	},

	// Water taste receptors (NOTE: weights defined but not yet wired to any user interaction)
	GUS_GRN_WATER: {
		SEZ_WATER: 8,       // primary water-drinking trigger
		SEZ_FEED: 3,        // some overlap with feeding
		MB_DAN_REW: 3,      // mild reward
	},

	// --- Mechanosensory ---

	// Bristle neurons (touch)
	MECH_BRISTLE: {
		SEZ_GROOM: 6,       // touch triggers grooming
		DRIVE_GROOM: 4,     // raises grooming urge
		DRIVE_FEAR: 5,      // touch startles
		DN_STARTLE: 7,      // strong touch triggers startle
		GNG_DESC: 3,        // general arousal
		ANTENNAL_MECH: 2,   // some cross-talk
	},

	// Johnston's organ (wind, gravity, sound via antennae)
	MECH_JO: {
		ANTENNAL_MECH: 10,  // primary target
		CX_HDELTA: 4,       // wind direction -> heading change
		DN_STARTLE: 3,      // wind can startle
		DRIVE_FEAR: 2,      // moderate wind raises alertness
	},

	// Chordotonal organs (proprioception, body position)
	MECH_CHORD: {
		CX_PFN: 5,          // path integration (proprioceptive feedback)
		CX_FC: 3,           // locomotion coordination
		DN_WALK: 2,         // walking feedback loop
	},

	// --- Thermosensory ---

	// Warm-sensing thermosensory neurons (activated by high temperature)
	THERMO_WARM: {
		CX_HDELTA: 4,       // orient away from heat
		LH_AV: 3,           // innate avoidance of warmth
		DRIVE_FEAR: 2,      // heat aversion
		THERMO_COOL: -2,    // mutual inhibition
	},

	// Cool-sensing thermosensory neurons (activated by low temperature)
	THERMO_COOL: {
		CX_HDELTA: 3,       // orient toward warmth
		LH_APP: 2,          // cool-seeking can be appetitive
		DRIVE_CURIOSITY: 2, // moderate cool promotes exploration
		THERMO_WARM: -2,    // mutual inhibition
	},

	// Nociceptive neurons (pain/tissue damage, multimodal)
	NOCI: {
		DN_STARTLE: 10,     // pain triggers escape
		DRIVE_FEAR: 8,      // pain strongly elevates fear
		DN_FLIGHT: 6,       // pain promotes flight
		SEZ_GROOM: 4,       // pain can trigger grooming (wound cleaning)
		SEZ_FEED: -5,       // pain suppresses feeding
	},


	// ============================================================
	// CENTRAL PROCESSING NEURONS
	// ============================================================

	// --- Mushroom Body (learning and memory) ---

	// Kenyon cells (sparse odor code)
	MB_KC: {
		MB_MBON_APP: 6,     // appetitive output
		MB_MBON_AV: 6,      // aversive output
		MB_APL: 4,          // feedback to inhibitory neuron (sparse coding)
	},

	// MB output neurons -- appetitive/approach
	MB_MBON_APP: {
		LH_APP: 5,          // reinforces approach
		SEZ_FEED: 4,        // learned food association -> feeding
		DN_WALK: 3,         // approach behavior
		CX_FC: 3,           // locomotion toward target
		MB_MBON_AV: -4,     // mutual inhibition with aversive
	},

	// MB output neurons -- aversive/avoidance
	MB_MBON_AV: {
		LH_AV: 5,           // reinforces avoidance
		DRIVE_FEAR: 4,      // learned danger raises fear
		DN_STARTLE: 3,      // triggers avoidance
		MB_MBON_APP: -4,    // mutual inhibition with appetitive
		SEZ_FEED: -3,       // suppress feeding for aversive stimuli
	},

	// Anterior paired lateral neuron (global inhibition in mushroom body)
	MB_APL: {
		MB_KC: -5,           // sparse coding: suppresses weakly active KCs
		MB_MBON_APP: -2,     // slight inhibition of output
		MB_MBON_AV: -2,      // slight inhibition of output
	},

	// Dopaminergic reward neurons
	MB_DAN_REW: {
		MB_MBON_APP: 7,     // strengthen appetitive output
		MB_KC: 3,           // reward-gated plasticity
		DRIVE_CURIOSITY: 2, // reward encourages exploration
	},

	// Dopaminergic punishment neurons
	MB_DAN_PUN: {
		MB_MBON_AV: 7,      // strengthen aversive output
		MB_KC: 3,           // punishment-gated plasticity
		DRIVE_FEAR: 3,      // punishment elevates fear
	},

	// --- Lateral Horn (innate odor responses) ---

	// Lateral horn appetitive pathway
	LH_APP: {
		DN_WALK: 6,          // approach: walk toward source
		CX_FC: 4,           // locomotion command
		SEZ_FEED: 3,        // bias toward feeding
		DN_TURN: 3,         // orient toward attractive stimulus
		LH_AV: -3,          // mutual inhibition
	},

	// Lateral horn aversive pathway
	LH_AV: {
		DN_STARTLE: 6,       // avoid: startle/flee
		DRIVE_FEAR: 5,       // raise fear
		DN_FLIGHT: 4,        // trigger flight
		DN_TURN: 4,          // turn away
		LH_APP: -3,          // mutual inhibition
		SEZ_FEED: -5,        // suppress feeding
	},

	// --- Central Complex (navigation, orientation, locomotion) ---

	// Compass neurons (heading representation)
	CX_EPG: {
		CX_PFN: 7,          // heading -> path integration
		CX_FC: 6,           // heading -> locomotion
		CX_HDELTA: 4,       // heading feedback
		CX_EPG: 3,          // recurrent: heading ring attractor
	},

	// Path integration neurons
	CX_PFN: {
		CX_FC: 6,            // path integration -> locomotion command
		CX_EPG: 3,           // feedback to compass
		CX_HDELTA: 3,        // heading correction
	},

	// Fan-shaped body (locomotion command center)
	CX_FC: {
		DN_WALK: 8,          // primary walk command
		DN_TURN: 5,          // turning command
		CX_EPG: 2,           // feedback to compass
		CX_FC: 3,            // recurrent: tonic locomotion activity
		DN_FLIGHT: -2,       // walking suppresses flight
	},

	// Heading change neurons
	CX_HDELTA: {
		CX_EPG: 5,           // update heading
		DN_TURN: 6,          // execute turn
		CX_FC: 3,            // influence locomotion
	},

	// --- Subesophageal Zone (feeding and grooming command) ---

	// Feeding command center
	SEZ_FEED: {
		MN_PROBOSCIS: 14,    // extend proboscis
		MN_HEAD: 4,          // lower head toward food
		DN_WALK: -6,         // suppress walking while feeding
		DN_FLIGHT: -5,       // suppress flight while feeding
		SEZ_GROOM: -4,       // suppress grooming while feeding
		DRIVE_HUNGER: -3,    // feeding reduces hunger
	},

	// Grooming command center
	SEZ_GROOM: {
		MN_LEG_L1: 10,       // front left leg (grooming effector)
		MN_LEG_R1: 10,       // front right leg (grooming effector)
		MN_ABDOMEN: 5,       // abdomen grooming
		MN_HEAD: 4,          // head positioning for grooming
		DN_WALK: -5,          // suppress walking while grooming
		DN_FLIGHT: -4,        // suppress flight while grooming
		SEZ_FEED: -3,         // suppress feeding while grooming
	},

	// --- Antennal mechanosensory center ---

	ANTENNAL_MECH: {
		DN_STARTLE: 5,        // strong wind -> startle
		CX_HDELTA: 4,         // wind orientation
		DRIVE_FEAR: 3,        // wind raises alertness
		DN_TURN: 3,           // orient to wind
	},

	// --- Gnathal ganglia descending neurons ---

	GNG_DESC: {
		DN_WALK: 4,           // general arousal -> walk
		SEZ_FEED: 2,          // arousal can trigger feeding search
		CX_FC: 4,             // locomotion activation
		GNG_DESC: 2,          // recurrent: self-sustaining arousal
	},

	// --- Descending Neurons (brain to VNC commands) ---

	// Walking command
	DN_WALK: {
		VNC_CPG: 8,           // activates central pattern generator
		MN_LEG_L1: 4,        // direct motor activation (supplementing CPG)
		MN_LEG_R1: 4,        // front right
		MN_LEG_L2: 5,        // middle left (primary drivers)
		MN_LEG_R2: 5,        // middle right
		MN_LEG_L3: 3,        // rear left
		MN_LEG_R3: 3,        // rear right
		CX_FC: 2,            // feedback: walking activity sustains locomotion command
		DN_FLIGHT: -3,        // walking suppresses flight
	},

	// Flight initiation
	DN_FLIGHT: {
		MN_WING_L: 10,       // left wing
		MN_WING_R: 10,       // right wing
		MN_LEG_L1: -3,       // suppress leg movement during flight
		MN_LEG_R1: -3,
		MN_LEG_L2: -3,
		MN_LEG_R2: -3,
		MN_LEG_L3: -3,
		MN_LEG_R3: -3,
		DN_WALK: -5,          // flight suppresses walking
	},

	// Turning command
	DN_TURN: {
		MN_LEG_L1: 4,        // asymmetric: more left = turn right
		MN_LEG_L2: 5,
		MN_LEG_L3: 3,
		MN_LEG_R1: -3,       // slow right side
		MN_LEG_R2: -4,
		MN_LEG_R3: -2,
		MN_HEAD: 4,           // head turns
	},

	// Backward walking command
	DN_BACKUP: {
		MN_LEG_L3: 5,         // rear legs push forward (reversed)
		MN_LEG_R3: 5,
		MN_LEG_L2: 3,
		MN_LEG_R2: 3,
		MN_LEG_L1: -2,        // front legs retract
		MN_LEG_R1: -2,
		DN_WALK: -4,           // backward walking suppresses forward walking
	},

	// Startle/escape command
	DN_STARTLE: {
		DN_FLIGHT: 10,        // startle -> flight
		MN_WING_L: 8,         // immediate wing activation
		MN_WING_R: 8,
		MN_LEG_L2: 5,         // jump: middle legs extend
		MN_LEG_R2: 5,
		MN_LEG_L3: 6,         // jump: hind legs extend
		MN_LEG_R3: 6,
		DN_BACKUP: 5,          // startle can trigger backward jump
		DRIVE_FEAR: 4,         // startle raises fear
		DN_WALK: -4,           // suppress normal walking
		SEZ_FEED: -6,          // suppress feeding
		SEZ_GROOM: -5,         // suppress grooming
	},

	// Ventral nerve cord central pattern generator (walking rhythm)
	VNC_CPG: {
		MN_LEG_L1: 3,         // rhythmic activation of all legs
		MN_LEG_R1: 3,
		MN_LEG_L2: 4,         // middle legs slightly stronger (primary drivers)
		MN_LEG_R2: 4,
		MN_LEG_L3: 3,
		MN_LEG_R3: 3,
		VNC_CPG: 2,           // self-sustaining oscillation
	},

	// Circadian clock neurons (pacemaker, modulates activity levels)
	CLOCK_DN: {
		DRIVE_FATIGUE: 2,      // clock influences tiredness
		DRIVE_CURIOSITY: 2,    // clock influences activity
		CX_FC: 2,             // modulates locomotion
		GNG_DESC: 2,          // general arousal modulation
	},

	// Subesophageal zone water intake command
	SEZ_WATER: {
		MN_PROBOSCIS: 6,      // extend proboscis for water
		MN_HEAD: 3,           // lower head
		DN_WALK: -3,           // suppress walking while drinking
		SEZ_FEED: -2,          // mild suppression of food feeding
	},


	// ============================================================
	// INTERNAL DRIVE NEURONS
	// ============================================================

	// Hunger drive
	DRIVE_HUNGER: {
		OLF_PN: 5,            // hunger sensitizes olfactory processing
		LH_APP: 6,            // hunger biases toward appetitive approach
		SEZ_FEED: 4,          // hunger lowers feeding threshold
		MB_MBON_APP: 4,       // hungry fly more responsive to food cues
		DN_WALK: 3,           // hunger motivates locomotion (food search)
		CX_FC: 3,             // hunger activates locomotion center
		DRIVE_CURIOSITY: 3,   // hunger promotes exploration
		DRIVE_FATIGUE: -2,    // hunger opposes rest
	},

	// Fear/threat drive
	DRIVE_FEAR: {
		DN_STARTLE: 5,        // fear lowers startle threshold
		DN_FLIGHT: 4,         // fear promotes flight
		LH_AV: 3,             // fear biases aversive pathway
		SEZ_FEED: -6,         // fear strongly suppresses feeding
		SEZ_GROOM: -4,        // fear suppresses grooming
		DN_WALK: 2,           // fear promotes movement (but not feeding)
		DRIVE_CURIOSITY: -3,  // fear suppresses exploration
		DRIVE_FATIGUE: -2,    // fear overrides tiredness
	},

	// Fatigue drive
	DRIVE_FATIGUE: {
		DN_WALK: -6,           // fatigue suppresses walking
		DN_FLIGHT: -5,         // fatigue suppresses flight
		CX_FC: -4,            // fatigue reduces locomotion commands
		DRIVE_CURIOSITY: -3,  // fatigue reduces exploration
		DN_STARTLE: -2,       // fatigue slightly raises startle threshold
	},

	// Curiosity/exploration drive
	DRIVE_CURIOSITY: {
		CX_FC: 6,             // curiosity promotes locomotion
		DN_WALK: 4,           // curiosity promotes walking
		CX_HDELTA: 5,         // curiosity promotes direction changes
		DN_TURN: 4,           // curiosity promotes turning
		CX_EPG: 3,            // curiosity activates compass
		DRIVE_FATIGUE: 1,     // exploration slightly tiring
	},

	// Grooming urge
	DRIVE_GROOM: {
		SEZ_GROOM: 8,         // grooming drive triggers grooming command
		DN_WALK: -3,           // grooming suppresses walking
		DN_FLIGHT: -2,         // grooming suppresses flight
	},


	// ============================================================
	// MOTOR OUTPUT NEURONS
	// ============================================================
	// Motor neurons are the final output layer. They do NOT project
	// back into the central brain (no re-entrant connections from
	// motor neurons). They only appear as postSynaptic targets.
	// We include empty entries so they appear in the weights object
	// and get initialized in postSynaptic state.

	MN_LEG_L1: {},
	MN_LEG_R1: {},
	MN_LEG_L2: {},
	MN_LEG_R2: {},
	MN_LEG_L3: {},
	MN_LEG_R3: {},
	MN_WING_L: {},
	MN_WING_R: {},
	MN_PROBOSCIS: {},
	MN_HEAD: {},
	MN_ABDOMEN: {},
};
