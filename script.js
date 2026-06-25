// ----- DOM Refs -----
const channelsContainer = document.getElementById('channels-container');
const playBtn = document.getElementById('play-btn');
const timerDisplay = document.getElementById('timer-display');
const masterVolumeSlider = document.getElementById('master-volume');
const masterReverbSlider = document.getElementById('master-reverb');
const eqLowSlider = document.getElementById('eq-low');
const eqMidSlider = document.getElementById('eq-mid');
const eqHighSlider = document.getElementById('eq-high');
const sleepMinutesInput = document.getElementById('sleep-minutes');
const sleepSetBtn = document.getElementById('sleep-set-btn');
const sleepStatus = document.getElementById('sleep-status');
const visualizerCanvas = document.getElementById('visualizer-canvas');
const presetSaveBtn = document.getElementById('preset-save-btn');
const presetLoadBtn = document.getElementById('preset-load-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');

// ----- Audio Context -----
let audioCtx = null;
let masterGainNode = null;
let reverbNode = null;
let reverbGainNode = null;
let dryGainNode = null;
let eqLowNode = null;
let eqMidNode = null;
let eqHighNode = null;
let masterAnalyser = null;
let isPlaying = false;

// ----- Channel State -----
let channels = [];
let channelNodes = {};

// ----- Sleep Timer -----
let sleepTimeout = null;
let sleepFadeInterval = null;
let sleepMinutes = 0;
let timerInterval = null;
let elapsedSeconds = 0;

// ----- Default Channel Configs -----
const DEFAULT_CHANNELS = [
    { id: 'rain', name: 'Rain', icon: '🌧️', type: 'rain', volume: 0.4, pan: 0, solo: false, mute: false },
    { id: 'ocean', name: 'Ocean', icon: '🌊', type: 'ocean', volume: 0.3, pan: 0, solo: false, mute: false },
    { id: 'fireplace', name: 'Fireplace', icon: '🔥', type: 'fireplace', volume: 0.3, pan: 0, solo: false, mute: false },
    { id: 'wind', name: 'Wind', icon: '🌬️', type: 'wind', volume: 0.2, pan: 0, solo: false, mute: false },
    { id: 'thunder', name: 'Thunder', icon: '⛈️', type: 'thunder', volume: 0.1, pan: 0, solo: false, mute: false },
    { id: 'birds', name: 'Birds', icon: '🐦', type: 'birds', volume: 0.2, pan: 0, solo: false, mute: false },
];

// ----- Audio Synthesis Functions -----

function createNoiseBuffer(context, type, duration = 2) {
    const sampleRate = context.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = context.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2) - 1;
    } else if (type === 'pink') {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const w = (Math.random() * 2) - 1;
            b0 = 0.99886 * b0 + w * 0.0555179;
            b1 = 0.99332 * b1 + w * 0.0750759;
            b2 = 0.96900 * b2 + w * 0.1538520;
            b3 = 0.86650 * b3 + w * 0.3104856;
            b4 = 0.55000 * b4 + w * 0.5329522;
            b5 = 0.76197 * b5 + w * 0.0168980;
            data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
            b6 = w * 0.115926;
            data[i] *= 0.11;
        }
    } else if (type === 'brown') {
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const w = (Math.random() * 2) - 1;
            const out = (lastOut + (0.02 * w)) / 1.02;
            data[i] = out * 3.5;
            lastOut = out;
        }
    }
    return buffer;
}

