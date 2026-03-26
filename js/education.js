(function () {
    var EDUCATION_REGIONS = [
        {
            id: 'optic-lobes',
            name: 'Optic Lobes',
            neurons: ['VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC'],
            type: 'sensory',
            explanation: 'The optic lobes are the fly\'s visual processing centers, one on each side of the brain. They detect motion, color, edges, and looming objects. Almost half the fly\'s brain is devoted to vision.',
            analogy: 'Like your visual cortex \u2014 but optimized for detecting fast motion and avoiding swatters.',
            interaction: 'Change the Light setting from Bright to Dim or Dark and watch the optic lobes respond.',
            populationEstimate: '~60,000 neurons in the real fly'
        },
        {
            id: 'antennal-lobes',
            name: 'Antennal Lobes',
            neurons: ['OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN'],
            type: 'sensory',
            explanation: 'The antennal lobes process smells detected by the antennae. Different odors activate different glomeruli (clusters), letting the fly distinguish food from danger.',
            analogy: 'Like your olfactory bulb \u2014 the first stop for smell information before it reaches higher brain areas.',
            interaction: 'Place food on the canvas and watch olfactory neurons fire as the fly detects it.',
            populationEstimate: '~2,600 neurons across ~50 glomeruli'
        },
        {
            id: 'mushroom-bodies',
            name: 'Mushroom Bodies',
            neurons: ['MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN'],
            type: 'central',
            explanation: 'The mushroom bodies are the fly\'s learning and memory center. They associate smells with rewards or punishments, allowing the fly to learn which odors mean food and which mean danger.',
            analogy: 'Like the fly\'s hippocampus \u2014 they form and recall memories about smells.',
            interaction: 'Feed the fly repeatedly and watch the reward dopamine neurons (DAN) activate alongside the Kenyon cells.',
            populationEstimate: '~2,000 Kenyon cells + ~400 output/dopamine neurons'
        },
        {
            id: 'central-complex',
            name: 'Central Complex',
            neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA', 'CLOCK_DN'],
            type: 'central',
            explanation: 'The central complex is the fly\'s navigation hub. It maintains an internal compass, tracks the fly\'s heading, and coordinates locomotion patterns.',
            analogy: 'Like a GPS and steering system combined \u2014 it knows which way the fly is pointing and plans where to go.',
            interaction: 'Watch the compass neurons (EPG) as the fly walks and changes direction.',
            populationEstimate: '~3,000 neurons in the real fly'
        },
        {
            id: 'lateral-horn',
            name: 'Lateral Horn',
            neurons: ['LH_APP', 'LH_AV'],
            type: 'central',
            explanation: 'The lateral horn handles innate (unlearned) responses to odors. Unlike the mushroom bodies which learn, the lateral horn triggers hardwired approach or avoidance behaviors.',
            analogy: 'Like an instinctive reflex \u2014 you pull your hand from a hot stove before you think about it.',
            interaction: 'Place food near the fly and watch LH_APP (approach) activate. The lateral horn responds even without prior learning.',
            populationEstimate: '~1,400 neurons'
        },
        {
            id: 'sez',
            name: 'Subesophageal Zone',
            neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER', 'GNG_DESC'],
            type: 'central',
            explanation: 'The subesophageal zone (SEZ) is the feeding and grooming command center. It processes taste information and sends motor commands to extend the proboscis or initiate grooming.',
            analogy: 'Like a cafeteria manager \u2014 it decides whether to eat based on what the taste buds report.',
            interaction: 'Feed the fly and watch the SEZ light up. Touch the fly to trigger grooming commands.',
            populationEstimate: '~7,000 neurons'
        },
        {
            id: 'vnc-motor',
            name: 'VNC / Motor',
            neurons: ['DN_WALK', 'DN_FLIGHT', 'DN_TURN', 'DN_BACKUP', 'DN_STARTLE', 'VNC_CPG'],
            type: 'motor',
            collectMNPrefix: true,
            explanation: 'The ventral nerve cord (VNC) is the fly\'s spinal cord equivalent. It contains motor neurons that control the legs, wings, proboscis, and abdomen, plus central pattern generators that coordinate rhythmic movements like walking.',
            analogy: 'Like your spinal cord \u2014 it relays commands from the brain to the muscles and coordinates repetitive movements like walking.',
            interaction: 'Watch the motor neurons activate during any behavior \u2014 walking lights up leg motors, flight lights up wing motors.',
            populationEstimate: '~15,000 neurons including motor neurons and interneurons'
        },
        {
            id: 'thermosensory',
            name: 'Thermosensory',
            neurons: ['THERMO_WARM', 'THERMO_COOL'],
            type: 'sensory',
            explanation: 'Thermosensory neurons detect temperature changes. Warm and cool sensors report to the brain so the fly can seek comfortable temperatures.',
            analogy: 'Like the temperature sensors in your skin \u2014 they tell the brain whether it is too hot or too cold.',
            interaction: 'Change the Temp setting to Warm or Cool and watch the corresponding thermosensory neurons activate.',
            populationEstimate: '~60 neurons'
        },
        {
            id: 'mechanosensory',
            name: 'Mechanosensory',
            neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH', 'NOCI'],
            type: 'sensory',
            explanation: 'Mechanosensory neurons detect touch, wind, gravity, and body position. Bristle neurons respond to physical contact, Johnston\'s organ senses wind and gravity via the antennae, and chordotonal organs track limb positions.',
            analogy: 'Like your sense of touch combined with your inner ear balance system.',
            interaction: 'Touch the fly to activate bristle neurons. Blow air to activate Johnston\'s organ.',
            populationEstimate: '~2,500 neurons'
        },
        {
            id: 'drives',
            name: 'Drives',
            neurons: ['DRIVE_HUNGER', 'DRIVE_FEAR', 'DRIVE_FATIGUE', 'DRIVE_CURIOSITY', 'DRIVE_GROOM'],
            type: 'drives',
            explanation: 'Drive neurons represent internal motivational states. They fluctuate over time and bias the fly\'s behavior \u2014 a hungry fly seeks food, a frightened fly flees, a tired fly rests.',
            analogy: 'Like your own feelings of hunger, anxiety, or tiredness \u2014 invisible internal states that shape what you do next.',
            interaction: 'Watch the drive meters in the bottom panel. Hunger increases over time; fear spikes when you touch or blow air at the fly.',
            populationEstimate: 'Distributed \u2014 modeled as 5 functional groups'
        }
    ];

    window.EducationPanel = {
        active: false,
        _initialized: false,
        _panel: null,
        _content: null,

        init: function () {
            EducationPanel._panel = document.getElementById('education-panel');
            var closeBtn = document.getElementById('education-close-btn');
            closeBtn.addEventListener('click', function () {
                EducationPanel.hide();
                var learnBtnEl = document.getElementById('learnBtn');
                if (learnBtnEl) learnBtnEl.classList.remove('active');
            });
            EducationPanel._content = document.getElementById('education-content');
            EducationPanel._buildContent();
            EducationPanel._initialized = true;
        },

        _buildContent: function () {
            var html = '';

            // Intro blurb
            html += '<p class="edu-text" style="margin-bottom:1rem;">A simplified functional model of the fruit fly brain. 59 neuron groups model ~130,000 real neurons mapped by FlyWire (2024).</p>';

            // Group regions by type for column layout
            var types = [
                { key: 'sensory', label: 'Sensory', color: '#3b82f6' },
                { key: 'central', label: 'Central', color: '#8b5cf6' },
                { key: 'drives', label: 'Drives', color: '#f59e0b' },
                { key: 'motor', label: 'Motor', color: '#ef4444' }
            ];

            html += '<div class="edu-columns">';
            for (var t = 0; t < types.length; t++) {
                var type = types[t];
                html += '<div class="edu-column">';
                html += '<div class="edu-column-header edu-type-' + type.key + '">' + type.label + '</div>';
                for (var i = 0; i < EDUCATION_REGIONS.length; i++) {
                    var region = EDUCATION_REGIONS[i];
                    if (region.type !== type.key) continue;
                    html += '<div class="edu-region-card" data-region-id="' + region.id + '">';
                    html += '<span class="edu-region-link" data-region="' + region.name + '">' + region.name + '</span>';
                    html += '</div>';
                }
                html += '</div>';
            }
            html += '</div>';

            // Signal flow diagram
            html += '<div class="edu-section" style="margin-top:1rem;">';
            html += '<h2 class="edu-section-title">Signal Flow</h2>';
            html += '<svg class="edu-signal-flow" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">';
            html += '<defs>';
            html += '<marker id="edu-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8892a4"/></marker>';
            html += '<marker id="edu-arrow-drives" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b"/></marker>';
            html += '</defs>';
            html += '<rect x="20" y="60" width="140" height="80" rx="8" fill="rgba(59,130,246,0.2)" stroke="#3b82f6"/>';
            html += '<text x="90" y="105" text-anchor="middle" fill="white" font-size="14">Sensory</text>';
            html += '<rect x="230" y="40" width="140" height="120" rx="8" fill="rgba(139,92,246,0.2)" stroke="#8b5cf6"/>';
            html += '<text x="300" y="105" text-anchor="middle" fill="white" font-size="14">Central</text>';
            html += '<rect x="440" y="60" width="140" height="80" rx="8" fill="rgba(239,68,68,0.2)" stroke="#ef4444"/>';
            html += '<text x="510" y="105" text-anchor="middle" fill="white" font-size="14">Motor</text>';
            html += '<line x1="160" y1="100" x2="230" y2="100" stroke="#8892a4" stroke-width="2" marker-end="url(#edu-arrow)"/>';
            html += '<line x1="370" y1="100" x2="440" y2="100" stroke="#8892a4" stroke-width="2" marker-end="url(#edu-arrow)"/>';
            html += '<rect x="250" y="175" width="100" height="25" rx="4" fill="rgba(245,158,11,0.2)" stroke="#f59e0b"/>';
            html += '<text x="300" y="192" text-anchor="middle" fill="white" font-size="12">Drives</text>';
            html += '<line x1="300" y1="175" x2="300" y2="160" stroke="#f59e0b" stroke-dasharray="4,3" stroke-width="2" marker-end="url(#edu-arrow-drives)"/>';
            html += '</svg>';
            html += '</div>';

            // Expandable region detail (populated on click)
            html += '<div id="edu-detail" class="edu-detail-panel" style="display:none;"></div>';

            // Compact reference sections
            html += '<div class="edu-section">';
            html += '<h2 class="edu-section-title">What\'s Simplified</h2>';
            html += '<ul class="edu-list">';
            html += '<li>Each group = hundreds/thousands of real neurons</li>';
            html += '<li>Connection weights are estimates, not exact counts</li>';
            html += '<li>No synaptic plasticity (weights are fixed)</li>';
            html += '<li>No neuromodulator diffusion or gap junctions</li>';
            html += '</ul>';
            html += '</div>';

            html += '<div class="edu-section">';
            html += '<h2 class="edu-section-title">Learn More</h2>';
            html += '<ul class="edu-links">';
            html += '<li><a href="https://codex.flywire.ai" target="_blank" rel="noopener noreferrer">FlyWire Codex</a></li>';
            html += '<li><a href="https://doi.org/10.1038/s41586-024-07558-y" target="_blank" rel="noopener noreferrer">Dorkenwald et al. 2024</a></li>';
            html += '<li><a href="https://www.virtualflybrain.org" target="_blank" rel="noopener noreferrer">Virtual Fly Brain</a></li>';
            html += '</ul>';
            html += '</div>';

            EducationPanel._content.innerHTML = html;

            // Bind click handlers on each region card
            var cards = EducationPanel._content.querySelectorAll('.edu-region-card');
            for (var ci = 0; ci < cards.length; ci++) {
                (function (card) {
                    card.addEventListener('click', function () {
                        var regionId = card.getAttribute('data-region-id');
                        for (var r = 0; r < EDUCATION_REGIONS.length; r++) {
                            if (EDUCATION_REGIONS[r].id === regionId) {
                                EducationPanel._showDetail(EDUCATION_REGIONS[r]);
                                EducationPanel.highlightRegion(EDUCATION_REGIONS[r].name);
                                break;
                            }
                        }
                    });
                })(cards[ci]);
            }
        },

        _showDetail: function (region) {
            var detail = document.getElementById('edu-detail');
            if (!detail) return;
            var html = '<div class="edu-section">';
            html += '<h2 class="edu-section-title"><span class="edu-region-link" data-region="' + region.name + '">' + region.name + '</span><span class="edu-type-badge edu-type-' + region.type + '">' + region.type + '</span></h2>';
            html += '<p class="edu-text">' + region.explanation + '</p>';
            html += '<p class="edu-analogy"><strong>Analogy:</strong> ' + region.analogy + '</p>';
            html += '<p class="edu-interaction"><strong>Try it:</strong> ' + region.interaction + '</p>';
            html += '<div class="edu-neuron-list"><strong>Neuron groups:</strong>';
            for (var j = 0; j < region.neurons.length; j++) {
                html += '<span class="edu-neuron-tag">' + region.neurons[j] + '</span>';
            }
            if (region.collectMNPrefix && typeof BRAIN !== 'undefined' && BRAIN.postSynaptic) {
                var keys = Object.keys(BRAIN.postSynaptic);
                for (var k = 0; k < keys.length; k++) {
                    if (keys[k].indexOf('MN_') === 0 && region.neurons.indexOf(keys[k]) === -1) {
                        html += '<span class="edu-neuron-tag">' + keys[k] + '</span>';
                    }
                }
            }
            html += '</div>';
            html += '<div class="edu-population">' + region.populationEstimate + '</div>';
            html += '</div>';
            detail.innerHTML = html;
            detail.style.display = 'block';
        },

        highlightRegion: function (regionName) {
            if (typeof Brain3D !== 'undefined' && Brain3D.highlightRegion) {
                Brain3D.highlightRegion(regionName);
            }
        },

        show: function () {
            if (!EducationPanel._initialized) EducationPanel.init();
            EducationPanel._panel.style.display = 'flex';
            EducationPanel.active = true;
        },

        hide: function () {
            EducationPanel._panel.style.display = 'none';
            EducationPanel.active = false;
        },

        toggle: function () {
            if (EducationPanel.active) {
                EducationPanel.hide();
            } else {
                EducationPanel.show();
            }
        }
    };
})();
