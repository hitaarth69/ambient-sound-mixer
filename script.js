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
let isPlaying = false;

// ----- Channel State -----
let channels = [];
let channelNodes = {};

// ----- Sleep Timer -----
let sleepTimeout = null;
let sleepFadeInterval = null;
let timerInterval = null;
let elapsedSeconds = 0;

// ----- Default Channel Configs -----
const DEFAULT_CHANNELS = [
    { id: 'rain', name: 'Rain', icon: '🌧️', volume: 0.4, pan: 0, solo: false, mute: false },
    { id: 'ocean', name: 'Ocean', icon: '🌊', volume: 0.3, pan: 0, solo: false, mute: false },
    { id: 'fireplace', name: 'Fireplace', icon: '🔥', volume: 0.3, pan: 0, solo: false, mute: false },
    { id: 'wind', name: 'Wind', icon: '🌬️', volume: 0.2, pan: 0, solo: false, mute: false },
    { id: 'thunder', name: 'Thunder', icon: '⛈️', volume: 0.1, pan: 0, solo: false, mute: false },
    { id: 'birds', name: 'Birds', icon: '🐦', volume: 0.2, pan: 0, solo: false, mute: false },
];

// ----- Simple Audio Generation -----
function createNoiseBuffer(context, type, duration = 2) {
    const sampleRate = context.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = context.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        if (type === 'white' || type === 'rain' || type === 'wind') {
            data[i] = (Math.random() * 2) - 1;
        } else if (type === 'pink' || type === 'ocean') {
            const w = (Math.random() * 2) - 1;
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            b0 = 0.99886 * b0 + w * 0.0555179;
            b1 = 0.99332 * b1 + w * 0.0750759;
            b2 = 0.96900 * b2 + w * 0.1538520;
            b3 = 0.86650 * b3 + w * 0.3104856;
            b4 = 0.55000 * b4 + w * 0.5329522;
            b5 = 0.76197 * b5 + w * 0.0168980;
            data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
            b6 = w * 0.115926;
            data[i] *= 0.11;
        } else if (type === 'brown' || type === 'fireplace' || type === 'thunder') {
            let lastOut = 0;
            const w = (Math.random() * 2) - 1;
            const out = (lastOut + (0.02 * w)) / 1.02;
            data[i] = out * 3.5;
            lastOut = out;
        } else if (type === 'birds') {
            // Simple chirp simulation
            const t = i / sampleRate;
            const chirp = Math.sin(2 * Math.PI * (200 + 400 * t) * t);
            const env = Math.exp(-t * 3) * 0.5;
            data[i] = chirp * env;
        }
    }
    return buffer;
}

function createChannelSource(context, type, channelId) {
    const source = context.createBufferSource();
    const buffer = createNoiseBuffer(context, type, 3);
    source.buffer = buffer;
    source.loop = true;

    const gainNode = context.createGain();
    gainNode.gain.value = 0;

    const panNode = context.createStereoPanner();
    panNode.pan.value = 0;

    const analyser = context.createAnalyser();
    analyser.fftSize = 128;

    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(analyser);

    return { source, gainNode, panNode, analyser };
}

// ----- Create Channel -----
function createChannel(channelConfig) {
    if (!audioCtx) return;
    const id = channelConfig.id || `ch-${Date.now()}`;
    const chain = createChannelSource(audioCtx, channelConfig.type || 'white', id);
    chain.analyser.connect(masterGainNode);
    chain.gainNode.gain.value = channelConfig.volume || 0;
    chain.panNode.pan.value = channelConfig.pan || 0;
    channelNodes[id] = chain;
    channels.push({ ...channelConfig, id });
}

// ----- Init Audio -----
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = parseFloat(masterVolumeSlider.value);
    masterGainNode.connect(audioCtx.destination);

    // Create default channels
    DEFAULT_CHANNELS.forEach(cfg => {
        const id = cfg.id;
        const chain = createChannelSource(audioCtx, cfg.type, id);
        chain.analyser.connect(masterGainNode);
        chain.gainNode.gain.value = cfg.volume || 0;
        chain.panNode.pan.value = cfg.pan || 0;
        channelNodes[id] = chain;
        channels.push({ ...cfg, id });
    });

    renderChannels();
    drawVisualizer();
}