function buildSoundChain(context, type, channelId) {
    const source = context.createBufferSource();
    let buffer;

    switch (type) {
        case 'rain': buffer = createNoiseBuffer(context, 'white', 3); break;
        case 'ocean': buffer = createNoiseBuffer(context, 'pink', 3); break;
        case 'fireplace': buffer = createNoiseBuffer(context, 'brown', 3); break;
        case 'wind': buffer = createNoiseBuffer(context, 'white', 3); break;
        case 'thunder': buffer = createNoiseBuffer(context, 'brown', 3); break;
        case 'birds': buffer = createNoiseBuffer(context, 'white', 1); break;
        default: buffer = createNoiseBuffer(context, 'white', 2);
    }
    source.buffer = buffer;
    source.loop = true;

    const gainNode = context.createGain();
    gainNode.gain.value = 0;

    const panNode = context.createStereoPanner();
    panNode.pan.value = 0;

    // Analyser for VU meter
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;

    // Filters & effects per channel
    let filterNode = null;
    let extraNodes = [];

    switch (type) {
        case 'rain': {
            filterNode = context.createBiquadFilter();
            filterNode.type = 'bandpass';
            filterNode.frequency.value = 2000;
            filterNode.Q.value = 1.5;
            const lfo = context.createOscillator();
            lfo.frequency.value = 0.5 + Math.random() * 0.3;
            const lfoGain = context.createGain();
            lfoGain.gain.value = 600;
            lfo.connect(lfoGain);
            lfoGain.connect(filterNode.frequency);
            lfo.start();
            extraNodes.push(lfo, lfoGain);
            break;
        }
        case 'ocean': {
            filterNode = context.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.value = 250;
            filterNode.Q.value = 0.8;
            const lfo = context.createOscillator();
            lfo.frequency.value = 0.08;
            const lfoGain = context.createGain();
            lfoGain.gain.value = 80;
            lfo.connect(lfoGain);
            lfoGain.connect(filterNode.frequency);
            lfo.start();
            extraNodes.push(lfo, lfoGain);
            break;
        }
        case 'fireplace': {
            filterNode = context.createBiquadFilter();
            filterNode.type = 'highpass';
            filterNode.frequency.value = 100;
            filterNode.Q.value = 0.7;
            break;
        }
        case 'wind': {
            filterNode = context.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.value = 400;
            filterNode.Q.value = 1.2;
            const lfo = context.createOscillator();
            lfo.frequency.value = 0.15 + Math.random() * 0.1;
            const lfoGain = context.createGain();
            lfoGain.gain.value = 200;
            lfo.connect(lfoGain);
            lfoGain.connect(filterNode.frequency);
            lfo.start();
            extraNodes.push(lfo, lfoGain);
            break;
        }
        case 'thunder': {
            filterNode = context.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.value = 150;
            filterNode.Q.value = 0.5;
            break;
        }
        case 'birds': {
            // For birds, we use FM synthesis with oscillators
            const carrier = context.createOscillator();
            carrier.type = 'sine';
            const modulator = context.createOscillator();
            modulator.type = 'sine';
            modulator.frequency.value = 60;
            const modGain = context.createGain();
            modGain.gain.value = 40;
            const fmGain = context.createGain();
            fmGain.gain.value = 0.3;
            carrier.connect(fmGain);
            modulator.connect(modGain);
            modGain.connect(carrier.frequency);
            const env = context.createGain();
            env.gain.setValueAtTime(0, context.currentTime);
            env.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.05);
            env.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);
            env.gain.linearRampToValueAtTime(0, context.currentTime + 0.5);
            carrier.connect(env);
            modulator.start();
            carrier.start();
            // Connect to our routing
            env.connect(gainNode);
            gainNode.connect(panNode);
            panNode.connect(analyser);
            return { source: carrier, gainNode, panNode, analyser, filterNode: null, extraNodes: [carrier, modulator, modGain, env], type: 'birds' };
        }
        default: {
            filterNode = null;
        }
    }

    // Routing: source -> filter -> gain -> pan -> analyser
    if (filterNode) {
        source.connect(filterNode);
        filterNode.connect(gainNode);
    } else {
        source.connect(gainNode);
    }
    gainNode.connect(panNode);
    panNode.connect(analyser);

    return { source, gainNode, panNode, analyser, filterNode, extraNodes, type };
}

// ----- Create Channel -----
function createChannel(channelConfig) {
    const id = channelConfig.id || `ch-${Date.now()}`;
    const type = channelConfig.type || 'white';
    const chain = buildSoundChain(audioCtx, type, id);
    // Connect analyser to master
    chain.analyser.connect(masterGainNode);
    // Store nodes
    channelNodes[id] = chain;
    // Set initial volume/pan
    chain.gainNode.gain.value = channelConfig.volume || 0;
    chain.panNode.pan.value = channelConfig.pan || 0;
    // Store config
    channels.push({ ...channelConfig, id, type });
    return id;
}

