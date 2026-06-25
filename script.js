// ----- DOM References -----
const playBtn = document.getElementById('play-btn');
const masterGainSlider = document.getElementById('master-gain');
const sliders = {
    rain: document.getElementById('slider-rain'),
    ocean: document.getElementById('slider-ocean'),
    fireplace: document.getElementById('slider-fireplace'),
    coffee: document.getElementById('slider-coffee'),
};
const statusEls = {
    rain: document.getElementById('status-rain'),
    ocean: document.getElementById('status-ocean'),
    fireplace: document.getElementById('status-fireplace'),
    coffee: document.getElementById('status-coffee'),
};
const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');

// ----- Audio Context & Nodes -----
let audioCtx = null;
let masterGainNode = null;
let isPlaying = false;

// Store all sound chains
const sounds = {};

// ----- Noise Generators -----
function createNoiseBuffer(context, type = 'white', duration = 2) {
    const sampleRate = context.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = context.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2) - 1;
        }
    } else if (type === 'pink') {
        // Simple pink noise approximation: filtered white noise
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = (Math.random() * 2) - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = 0.76197 * b5 + white * 0.0168980;
            data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;
            data[i] *= 0.11; // scale to avoid clipping
        }
    } else if (type === 'brown') {
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = (Math.random() * 2) - 1;
            const out = (lastOut + (0.02 * white)) / 1.02;
            data[i] = out * 3.5;
            lastOut = out;
        }
    }
    return buffer;
}

// ----- Build Sound Chains -----
function buildSoundChain(context, type) {
    const buffer = createNoiseBuffer(context, type);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gainNode = context.createGain();
    gainNode.gain.value = 0;

    let filterNode = null;
    let extraNodes = [];

    if (type === 'white') {
        // Rain: bandpass filter (1000Hz - 4000Hz) + slight modulation
        filterNode = context.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 2000;
        filterNode.Q.value = 1.2;
        // Add a small LFO for shimmer? Too complex for simplicity.
        source.connect(filterNode);
        filterNode.connect(gainNode);
    } else if (type === 'pink') {
        // Ocean: lowpass filter (200Hz) with resonance
        filterNode = context.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 250;
        filterNode.Q.value = 0.8;
        source.connect(filterNode);
        filterNode.connect(gainNode);
    } else if (type === 'brown') {
        // Fireplace: highpass filter + separate crackle (added later)
        filterNode = context.createBiquadFilter();
        filterNode.type = 'highpass';
        filterNode.frequency.value = 80;
        filterNode.Q.value = 0.7;
        source.connect(filterNode);
        filterNode.connect(gainNode);
    } else if (type === 'coffee') {
        // Coffee: bandpass with a delay effect
        filterNode = context.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 600;
        filterNode.Q.value = 1.5;
        const delay = context.createDelay(1.0);
        delay.delayTime.value = 0.15;
        const feedback = context.createGain();
        feedback.gain.value = 0.3;
        const dryGain = context.createGain();
        dryGain.gain.value = 0.6;
        const wetGain = context.createGain();
        wetGain.gain.value = 0.4;

        source.connect(filterNode);
        // Split: dry and wet
        filterNode.connect(dryGain);
        dryGain.connect(gainNode);
        filterNode.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay); // feedback loop
        delay.connect(wetGain);
        wetGain.connect(gainNode);
        extraNodes = [delay, feedback, dryGain, wetGain];
    }

    return {
        source,
        gainNode,
        filterNode,
        extraNodes,
        started: false,
        bufferType: type,
    };
}

// ----- Initialize Sounds -----
function initSounds() {
    if (!audioCtx) return;

    const configs = {
        rain: { type: 'white' },
        ocean: { type: 'pink' },
        fireplace: { type: 'brown' },
        coffee: { type: 'coffee' },
    };

    Object.keys(configs).forEach((key) => {
        const chain = buildSoundChain(audioCtx, configs[key].type);
        // Connect gain to master
        chain.gainNode.connect(masterGainNode);
        sounds[key] = chain;
        // Update status
        statusEls[key].textContent = '⏸';
        statusEls[key].classList.remove('active');
    });
}

// ----- Start / Stop All -----
function startAllSounds() {
    const now = audioCtx.currentTime;
    Object.keys(sounds).forEach((key) => {
        const chain = sounds[key];
        if (!chain.started) {
            chain.source.start(0);
            chain.started = true;
        }
        // Set gain from slider
        const val = parseFloat(sliders[key].value);
        chain.gainNode.gain.setValueAtTime(val, now);
        statusEls[key].textContent = '▶';
        statusEls[key].classList.add('active');
    });
    isPlaying = true;
    playBtn.textContent = '⏹ Stop';
    playBtn.classList.add('playing');
}

function stopAllSounds() {
    Object.keys(sounds).forEach((key) => {
        const chain = sounds[key];
        if (chain.started) {
            chain.source.stop(0);
            chain.started = false;
        }
        chain.gainNode.gain.value = 0;
        statusEls[key].textContent = '⏸';
        statusEls[key].classList.remove('active');
    });
    isPlaying = false;
    playBtn.textContent = '▶ Play';
    playBtn.classList.remove('playing');
}