// ----- Render Channels -----
function renderChannels() {
    if (!channelsContainer) return;
    channelsContainer.innerHTML = '';
    
    channels.forEach((ch, index) => {
        const strip = document.createElement('div');
        strip.className = 'channel-strip';
        strip.draggable = true;
        strip.dataset.index = index;
        strip.dataset.id = ch.id;

        const isSolo = ch.solo || false;
        const isMute = ch.mute || false;

        strip.innerHTML = `
            <div class="drag-handle">⠿</div>
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

    attachChannelEvents();
}

// ----- Attach Events -----
function attachChannelEvents() {
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

    document.querySelectorAll('.ch-solo').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            const ch = channels.find(c => c.id === id);
            if (!ch) return;
            ch.solo = !ch.solo;
            if (ch.solo) {
                channels.forEach(c => {
                    if (c.id !== id) { c.mute = true; }
                });
            } else {
                channels.forEach(c => { c.mute = false; });
            }
            renderChannels();
            // Re-apply volumes
            channels.forEach(c => {
                if (channelNodes[c.id]) {
                    const vol = c.mute ? 0 : c.volume;
                    channelNodes[c.id].gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
                }
            });
        });
    });

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
}

// ----- Master Controls -----
masterVolumeSlider.addEventListener('input', () => {
    if (masterGainNode) {
        masterGainNode.gain.setValueAtTime(parseFloat(masterVolumeSlider.value), audioCtx.currentTime);
    }
});

// ----- Play / Pause -----
playBtn.addEventListener('click', () => {
    if (!audioCtx) {
        initAudio();
        audioCtx.resume();
        Object.values(channelNodes).forEach(chain => {
            try { chain.source.start(0); } catch (e) {}
            chain.gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        });
        isPlaying = true;
        playBtn.textContent = '⏹ Stop';
        playBtn.classList.add('playing');
        startTimer();
        return;
    }

    if (isPlaying) {
        Object.values(channelNodes).forEach(chain => {
            try { chain.source.stop(0); } catch (e) {}
        });
        isPlaying = false;
        playBtn.textContent = '▶ Play';
        playBtn.classList.remove('playing');
        stopTimer();
    } else {
        audioCtx.resume();
        // Rebuild sources
        Object.keys(channelNodes).forEach(id => {
            const ch = channels.find(c => c.id === id);
            if (!ch) return;
            const newChain = createChannelSource(audioCtx, ch.type || 'white', id);
            newChain.analyser.connect(masterGainNode);
            newChain.gainNode.gain.value = ch.mute ? 0 : ch.volume;
            newChain.panNode.pan.value = ch.pan || 0;
            channelNodes[id] = newChain;
            try { newChain.source.start(0); } catch (e) {}
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
        if (sleepTimeout) { clearTimeout(sleepTimeout); sleepTimeout = null; }
        sleepStatus.textContent = 'Off';
        sleepStatus.style.color = 'var(--text-muted)';
        return;
    }
    sleepStatus.textContent = `💤 ${mins} min`;
    sleepStatus.style.color = 'var(--warning)';
    if (sleepTimeout) clearTimeout(sleepTimeout);
    sleepTimeout = setTimeout(() => {
        if (isPlaying) playBtn.click();
        sleepStatus.textContent = '⏰ Timer ended';
        sleepStatus.style.color = 'var(--success)';
    }, mins * 60 * 1000);
});

// ----- Visualizer -----
function drawVisualizer() {
    if (!visualizerCanvas) {
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

    // Simple visualizer without analyser (draw random waves)
    ctx.beginPath();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    const halfH = height * 0.45;
    for (let i = 0; i < width; i++) {
        const x = i;
        const y = halfH + Math.sin(i * 0.05 + Date.now() * 0.002) * halfH * 0.5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Spectrogram
    const grad = ctx.createLinearGradient(0, height * 0.6, 0, height);
    grad.addColorStop(0, 'rgba(59, 130, 246, 1)');
    grad.addColorStop(0.5, 'rgba(139, 92, 246, 1)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, height * 0.6, width, height * 0.4);

    requestAnimationFrame(drawVisualizer);
}

// ----- Presets (LocalStorage) -----
function getCurrentState() {
    return {
        channels: channels.map(c => ({
            id: c.id, name: c.name, icon: c.icon,
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
        }
    });
    masterVolumeSlider.value = state.master.volume;
    if (masterGainNode) masterGainNode.gain.setValueAtTime(state.master.volume, audioCtx.currentTime);
    masterReverbSlider.value = state.master.reverb;
    renderChannels();
}

presetSaveBtn.addEventListener('click', () => {
    const name = prompt('Enter preset name:');
    if (!name || !name.trim()) return;
    const state = getCurrentState();
    const presets = JSON.parse(localStorage.getItem('ambientPresets') || '[]');
    presets.push({ id: Date.now(), name: name.trim(), data: state });
    localStorage.setItem('ambientPresets', JSON.stringify(presets));
    alert(`✅ Preset "${name.trim()}" saved!`);
});

presetLoadBtn.addEventListener('click', () => {
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
                        <button class="delete-preset" data-id="${p.id}">✕</button>
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
});

// ----- Export / Import -----
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

// ----- Init -----
function init() {
    channels = DEFAULT_CHANNELS.map(c => ({ ...c }));
    renderChannels();
    drawVisualizer();
    console.log('🎧 Ambient Pro Studio loaded! Click Play to start audio.');
}

init();