// ----- Init Audio Context -----
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Master Gain
    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = parseFloat(masterVolumeSlider.value);

    // EQ Nodes
    eqLowNode = audioCtx.createBiquadFilter();
    eqLowNode.type = 'lowshelf';
    eqLowNode.frequency.value = 200;
    eqLowNode.gain.value = 0;
    eqMidNode = audioCtx.createBiquadFilter();
    eqMidNode.type = 'peaking';
    eqMidNode.frequency.value = 1000;
    eqMidNode.Q.value = 1;
    eqMidNode.gain.value = 0;
    eqHighNode = audioCtx.createBiquadFilter();
    eqHighNode.type = 'highshelf';
    eqHighNode.frequency.value = 5000;
    eqHighNode.gain.value = 0;

    // Reverb (Convolver with generated impulse)
    reverbNode = audioCtx.createConvolver();
    const irLength = audioCtx.sampleRate * 2;
    const irBuffer = audioCtx.createBuffer(2, irLength, audioCtx.sampleRate);
    const l = irBuffer.getChannelData(0);
    const r = irBuffer.getChannelData(1);
    const decay = 1.5;
    for (let i = 0; i < irLength; i++) {
        const env = Math.exp(-i / (audioCtx.sampleRate * decay));
        const val = (Math.random() * 2 - 1) * env;
        l[i] = val * 0.6;
        r[i] = val * 0.6;
    }
    reverbNode.buffer = irBuffer;

    reverbGainNode = audioCtx.createGain();
    reverbGainNode.gain.value = parseFloat(masterReverbSlider.value);
    dryGainNode = audioCtx.createGain();
    dryGainNode.gain.value = 1 - parseFloat(masterReverbSlider.value);

    // Master Analyser for visualizer
    masterAnalyser = audioCtx.createAnalyser();
    masterAnalyser.fftSize = 1024;

    // Routing: masterGain -> split -> dry/wet
    masterGainNode.connect(dryGainNode);
    masterGainNode.connect(reverbGainNode);
    reverbGainNode.connect(reverbNode);

    // Dry + Wet -> EQ -> Analyser -> Destination
    dryGainNode.connect(eqLowNode);
    reverbNode.connect(eqLowNode);
    eqLowNode.connect(eqMidNode);
    eqMidNode.connect(eqHighNode);
    eqHighNode.connect(masterAnalyser);
    masterAnalyser.connect(audioCtx.destination);

    // Create default channels
    DEFAULT_CHANNELS.forEach(cfg => createChannel(cfg));

    // Render channels
    renderChannels();
}

// ----- Render Channels UI -----
function renderChannels() {
    if (!channelsContainer) return;
    channelsContainer.innerHTML = '';
    channels.forEach((ch, index) => {
        const strip = document.createElement('div');
        strip.className = `channel-strip ${ch.type === 'custom' ? 'custom-channel' : ''}`;
        strip.draggable = true;
        strip.dataset.index = index;
        strip.dataset.id = ch.id;

        const isSolo = ch.solo || false;
        const isMute = ch.mute || false;

        strip.innerHTML = `
            <div class="drag-handle">⠿</div>
            <button class="channel-delete" data-id="${ch.id}" title="Remove">✕</button>
            <div class="channel-icon">${ch.icon || '🔊'}</div>
            <div class="channel-name">${ch.name}</div>
            <div class="channel-controls">
                <label>Vol</label>
                <input type="range" class="ch-volume" data-id="${ch.id}" min="0" max="1" step="0.01" value="${ch.volume || 0}" />
                <label>Pan</label>
                <input type="range" class="ch-pan" data-id="${ch.id}" min="-1" max="1" step="0.01" value="${ch.pan || 0}" />
            </div>
            <div class="vu-meter"><div class="vu-fill" id="vu-${ch.id}" style="width:0%"></div></div>
            <div class="channel-actions">
                <button class="ch-solo ${isSolo ? 'solo-active' : ''}" data-id="${ch.id}">Solo</button>
                <button class="ch-mute ${isMute ? 'mute-active' : ''}" data-id="${ch.id}">Mute</button>
            </div>
        `;
        channelsContainer.appendChild(strip);
    });

    // Attach events
    attachChannelEvents();
    attachDragEvents();
}