// ----- Rebuild after stop (because source can't be restarted) -----
function rebuildAndPlay() {
    if (!audioCtx) return;
    // Clean up old sounds
    Object.keys(sounds).forEach((key) => {
        try {
            sounds[key].source.disconnect();
            sounds[key].gainNode.disconnect();
            if (sounds[key].filterNode) sounds[key].filterNode.disconnect();
            sounds[key].extraNodes?.forEach(n => n.disconnect());
        } catch (e) {}
    });

    // Re-init
    initSounds();
    // Start with current slider values
    Object.keys(sliders).forEach((key) => {
        const val = parseFloat(sliders[key].value);
        sounds[key].gainNode.gain.value = val;
        if (val > 0) {
            statusEls[key].textContent = '▶';
            statusEls[key].classList.add('active');
        }
    });
    isPlaying = true;
    playBtn.textContent = '⏹ Stop';
    playBtn.classList.add('playing');
}

// ----- Toggle Play -----
function togglePlay() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = parseFloat(masterGainSlider.value);
        masterGainNode.connect(audioCtx.destination);
        initSounds();
    }

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (isPlaying) {
        stopAllSounds();
        // Reset sources so they can be restarted
        Object.keys(sounds).forEach((key) => {
            const chain = sounds[key];
            if (chain.source) {
                try { chain.source.stop(0); } catch (e) {}
                chain.source = null;
            }
        });
        // Rebuild sources
        Object.keys(sounds).forEach((key) => {
            const config = { white: 'white', pink: 'pink', brown: 'brown', coffee: 'coffee' };
            const type = key === 'rain' ? 'white' : key === 'ocean' ? 'pink' : key === 'fireplace' ? 'brown' : 'coffee';
            const newChain = buildSoundChain(audioCtx, type);
            newChain.gainNode.connect(masterGainNode);
            // copy gain value
            const val = parseFloat(sliders[key].value);
            newChain.gainNode.gain.value = val;
            // replace
            sounds[key] = newChain;
            statusEls[key].textContent = '⏸';
            statusEls[key].classList.remove('active');
        });
        isPlaying = false;
        playBtn.textContent = '▶ Play';
        playBtn.classList.remove('playing');
        return;
    }

    // Start playing
    startAllSounds();
}

// ----- Slider Events -----
Object.keys(sliders).forEach((key) => {
    sliders[key].addEventListener('input', () => {
        const val = parseFloat(sliders[key].value);
        if (sounds[key] && isPlaying) {
            sounds[key].gainNode.gain.setValueAtTime(val, audioCtx.currentTime);
        }
        // If not playing but we have a chain, still update the value for when it starts
        if (sounds[key]) {
            sounds[key].gainNode.gain.value = val;
        }
        if (val > 0 && isPlaying) {
            statusEls[key].textContent = '▶';
            statusEls[key].classList.add('active');
        } else if (val === 0 && isPlaying) {
            statusEls[key].textContent = '⏸';
            statusEls[key].classList.remove('active');
        }
    });
});

// ----- Master Volume -----
masterGainSlider.addEventListener('input', () => {
    if (masterGainNode) {
        masterGainNode.gain.value = parseFloat(masterGainSlider.value);
    }
});

// ----- Play Button -----
playBtn.addEventListener('click', togglePlay);

// ----- Visualizer (Analyser Node) -----
let analyser = null;

function setupVisualizer() {
    if (!audioCtx) return;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    // We connect master gain to analyser, but we already have masterGainNode connected to destination.
    // We'll create a separate connection for visualization.
    // Actually, we can connect a new gain node or just use an AnalyserNode in parallel.
    // Let's create an analyser and connect masterGainNode to it, and then to destination.
    // But we already have masterGainNode connected to destination. We'll disconnect and reconnect.
    if (masterGainNode) {
        masterGainNode.disconnect();
        masterGainNode.connect(analyser);
        analyser.connect(audioCtx.destination);
    }
}

// Override init to include analyser
const originalInit = initSounds;
initSounds = function() {
    if (!audioCtx) return;
    if (!analyser) {
        setupVisualizer();
    }
    originalInit.call(this);
};

// Draw visualizer
function drawVisualizer() {
    if (!analyser) {
        requestAnimationFrame(drawVisualizer);
        return;
    }
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = (width / dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i] / 255;
        const barHeight = value * height * 0.9;
        const hue = 200 + value * 40;
        ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
    requestAnimationFrame(drawVisualizer);
}

// Handle resize for canvas
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(1, 1);
}
window.addEventListener('resize', resizeCanvas);

// ---- Start visualizer loop ----
resizeCanvas();
drawVisualizer();

// ---- Autoplay policy: need user gesture. Clicking play handles it.
console.log('Ambient Sound Mixer ready! Click Play to start.');