// ----- Attach Channel Events -----
function attachChannelEvents() {
    // Volume
    document.querySelectorAll('.ch-volume').forEach(el => {
        el.addEventListener('input', () => {
            const id = el.dataset.id;
            const val = parseFloat(el.value);
            const ch = channels.find(c => c.id === id);
            if (ch) ch.volume = val;
            if (channelNodes[id]) {
                channelNodes[id].gainNode.gain.setValueAtTime(val, audioCtx.currentTime);
            }
        });
    });

    // Pan
    document.querySelectorAll('.ch-pan').forEach(el => {
        el.addEventListener('input', () => {
            const id = el.dataset.id;
            const val = parseFloat(el.value);
            const ch = channels.find(c => c.id === id);
            if (ch) ch.pan = val;
            if (channelNodes[id]) {
                channelNodes[id].panNode.pan.setValueAtTime(val, audioCtx.currentTime);
            }
        });
    });

    // Solo
    document.querySelectorAll('.ch-solo').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            const ch = channels.find(c => c.id === id);
            if (!ch) return;
            const isSolo = !ch.solo;
            if (isSolo) {
                channels.forEach(c => {
                    if (c.id !== id) {
                        c.solo = false;
                        c.mute = true;
                        if (channelNodes[c.id]) {
                            channelNodes[c.id].gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                        }
                    }
                });
                ch.solo = true;
                ch.mute = false;
                if (channelNodes[id]) {
                    channelNodes[id].gainNode.gain.setValueAtTime(ch.volume, audioCtx.currentTime);
                }
            } else {
                ch.solo = false;
                channels.forEach(c => {
                    c.mute = false;
                    if (channelNodes[c.id]) {
                        channelNodes[c.id].gainNode.gain.setValueAtTime(c.volume, audioCtx.currentTime);
                    }
                });
            }
            renderChannels();
        });
    });

    // Mute
    document.querySelectorAll('.ch-mute').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            const ch = channels.find(c => c.id === id);
            if (!ch) return;
            ch.mute = !ch.mute;
            if (ch.mute) {
                if (channelNodes[id]) {
                    channelNodes[id].gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                }
            } else {
                if (channelNodes[id]) {
                    channelNodes[id].gainNode.gain.setValueAtTime(ch.volume, audioCtx.currentTime);
                }
            }
            renderChannels();
        });
    });

    // Delete
    document.querySelectorAll('.channel-delete').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            const ch = channels.find(c => c.id === id);
            if (!ch || ch.type === 'rain' || ch.type === 'ocean' || ch.type === 'fireplace' || ch.type === 'wind' || ch.type === 'thunder' || ch.type === 'birds') {
                alert('Cannot delete built-in sounds.');
                return;
            }
            if (confirm(`Delete "${ch.name}"?`)) {
                if (channelNodes[id]) {
                    try {
                        channelNodes[id].source.stop();
                        channelNodes[id].source.disconnect();
                        channelNodes[id].gainNode.disconnect();
                        channelNodes[id].panNode.disconnect();
                        channelNodes[id].analyser.disconnect();
                    } catch (e) {}
                    delete channelNodes[id];
                }
                channels = channels.filter(c => c.id !== id);
                renderChannels();
            }
        });
    });
}

// ----- Drag to Reorder -----
function attachDragEvents() {
    const strips = document.querySelectorAll('.channel-strip');
    let dragIndex = null;

    strips.forEach((strip, idx) => {
        strip.addEventListener('dragstart', (e) => {
            dragIndex = idx;
            strip.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        strip.addEventListener('dragend', () => {
            strip.classList.remove('dragging');
            document.querySelectorAll('.channel-strip').forEach(s => s.style.border = '');
        });
        strip.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            document.querySelectorAll('.channel-strip').forEach(s => s.style.border = '');
            strip.style.border = `2px solid var(--accent)`;
        });
        strip.addEventListener('dragleave', () => {
            strip.style.border = '';
        });
        strip.addEventListener('drop', (e) => {
            e.preventDefault();
            strip.style.border = '';
            if (dragIndex === null || dragIndex === idx) return;
            const [moved] = channels.splice(dragIndex, 1);
            channels.splice(idx, 0, moved);
            renderChannels();
            channels.forEach(c => {
                if (c.solo) {
                    channels.forEach(cc => { if (cc.id !== c.id) cc.mute = true; });
                }
                if (c.mute && channelNodes[c.id]) {
                    channelNodes[c.id].gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                }
            });
        });
    });
}

// ----- Master Controls -----
masterVolumeSlider.addEventListener('input', () => {
    if (masterGainNode) {
        masterGainNode.gain.setValueAtTime(parseFloat(masterVolumeSlider.value), audioCtx.currentTime);
    }
});

masterReverbSlider.addEventListener('input', () => {
    const val = parseFloat(masterReverbSlider.value);
    if (reverbGainNode) reverbGainNode.gain.setValueAtTime(val, audioCtx.currentTime);
    if (dryGainNode) dryGainNode.gain.setValueAtTime(1 - val, audioCtx.currentTime);
});

eqLowSlider.addEventListener('input', () => {
    if (eqLowNode) eqLowNode.gain.setValueAtTime(parseFloat(eqLowSlider.value), audioCtx.currentTime);
});
eqMidSlider.addEventListener('input', () => {
    if (eqMidNode) eqMidNode.gain.setValueAtTime(parseFloat(eqMidSlider.value), audioCtx.currentTime);
});
eqHighSlider.addEventListener('input', () => {
    if (eqHighNode) eqHighNode.gain.setValueAtTime(parseFloat(eqHighSlider.value), audioCtx.currentTime);
});

// ----- Play / Pause -----
playBtn.addEventListener('click', () => {
    if (!audioCtx) {
        initAudio();
        audioCtx.resume();
        Object.values(channelNodes).forEach(chain => {
            if (chain.source && chain.type !== 'birds') {
                try { chain.source.start(0); } catch (e) {}
            }
        });
        isPlaying = true;
        playBtn.textContent = '⏹ Stop';
        playBtn.classList.add('playing');
        startTimer();
        return;
    }

    if (isPlaying) {
        Object.values(channelNodes).forEach(chain => {
            if (chain.source && chain.type !== 'birds') {
                try { chain.source.stop(0); } catch (e) {}
            }
            if (chain.source && chain.type === 'birds') {
                try { chain.source.disconnect(); } catch (e) {}
            }
        });
        Object.keys(channelNodes).forEach(id => {
            const ch = channels.find(c => c.id === id);
            if (!ch) return;
            const chain = channelNodes[id];
            if (chain.type !== 'birds') {
                const newChain = buildSoundChain(audioCtx, chain.type, id);
                newChain.gainNode.gain.value = ch.mute ? 0 : ch.volume;
                newChain.panNode.pan.value = ch.pan || 0;
                newChain.analyser.connect(masterGainNode);
                if (chain.filterNode) {
                    chain.filterNode.disconnect();
                }
                channelNodes[id] = newChain;
            }
        });
        isPlaying = false;
        playBtn.textContent = '▶ Play';
        playBtn.classList.remove('playing');
        stopTimer();
        clearSleep();
    } else {
        audioCtx.resume();
        Object.values(channelNodes).forEach(chain => {
            if (chain.source && chain.type !== 'birds') {
                try { chain.source.start(0); } catch (e) {}
            }
        });
        isPlaying = true;
        playBtn.textContent = '⏹ Stop';
        playBtn.classList.add('playing');
        startTimer();
    }
});

// ----- Timer -----
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    elapsedSeconds = 0;
    timerInterval = setInterval(() => {
        elapsedSeconds++;
        const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
        const secs = String(elapsedSeconds % 60).padStart(2, '0');
        timerDisplay.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ----- Sleep Timer -----
sleepSetBtn.addEventListener('click', () => {
    const mins = parseInt(sleepMinutesInput.value);
    if (isNaN(mins) || mins <= 0) {
        clearSleep();
        return;
    }
    sleepMinutes = mins;
    sleepStatus.textContent = `💤 ${mins} min`;
    sleepStatus.style.color = 'var(--warning)';
    if (sleepTimeout) clearTimeout(sleepTimeout);
    if (sleepFadeInterval) clearInterval(sleepFadeInterval);
    sleepTimeout = setTimeout(() => {
        fadeOutAndStop();
    }, mins * 60 * 1000);
});

function clearSleep() {
    if (sleepTimeout) { clearTimeout(sleepTimeout); sleepTimeout = null; }
    if (sleepFadeInterval) { clearInterval(sleepFadeInterval); sleepFadeInterval = null; }
    sleepMinutes = 0;
    sleepStatus.textContent = 'Off';
    sleepStatus.style.color = 'var(--text-muted)';
    sleepMinutesInput.value = 0;
}

function fadeOutAndStop() {
    if (!masterGainNode) return;
    const startGain = masterGainNode.gain.value;
    const duration = 60;
    const steps = 60;
    let step = 0;
    const stepSize = startGain / steps;
    sleepFadeInterval = setInterval(() => {
        step++;
        const newGain = Math.max(0, startGain - step * stepSize);
        masterGainNode.gain.setValueAtTime(newGain, audioCtx.currentTime);
        if (step >= steps || newGain <= 0) {
            clearInterval(sleepFadeInterval);
            sleepFadeInterval = null;
            if (isPlaying) playBtn.click();
            masterGainNode.gain.setValueAtTime(startGain, audioCtx.currentTime);
            clearSleep();
            sleepStatus.textContent = '⏰ Timer ended';
            sleepStatus.style.color = 'var(--success)';
        }
    }, 1000 / steps);
}

// ----- Visualizer (Oscilloscope + Spectrogram) -----
function drawVisualizer() {
    if (!masterAnalyser || !visualizerCanvas) {
        requestAnimationFrame(drawVisualizer);
        return;
    }

    const canvas = visualizerCanvas;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width * dpr;
    const h = rect.height * dpr;
    canvas.width = w;
    canvas.height = h;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // ---- Top: Oscilloscope (Time Domain) ----
    const timeData = new Float32Array(masterAnalyser.fftSize);
    masterAnalyser.getFloatTimeDomainData(timeData);

    ctx.beginPath();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    const halfH = height * 0.45;
    const step = width / timeData.length;
    for (let i = 0; i < timeData.length; i++) {
        const x = i * step;
        const y = halfH + timeData[i] * halfH * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ---- Bottom: Spectrogram (Frequency) ----
    const freqData = new Uint8Array(masterAnalyser.frequencyBinCount);
    masterAnalyser.getByteFrequencyData(freqData);

    const spectrogramHeight = height * 0.4;
    const specY = height * 0.55;
    const grad = ctx.createLinearGradient(0, specY, 0, specY + spectrogramHeight);
    grad.addColorStop(0, 'rgba(59, 130, 246, 1)');
    grad.addColorStop(0.3, 'rgba(139, 92, 246, 1)');
    grad.addColorStop(0.6, 'rgba(236, 72, 153, 1)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.5)');

    const barW = width / freqData.length;
    for (let i = 0; i < freqData.length; i++) {
        const value = freqData[i] / 255;
        const barH = value * spectrogramHeight;
        ctx.fillStyle = grad;
        ctx.fillRect(i * barW, specY + spectrogramHeight - barH, barW, barH);
    }

    requestAnimationFrame(drawVisualizer);
}

// ----- Update VU Meters -----
function updateVUMeters() {
    if (!isPlaying) {
        requestAnimationFrame(updateVUMeters);
        return;
    }
    Object.keys(channelNodes).forEach(id => {
        const chain = channelNodes[id];
        if (!chain || !chain.analyser) return;
        const data = new Uint8Array(chain.analyser.fftSize);
        chain.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const val = (data[i] - 128) / 128;
            sum += val * val;
        }
        const rms = Math.sqrt(sum / data.length);
        const percent = Math.min(100, rms * 300);
        const vu = document.getElementById(`vu-${id}`);
        if (vu) vu.style.width = `${percent}%`;
    });
    requestAnimationFrame(updateVUMeters);
}

// ----- Presets (LocalStorage Fallback) -----
function getCurrentState() {
    return {
        channels: channels.map(c => ({
            id: c.id, name: c.name, icon: c.icon, type: c.type,
            volume: c.volume, pan: c.pan, solo: c.solo, mute: c.mute
        })),
        master: {
            volume: parseFloat(masterVolumeSlider.value),
            reverb: parseFloat(masterReverbSlider.value),
            eqLow: parseFloat(eqLowSlider.value),
            eqMid: parseFloat(eqMidSlider.value),
            eqHigh: parseFloat(eqHighSlider.value),
        }
    };
}

function applyState(state) {
    state.channels.forEach(saved => {
        const existing = channels.find(c => c.id === saved.id);
        if (existing) {
            existing.volume = saved.volume;
            existing.pan = saved.pan;
            existing.solo = saved.solo;
            existing.mute = saved.mute;
            if (channelNodes[saved.id]) {
                channelNodes[saved.id].gainNode.gain.setValueAtTime(
                    saved.mute ? 0 : saved.volume,
                    audioCtx.currentTime
                );
                channelNodes[saved.id].panNode.pan.setValueAtTime(saved.pan, audioCtx.currentTime);
            }
        }
    });
    masterVolumeSlider.value = state.master.volume;
    if (masterGainNode) masterGainNode.gain.setValueAtTime(state.master.volume, audioCtx.currentTime);
    masterReverbSlider.value = state.master.reverb;
    if (reverbGainNode) reverbGainNode.gain.setValueAtTime(state.master.reverb, audioCtx.currentTime);
    if (dryGainNode) dryGainNode.gain.setValueAtTime(1 - state.master.reverb, audioCtx.currentTime);
    eqLowSlider.value = state.master.eqLow;
    if (eqLowNode) eqLowNode.gain.setValueAtTime(state.master.eqLow, audioCtx.currentTime);
    eqMidSlider.value = state.master.eqMid;
    if (eqMidNode) eqMidNode.gain.setValueAtTime(state.master.eqMid, audioCtx.currentTime);
    eqHighSlider.value = state.master.eqHigh;
    if (eqHighNode) eqHighNode.gain.setValueAtTime(state.master.eqHigh, audioCtx.currentTime);

    renderChannels();
}

presetSaveBtn.addEventListener('click', () => {
    const name = prompt('Enter preset name:');
    if (!name || !name.trim()) return;
    const state = getCurrentState();
    try {
        const presets = JSON.parse(localStorage.getItem('ambientPresets') || '[]');
        presets.push({ id: Date.now(), name: name.trim(), data: state, createdAt: new Date().toISOString() });
        localStorage.setItem('ambientPresets', JSON.stringify(presets));
        alert(`✅ Preset "${name.trim()}" saved!`);
    } catch (err) {
        alert('❌ Failed to save preset.');
        console.error(err);
    }
});

presetLoadBtn.addEventListener('click', () => {
    try {
        const presets = JSON.parse(localStorage.getItem('ambientPresets') || '[]');
        if (presets.length === 0) {
            alert('No presets saved yet.');
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'modal visible';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <button class="modal-close">✕</button>
                <h2>📂 Load Preset</h2>
                <div class="modal-list">
                    ${presets.map(p => `
                        <div class="modal-list-item" data-id="${p.id}">
                            <span>${p.name}</span>
                            <div>
                                <small style="color:var(--text-muted)">${new Date(p.createdAt).toLocaleDateString()}</small>
                                <button class="delete-preset" data-id="${p.id}">✕</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.modal-overlay').addEventListener('click', () => modal.remove());

        modal.querySelectorAll('.modal-list-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = parseInt(el.dataset.id);
                const preset = presets.find(p => p.id === id);
                if (preset) {
                    if (!audioCtx) initAudio();
                    applyState(preset.data);
                    modal.remove();
                    alert(`✅ Loaded "${preset.name}"`);
                }
            });
        });

        modal.querySelectorAll('.delete-preset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                if (confirm('Delete this preset?')) {
                    let updated = JSON.parse(localStorage.getItem('ambientPresets') || '[]');
                    updated = updated.filter(p => p.id !== id);
                    localStorage.setItem('ambientPresets', JSON.stringify(updated));
                    modal.remove();
                    presetLoadBtn.click();
                }
            });
        });

    } catch (err) {
        alert('❌ Failed to load presets.');
        console.error(err);
    }
});

// ----- Export / Import JSON -----
exportBtn.addEventListener('click', () => {
    const state = getCurrentState();
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ambient-preset-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const state = JSON.parse(ev.target.result);
                if (state.channels && state.master) {
                    if (!audioCtx) initAudio();
                    applyState(state);
                    alert('✅ Preset imported successfully!');
                } else {
                    throw new Error('Invalid format');
                }
            } catch (err) {
                alert('❌ Invalid file format.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
});

// ----- Initialize App -----
function init() {
    // Initial render with default channels (even before audio starts)
    channels = DEFAULT_CHANNELS.map(c => ({ ...c }));
    renderChannels();
    // Start visualizer loop (will show "waiting" state)
    drawVisualizer();
    // Start VU meter loop
    updateVUMeters();
    console.log('🎧 Ambient Pro Studio loaded! Click Play to start audio.');
}

init();
