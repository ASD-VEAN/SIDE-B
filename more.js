DOM.more.open.addEventListener("click", e => {
    updateMoreInfo();
        DOM.more.popup.classList.remove("hidden");
});
document.getElementById("close-more").addEventListener("click", e => {
        DOM.more.popup.classList.add("hidden");
});
DOM.more.popup.addEventListener("click", e => {
    if (e.target === DOM.more.popup) {
        DOM.more.popup.classList.add("hidden");
    }
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        DOM.more.popup.classList.add("hidden");
    }
});

/* =========================
   SLEEP TIMER
========================= */

let sleepEnabled = false;
let sleepTimeout = null;

const button = document.getElementById("sleep-timer");
const options = document.getElementById("sleep-options");
const input = document.getElementById("sleep-minutes");
const status = document.getElementById("sleep-status");
const label = document.getElementById("sleep-label");
const customRadio = document.querySelector('input[value="custom"]');
const radios = document.querySelectorAll('input[name="sleep"]');

radios.forEach(radio => {
    radio.addEventListener("change", () => {
        input.classList.toggle("hidden", radio.value !== "custom");
        updateSleepLabel();
        if (sleepEnabled) startSleepTimer();
    });
});

input.addEventListener("input", () => {
    if (sleepEnabled) startSleepTimer();
});

button.addEventListener("click", e => {
    if (e.target === input) return;

    sleepEnabled = !sleepEnabled;
    options.classList.toggle("hidden", !sleepEnabled);
    button.classList.toggle("border-main", sleepEnabled);
    updateSleepLabel();

    if (sleepEnabled)
        startSleepTimer();
    else
        cancelSleepTimer();
});

function startSleepTimer() {
    clearTimeout(sleepTimeout);
    sleepTimeout = null;
    audio.removeEventListener("ended", endSongSleep);
    
    const value = document.querySelector('input[name="sleep"]:checked').value;

    if (value === "end") {
        audio.addEventListener("ended", endSongSleep, { once: true });
        return;
    }

    const minutes = value === "custom"
        ? Number(input.value)
        : Number(value);

    sleepTimeout = setTimeout(() => {
        audio.pause();
        disableSleepTimer();
    }, minutes * 60000);
}

function endSongSleep() {
    audio.pause();
    disableSleepTimer();
}

function disableSleepTimer() {
    sleepEnabled = false;
    clearTimeout(sleepTimeout);
    audio.removeEventListener("ended", endSongSleep);
    button.classList.remove("border-main");
    options.classList.add("hidden");
    updateSleepLabel();
}

function cancelSleepTimer() {
    clearTimeout(sleepTimeout);
    audio.removeEventListener("ended", endSongSleep);
}

function updateSleepLabel() {
    if (!sleepEnabled) {
        label.textContent = "⋆☽ SLEEP TIMER [OFF]";
        status.textContent = "Disabled";
        return;
    }

    const value = document.querySelector('input[name="sleep"]:checked').value;

    if (value === "end") {
        label.textContent = "⋆☽ SLEEP TIMER [END OF SONG]";
        status.textContent = "Stops after this track";
        return;
    }

    const minutes = value === "custom" ? input.value : value;
    label.textContent = `⋆☽ SLEEP TIMER [${minutes} MIN]`;
    status.textContent = `Will stop in ${minutes} minute${minutes == 1 ? "" : "s"}`;
}

/* =========================
   SPEED
========================= */

const speedSelect = document.getElementById("speed-select");

speedSelect.addEventListener("change", () => {
    switch (speedSelect.value) {
        case "0.5":
            audio.playbackRate = 0.5;
            break;

        case "0.75":
            audio.playbackRate = 0.75;
            break;

        case "1":
            audio.playbackRate = 1;
            break;

        case "1.25":
            audio.playbackRate = 1.25;
            break;

        case "1.5":
            audio.playbackRate = 1.5;
            break;

        case "2":
            audio.playbackRate = 2;
            break;

        default:
            audio.playbackRate = 1;
    }
});

/* =========================
   VISUALIZER
========================= */

// ---- state ----
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let gainNode = null;
let visRunning = false;
let visAnimationId = null;
let stickmanEnabled = false;
let danceTime = 0;
let lastFrameTime = 0;

// ---- dom refs ----
const visPopup = document.getElementById("visualizer-popup");
const visWindow = document.getElementById("visualizer-window");
const visTitlebar = document.getElementById("visualizer-titlebar");
const visCanvas = document.getElementById("visualizer-canvas");
const visClose = document.getElementById("closeVisualizer");
const stickmanToggle = document.getElementById("toggleStickman");
const visCtx = visCanvas.getContext("2d");

/* =========================
   AUDIO GRAPH & EQ PIPELINE
========================= */

function resizeCanvas() {
    if (!visCanvas) return;

    // Measure the actual visible pixel width and height of the canvas element
    const rectWidth = visCanvas.clientWidth;
    const rectHeight = visCanvas.clientHeight;
    
    // Fallback if the canvas isn't rendered/visible yet
    if (rectWidth === 0 || rectHeight === 0) return;

    const dpr = window.devicePixelRatio || 1;

    // Set internal buffer size accounting for DPR
    visCanvas.width = rectWidth * dpr;
    visCanvas.height = rectHeight * dpr;

    if (visCtx) {
        visCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform matrix
        visCtx.scale(dpr, dpr);                // Scale for high-DPI displays
    }
}
const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let currentGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let filtersStage1 = [];
let filtersStage2 = [];
let customPresets = {};

const PRESETS = {
    reset:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    jazz:       [8, 6, 2, 4, -5, -5, 0, 2, 6, 8],
    class:      [10, 8, 6, 4, -3, -3, 0, 4, 8, 8],
    hiphop:     [12, 10, 4, 0, -5, -5, 2, -2, 6, 8],
    rock:       [10, 6, -3, -8, 0, 4, 8, 10, 10, 10],
    metal:      [8, 6, 0, -5, -5, 2, 8, 12, 10, 8],
    dreamy:     [-5, -3, 2, 6, 8, 8, 4, -3, -8, -12],
    muted:      [-12, -10, -8, -6, -6, -6, -8, -10, -12, -16],
    loud:       [12, 8, 2, 0, -3, 0, 4, 10, 12, 14],
    sludgeFuzz: [10, 8, 4, -2, -5, 0, 4, 8, 5, 2],
    amRadio:    [-12, -12, -10, 4, 9, 10, 7, 2, -12, -12],
    vSmiley:    [12, 9, 5, 0, -8, -8, 0, 5, 9, 12]
};


function loadSettings() {
    try {
        if (typeof settings !== 'undefined') {
            if (Array.isArray(settings.gains) && settings.gains.length === 10) {
                currentGains = [...settings.gains];
            }
            if (settings.customPresets && typeof settings.customPresets === 'object') {
                customPresets = settings.customPresets;
            }
        } else {
            const stored = localStorage.getItem("eq_custom_presets");
            if (stored) {
                customPresets = JSON.parse(stored);
            }
        }
    } catch (err) {
        console.warn("Couldn't load settings, falling back to defaults.", err);
    }
    
    renderPresetSelector();
}
function renderPresetSelector() {
const selectContainer = document.getElementById("eq-preset-select");
if (selectContainer && selectContainer.tagName === "SELECT") {
    selectContainer.addEventListener("change", (e) => {
        if (e.target.value) {
            applyPreset(e.target.value);
        }
    });
}
    const listContainer = document.getElementById("eq-custom-presets-list") || selectContainer;
    
    if (!listContainer) return;

    // Handle standard <select> dropdowns
    if (listContainer.tagName === "SELECT") {
        // Keep built-in options, rebuild custom ones
        const customOptGroup = listContainer.querySelector('optgroup[label="Custom"]') || document.createElement("optgroup");
        customOptGroup.label = "Custom";
        customOptGroup.innerHTML = "";

        const keys = Object.keys(customPresets || {});
        if (keys.length === 0) {
            customOptGroup.innerHTML = `<option disabled>No custom presets</option>`;
        } else {
            keys.forEach(name => {
                const opt = document.createElement("option");
                opt.value = `custom_${name}`;
                opt.textContent = `★ ${name.toUpperCase()}`;
                customOptGroup.appendChild(opt);
            });
        }
        if (!listContainer.contains(customOptGroup)) {
            listContainer.appendChild(customOptGroup);
        }
        return;
    }

    // Handle custom HTML container (<div>) with buttons + delete options
    listContainer.innerHTML = "";
    const customKeys = Object.keys(customPresets || {});

    if (customKeys.length === 0) {
        listContainer.innerHTML = `<span class="text-xs opacity-50 col-span-full">No custom presets saved.</span>`;
        return;
    }

    customKeys.forEach(name => {
        const btnGroup = document.createElement("div");
        btnGroup.className = "flex items-center justify-between border border-main bg-main/10 hover:bg-main/20 transition-colors w-full cursor-pointer";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = `★ ${name.toUpperCase()}`;
        btn.className = "px-2 py-1 text-xs font-mono text-left truncate flex-grow cursor-pointer";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyPreset(`custom_${name}`);
        });

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "×";
        delBtn.title = "Delete Preset";
        delBtn.className = "px-2 py-1 text-xs font-mono text-red-400 hover:bg-red-500 hover:text-white transition-colors border-l border-main/30 cursor-pointer";

        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (confirm(`Delete preset "${name}"?`)) {
                deleteCustomPreset(name);
            }
        });

        btnGroup.appendChild(btn);
        btnGroup.appendChild(delBtn);
        listContainer.appendChild(btnGroup);
    });
}
function setupAudioPipeline(audioElement) {
    // 1. Dynamic query to locate the actual DOM audio element
    const targetAudio = audioElement
        || window.audio
        || (typeof DOM !== 'undefined' && DOM.audio)
        || document.querySelector('audio')
        || document.getElementById('audio');

    if (!targetAudio) {
        // Suppress warning if audio element is just delayed in loading
        return;
    }

    // 2. Initialize AudioContext (module-scope var — see declarations above,
    // this is what drawVisualizer()/drawCurve()/the EQ popup handler read)
    if (!audioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioCtxClass();
    }

    // 3. Prevent duplicate node creation
    if (sourceNode) return;

    try {
        sourceNode = audioCtx.createMediaElementSource(targetAudio);
    } catch (err) {
        console.warn("MediaElementSource already attached or failed:", err);
        return;
    }

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = 1;

    loadSettings();

    filtersStage1 = [];
    filtersStage2 = [];

    let prevNode = sourceNode;

    BANDS.forEach((freq, i) => {
        const gainVal = currentGains[i] !== undefined ? currentGains[i] : 0;

        const f1 = audioCtx.createBiquadFilter();
        f1.type = i === 0 ? "lowshelf" : i === BANDS.length - 1 ? "highshelf" : "peaking";
        f1.frequency.value = freq;
        f1.gain.value = gainVal / 2;

        const f2 = audioCtx.createBiquadFilter();
        f2.type = f1.type;
        f2.frequency.value = freq;
        f2.gain.value = gainVal / 2;

        prevNode.connect(f1);
        f1.connect(f2);
        prevNode = f2;

        filtersStage1.push(f1);
        filtersStage2.push(f2);
    });

    prevNode.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(audioCtx.destination);
}
function initAudioGraph() {
    const targetAudio = window.audio
        || (typeof DOM !== 'undefined' && DOM.audio)
        || document.querySelector('audio');

    setupAudioPipeline(targetAudio);
}

function saveSettings() {
    try {
        if (typeof settings !== 'undefined') {
            settings.gains = currentGains;
            settings.customPresets = customPresets;
            if (typeof persistSettings === 'function') {
                persistSettings();
            }
        }
    } catch (err) {
        console.error("Failed saving settings:", err);
    }
}
function applyPreset(presetKey) {
    let gains = null;

    if (presetKey.startsWith("custom_")) {
        const actualName = presetKey.replace("custom_", "").trim().toLowerCase();
        gains = customPresets[actualName];
    } else {
        gains = PRESETS[presetKey];
    }

    if (!gains || !Array.isArray(gains)) {
        console.warn(`No valid gains found for preset: ${presetKey}`);
        return;
    }

    currentGains = [...gains];
    saveSettings();

    const sliders = document.querySelectorAll('.eq-slider');
    sliders.forEach((slider, i) => {
        const gain = gains[i] ?? 0;
        slider.value = gain;

        if (filtersStage1[i] && filtersStage2[i]) {
            filtersStage1[i].gain.value = gain / 2;
            filtersStage2[i].gain.value = gain / 2;
        }

        const label = slider.parentElement?.querySelector('.gain-val');
        if (label) {
            label.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
        }
    });

    if (typeof drawCurve === "function") {
        drawCurve();
    }
}
function saveCustomPreset(presetName) {
    if (!presetName || !presetName.trim()) return;

    const cleanName = presetName.trim().toLowerCase();

    if (typeof PRESETS !== "undefined" && PRESETS[cleanName]) {
        alert("Cannot overwrite built-in presets.");
        return;
    }

    if (!customPresets) customPresets = {};

    const sliders = document.querySelectorAll('.eq-slider');
    if (sliders.length > 0) {
        currentGains = Array.from(sliders).map(s => parseFloat(s.value) || 0);
    }

    customPresets[cleanName] = [...currentGains];
    saveSettings();

    renderPresetSelector();
    applyPreset(`custom_${cleanName}`);
}
function deleteCustomPreset(presetName) {
    const cleanName = presetName.trim().toLowerCase();
    if (customPresets[cleanName]) {
        delete customPresets[cleanName];
        saveSettings();
        renderPresetSelector();
    }
}

function renderSliders() {
    const container = document.getElementById('eq-sliders');
    if (!container) return;
    container.innerHTML = '';

    BANDS.forEach((freq, index) => {
        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
        const wrapper = document.createElement('div');
        wrapper.className = "flex flex-col items-center justify-between h-full py-1";

        wrapper.innerHTML = `
            <span class="text-[10px] text-main font-mono">${label}</span>
            <input type="range" min="-24" max="24" value="${currentGains[index]}" step="0.5" data-index="${index}" style="writing-mode: vertical-lr; direction: rtl;" class="eq-slider h-28 w-3 cursor-pointer accent-main bg-transparent">
            <span class="text-[9px] font-mono gain-val">${currentGains[index] > 0 ? '+' : ''}${currentGains[index]}dB</span>
        `;

        const slider = wrapper.querySelector('input');
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            currentGains[index] = val;

            if (filtersStage1[index] && filtersStage2[index]) {
                filtersStage1[index].gain.value = val / 2;
                filtersStage2[index].gain.value = val / 2;
            }

            wrapper.querySelector('.gain-val').textContent = `${val > 0 ? '+' : ''}${val}dB`;
            drawCurve();
            saveSettings();
        });

        container.appendChild(wrapper);
    });
}
function drawCurve() {
    const canvas = document.getElementById('eq-canvas');
    const container = document.getElementById('eq-sliders');
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = container.offsetWidth * dpr;
    canvas.height = container.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const width = container.offsetWidth;
    const height = container.offsetHeight;
    ctx.clearRect(0, 0, width, height);

    const sliders = container.querySelectorAll('.eq-slider');
    if (!sliders.length) return;

    const containerRect = container.getBoundingClientRect();

    const points = Array.from(sliders).map((slider, i) => {
        const rect = slider.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) - containerRect.left;
        const gain = currentGains[i];
        const pct = (gain - (-24)) / 48;
        const trackHeight = rect.height;
        const y = (rect.top - containerRect.top) + (trackHeight * (1 - pct));

        return { x, y };
    });

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

    const color = getComputedStyle(document.documentElement).getPropertyValue('--main').trim() || '#00ffcc';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
}

/* =========================
   INITIALIZATION & EVENTS
========================= */

document.addEventListener("DOMContentLoaded", async () => {
    loadSettings();
    renderPresetSelector();
    renderSliders();
    drawCurve();

    // Preset button click delegation
    document.addEventListener("click", (e) => {
        const btn = e.target.closest('[id^="eq-btn-"], [id^="eq-"]');
        if (btn && !btn.dataset.handled && btn.id !== 'eq-sliders' && btn.id !== 'eq-canvas') {
            const presetKey = btn.id.replace(/^eq-(btn-)?/, '');
            if (PRESETS[presetKey] || presetKey.startsWith('custom_')) {
                applyPreset(presetKey);
            }
        }
    });

    // Save Preset Action
    const saveBtn = document.getElementById("save-preset-btn");
    const nameInput = document.getElementById("new-preset-name");
    if (saveBtn && nameInput) {
        saveBtn.addEventListener("click", () => {
            saveCustomPreset(nameInput.value);
            nameInput.value = "";
        });
    }

    // Modal / Popup Handlers
    const eqBtn = DOM?.more?.eq || document.getElementById("eq-btn");
    if (eqBtn) {
        eqBtn.addEventListener("click", () => {
            document.getElementById("eq-popup")?.classList.remove("hidden");

            loadSettings();

            if (typeof audioCtx === 'undefined' || !audioCtx) {
                setupAudioPipeline(window.audio);
            } else if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            requestAnimationFrame(() => requestAnimationFrame(drawCurve));
        });
    }

    document.getElementById("close-eq")?.addEventListener("click", () => {
        document.getElementById("eq-popup")?.classList.add("hidden");
    });
});

window.addEventListener('resize', drawCurve);

/* =========================
   FREQUENCY BAND ANALYSIS
========================= */

function getFrequencyBands(freqData) {

    const nyquist = audioCtx.sampleRate / 2;
    const binHz = nyquist / freqData.length;

    const ranges = {
        bass: [20, 250],
        mid: [250, 4000],
        treble: [4000, nyquist]
    };

    const bands = {};

    for (const name in ranges) {

        const [lo, hi] = ranges[name];

        const startBin = Math.max(0, Math.floor(lo / binHz));
        const endBin = Math.min(freqData.length - 1, Math.floor(hi / binHz));

        let sum = 0;
        let count = 0;

        for (let i = startBin; i <= endBin; i++) {
            sum += freqData[i];
            count++;
        }

        bands[name] = count ? (sum / count) / 255 : 0;

    }

    return bands;

}

/* =========================
   DRAWING — HUD ELEMENTS
========================= */

function drawGrid(color, w, h) {

    visCtx.strokeStyle = color;
    visCtx.globalAlpha = 0.12;
    visCtx.lineWidth = 1;
    visCtx.shadowBlur = 0;

    const step = 24;

    visCtx.beginPath();

    for (let x = 0; x < w; x += step) {
        visCtx.moveTo(x, 0);
        visCtx.lineTo(x, h);
    }

    for (let y = 0; y < h; y += step) {
        visCtx.moveTo(0, y);
        visCtx.lineTo(w, y);
    }

    visCtx.stroke();
    visCtx.globalAlpha = 1;

}
function drawCornerBrackets(color, w, h) {

    const size = 18;

    visCtx.strokeStyle = color;
    visCtx.lineWidth = 2;
    visCtx.shadowColor = color;
    visCtx.shadowBlur = 4;

    const corners = [
        [[4, size], [4, 4], [size, 4]],
        [[w - size, 4], [w - 4, 4], [w - 4, size]],
        [[4, h - size], [4, h - 4], [size, h - 4]],
        [[w - size, h - 4], [w - 4, h - 4], [w - 4, h - size]]
    ];

    corners.forEach(points => {
        visCtx.beginPath();
        visCtx.moveTo(points[0][0], points[0][1]);
        points.forEach(p => visCtx.lineTo(p[0], p[1]));
        visCtx.stroke();
    });

}
function drawScanline(color, w, h) {

    const x = (Date.now() / 8) % w;

    const gradient = visCtx.createLinearGradient(x - 40, 0, x, 0);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(1, color);

    visCtx.fillStyle = gradient;
    visCtx.globalAlpha = 0.15;
    visCtx.shadowBlur = 0;
    visCtx.fillRect(x - 40, 0, 40, h);
    visCtx.globalAlpha = 1;

}
function drawLabels(color, bands, w) {

    visCtx.shadowBlur = 0;
    visCtx.fillStyle = color;
    visCtx.font = "12px monospace";
    visCtx.textAlign = "left";

    visCtx.fillText("‣ AUDIO TELEMETRY", 26, 20);
    visCtx.fillText(`SR: ${Math.round(audioCtx.sampleRate)}Hz`, 26, 34);

    visCtx.textAlign = "right";

    const peak = Math.max(bands.bass, bands.mid, bands.treble);
    visCtx.fillText(`PEAK: ${Math.round(peak * 100)}%`, w - 26, 20);

    visCtx.textAlign = "left";

}
function drawBandMeters(color, bands, w, h) {

    const meters = [
        { label: "BASS", value: bands.bass },
        { label: "MID", value: bands.mid },
        { label: "TREB", value: bands.treble }
    ];

    const meterWidth = 14;
    const gap = 6;
    const startX = w - (meterWidth + gap) * meters.length - 16;
    const bottom = h - 30;
    const maxHeight = h - 60;

    meters.forEach((meter, index) => {

        const x = startX + index * (meterWidth + gap);
        const litHeight = meter.value * maxHeight;

        visCtx.shadowColor = color;
        visCtx.shadowBlur = 5;
        visCtx.fillStyle = color;
        visCtx.fillRect(x, bottom - litHeight, meterWidth, litHeight);

        visCtx.strokeStyle = color;
        visCtx.shadowBlur = 0;
        visCtx.strokeRect(x, bottom - maxHeight, meterWidth, maxHeight);

        visCtx.font = "9px monospace";
        visCtx.textAlign = "center";
        visCtx.fillText(meter.label, x + meterWidth / 2, bottom + 12);

    });

    visCtx.textAlign = "left";

}
function drawWaveform(color, timeData, w, h) {

    visCtx.strokeStyle = color;
    visCtx.shadowColor = color;
    visCtx.shadowBlur = 6;
    visCtx.lineWidth = 2;
    visCtx.beginPath();

    const sliceWidth = w / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {

        const amplitude = (timeData[i] - 128) / 128;
        const y = h / 2 + amplitude * (h / 3);

        if (i === 0)
            visCtx.moveTo(x, y);
        else
            visCtx.lineTo(x, y);

        x += sliceWidth;

    }

    visCtx.stroke();

}

/* =========================
   ENERGY REACTIVITY
========================= */

let smoothEnergy = 0;
let bassPunch = 0;
let midPunch = 0;
let treblePunch = 0;

let headbangPos = 0;
let headbangVel = 0;
let headbangOnsetPrev = 0;
let longTermEnergy = 0;   
let dropCooldown = 0;     
let windmillTimer = 0;    
let windmillAngle = 0;

function updateSmoothEnergy(bands) {
    const level = (bands.bass + bands.mid + bands.treble) / 3;
    smoothEnergy += (level - smoothEnergy) * 0.04;
    return smoothEnergy;
}
function updatePunchEnvelopes(bands) {
    bassPunch = Math.max(bands.bass, bassPunch - 0.035);
    midPunch = Math.max(bands.mid, midPunch - 0.035);
    treblePunch = Math.max(bands.treble, treblePunch - 0.035);
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function detectBeatDrop(dt, overallEnergy) {

    longTermEnergy += (overallEnergy - longTermEnergy) * clamp(dt / 2, 0, 1);

    dropCooldown = Math.max(0, dropCooldown - dt);

    if (windmillTimer > 0) {
        windmillTimer -= dt;
        return true;
    }

    const spikedHard = overallEnergy > longTermEnergy * 1.8 + 0.12;

    if (dropCooldown <= 0 && spikedHard) {
        windmillTimer = 3.5;
        dropCooldown = 8;
        return true;
    }

    return false;
}

/* =========================
   DANCE STYLE / PLAYBACK STATE
========================= */

let pauseStartTime = null;

function getPlaybackState() {

    if (audio.paused) {

        if (pauseStartTime === null)
            pauseStartTime = Date.now();

        const pausedFor = (Date.now() - pauseStartTime) / 1000;

        return pausedFor > 4 ? "sleeping" : "idle";

    }

    pauseStartTime = null;

    return "dancing";

}
function detectDanceStyle() {

    const song = currentLibrary?.[currentSongIndex];
    const genres = song?.musicbrainz?.genres ?? [];
    const genreString = genres.join(" ").toLowerCase();

    if (/metal|punk|hardcore|grunge|thrash/.test(genreString))
        return "headbang";

    if (/electronic|house|techno|edm|trance|dubstep|drum and bass/.test(genreString))
        return "rave";

    if (/jazz|classical|blues|ambient|acoustic|soul/.test(genreString))
        return "sway";

    return "groove";

}

/* =========================
   DRAWING — STICKMAN POSES
========================= */

function drawIdle(color, w, h, asleep, dt) {

    const wallX = w * 0.78;
    const groundY = h - 40;

    visCtx.strokeStyle = color;
    visCtx.shadowColor = color;
    visCtx.shadowBlur = 6;
    visCtx.lineWidth = 3;

    visCtx.globalAlpha = 0.5;
    visCtx.beginPath();
    visCtx.moveTo(wallX, groundY - 130);
    visCtx.lineTo(wallX, groundY);
    visCtx.stroke();
    visCtx.globalAlpha = 1;

    const breathe = Math.sin(danceTime) * 2;
    danceTime += dt * 3;

    if (!asleep) {

        const shoulderX = wallX - 2;
        const shoulderY = groundY - 108 + breathe;

        const hipX = wallX - 22;
        const hipY = groundY - 50;

        const headX = wallX - 5;
        const headY = shoulderY - 15;

        visCtx.beginPath();
        visCtx.arc(headX, headY, 11, 0, Math.PI * 2);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(shoulderX, shoulderY);
        visCtx.lineTo(hipX, hipY);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(hipX, hipY);
        visCtx.lineTo(wallX - 4, groundY);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(hipX, hipY);
        visCtx.lineTo(hipX - 28, hipY + 18);
        visCtx.lineTo(hipX - 36, groundY);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(shoulderX, shoulderY + 14);
        visCtx.lineTo(hipX - 4, hipY - 8);
        visCtx.moveTo(shoulderX, shoulderY + 18);
        visCtx.lineTo(hipX + 6, hipY);
        visCtx.stroke();

    } else {

        const hipX = wallX - 10;
        const hipY = groundY - 20;
        const headX = hipX - 6;
        const headY = hipY - 34 + breathe;

        visCtx.beginPath();
        visCtx.arc(headX, headY, 11, 0, Math.PI * 2);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(headX + 2, headY + 10);
        visCtx.lineTo(hipX, hipY);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(hipX, hipY - 10);
        visCtx.lineTo(hipX - 20, hipY - 4);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(hipX, hipY);
        visCtx.lineTo(hipX - 22, hipY - 6);
        visCtx.lineTo(hipX - 30, groundY);
        visCtx.stroke();

        visCtx.shadowBlur = 0;
        visCtx.font = "14px monospace";
        visCtx.fillStyle = color;

        const t = (Date.now() / 800) % 3;

        for (let i = 0; i < 3; i++) {

            const zt = (t + i) % 3;
            const alpha = 1 - zt / 3;

            visCtx.globalAlpha = alpha;
            visCtx.fillText("Z", headX + 14 + zt * 8, headY - 10 - zt * 14);

        }

        visCtx.globalAlpha = 1;

    }

}

function drawHeadbang(color, bands, w, h, dt, bassPunch, speedFactor) {
    const onset = Math.max(0, bassPunch - headbangOnsetPrev);
    headbangOnsetPrev = bassPunch;
    const stiffness = 150;
    const damping = 24;  
    const kickPower = 220

    const springAccel = -headbangPos * stiffness - headbangVel * damping;
    headbangVel += springAccel * dt * speedFactor;
    headbangVel += onset * kickPower * speedFactor;
    headbangPos += headbangVel * dt * speedFactor;
    headbangPos = clamp(headbangPos, -0.2, 1.4);

    const throwPhase = Math.max(0, headbangPos);

    const centerX = w / 2;
    const groundY = h - 40;

    const headThrow = throwPhase * (12 + bassPunch * 42);
    const torsoLean = throwPhase * (5 + bassPunch * 10);
    const stanceBounce = throwPhase * (3 + bassPunch * 8);

    const hipY = groundY - 60 + throwPhase * 3;
    const neckX = centerX + torsoLean * 0.4;
    const neckY = hipY - 40;
    const headX = neckX + torsoLean;
    const headY = neckY - 14 + headThrow;

    visCtx.strokeStyle = color;
    visCtx.lineWidth = 3;
    visCtx.shadowColor = color;
    visCtx.shadowBlur = 8;

    visCtx.beginPath();
    visCtx.arc(headX, headY, 11, 0, Math.PI * 2);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(headX - 6, headY - 8);
    visCtx.lineTo(headX - 10, headY - 8 - headThrow * 0.8);
    visCtx.moveTo(headX + 6, headY - 8);
    visCtx.lineTo(headX + 10, headY - 8 - headThrow * 0.8);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(headX, headY + 12);
    visCtx.lineTo(neckX, neckY + 30);
    visCtx.lineTo(centerX, hipY);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(neckX, neckY + 34);
    visCtx.lineTo(neckX - 26, neckY + 10 - headThrow * 0.4);
    visCtx.moveTo(neckX, neckY + 34);
    visCtx.lineTo(neckX + 24, neckY + 44);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(centerX, hipY);
    visCtx.lineTo(centerX - 26, groundY - stanceBounce);
    visCtx.moveTo(centerX, hipY);
    visCtx.lineTo(centerX + 26, groundY - stanceBounce);
    visCtx.stroke();

}
function drawWindmillHeadbang(color, w, h, dt, bassPunch, speedFactor) {

    windmillAngle += dt * (7 + bassPunch * 9) * speedFactor;

    const centerX = w / 2;
    const groundY = h - 40;
    const hipY = groundY - 60;
    const neckX = centerX;
    const neckY = hipY - 40;
    const radius = 28 + bassPunch * 14;

    const headX = neckX + Math.sin(windmillAngle) * radius;
    const headY = neckY - Math.cos(windmillAngle) * radius;

    visCtx.strokeStyle = color;
    visCtx.shadowColor = color;
    visCtx.lineWidth = 3;

    for (let i = 5; i >= 1; i--) {
        const trailAngle = windmillAngle - i * 0.22;
        const tx = neckX + Math.sin(trailAngle) * radius;
        const ty = neckY - Math.cos(trailAngle) * radius;

        visCtx.globalAlpha = 0.12 * (6 - i);
        visCtx.shadowBlur = 4;
        visCtx.beginPath();
        visCtx.arc(tx, ty, 11, 0, Math.PI * 2);
        visCtx.stroke();
    }

    visCtx.globalAlpha = 1;
    visCtx.shadowBlur = 10;

    visCtx.beginPath();
    visCtx.moveTo(centerX, hipY);
    visCtx.lineTo(headX, headY);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.arc(headX, headY, 11, 0, Math.PI * 2);
    visCtx.stroke();

    const armSpread = 22 + bassPunch * 14;
    visCtx.beginPath();
    visCtx.moveTo(centerX, hipY - 30);
    visCtx.lineTo(centerX - Math.sin(windmillAngle) * armSpread, hipY - 10 + Math.cos(windmillAngle) * 10);
    visCtx.moveTo(centerX, hipY - 30);
    visCtx.lineTo(centerX + Math.sin(windmillAngle) * armSpread, hipY - 10 - Math.cos(windmillAngle) * 10);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(centerX, hipY);
    visCtx.lineTo(centerX - 24, groundY);
    visCtx.moveTo(centerX, hipY);
    visCtx.lineTo(centerX + 24, groundY);
    visCtx.stroke();

}

function drawRave(color, bands, w, h, dt, bassPunch, treblePunch, speedFactor) {

    danceTime += dt * 4 * speedFactor;

    const centerX = w / 2 + Math.sin(danceTime * 0.5) * (w * 0.18);
    const groundY = h - 40;

    const jump = (6 + bassPunch * 42) * Math.abs(Math.sin(danceTime * 1.5));

    const hipY = groundY - 60 - jump;
    const neckY = hipY - 40;
    const headY = neckY - 14;

    const kickL = Math.sin(danceTime * 3.1);
    const kickR = Math.sin(danceTime * 2.6 + 1.4);
    const armL = Math.sin(danceTime * 3.7 + 0.6);
    const armR = Math.sin(danceTime * 4.3 + 2.2);

    const armsUp = 20 + treblePunch * 48;
    const kickReach = 6 + bassPunch * 22;

    visCtx.strokeStyle = color;
    visCtx.lineWidth = 3;
    visCtx.shadowColor = color;
    visCtx.shadowBlur = 10;

    visCtx.beginPath();
    visCtx.arc(centerX, headY, 11, 0, Math.PI * 2);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(centerX, neckY + 12);
    visCtx.lineTo(centerX, hipY);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(centerX, neckY + 16);
    visCtx.lineTo(centerX - armsUp + armL * 22, neckY - 16 + armL * 12);
    visCtx.moveTo(centerX, neckY + 16);
    visCtx.lineTo(centerX + armsUp + armR * 22, neckY - 16 + armR * 12);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(centerX, hipY);
    visCtx.lineTo(centerX - 10 + kickL * kickReach, groundY);
    visCtx.moveTo(centerX, hipY);
    visCtx.lineTo(centerX + 10 + kickR * kickReach, groundY);
    visCtx.stroke();

}
function drawWaltz(color, w, h, dt, bassPunch, speedFactor) {

danceTime += dt * (1.1 + midPunch * 0.9) * speedFactor; 
visCtx.shadowBlur = 6 + treblePunch * 10;

    const centerX = w / 2;
    const groundY = h - 40;
    const bothBob = bassPunch * 10;
    const hipY = groundY - 60 + bothBob;
    const neckY = hipY - 40;
    const headY = neckY - 14;
    const angle = danceTime * 0.7;
const radius = 16 + bassPunch * 20;
const stepCycle = danceTime * (3 + midPunch * 2);
    const ax = centerX + Math.cos(angle) * radius;
    const bx = centerX - Math.cos(angle) * radius;

    visCtx.strokeStyle = color;
    visCtx.lineWidth = 3;
    visCtx.shadowColor = color;
    visCtx.shadowBlur = 6;

    function drawPartner(cx, stepOffset) {

        const lift = Math.max(0, Math.sin(stepCycle + stepOffset)) * (8 + midPunch * 10);

        visCtx.beginPath();
        visCtx.arc(cx, headY, 10, 0, Math.PI * 2);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(cx, headY + 11);
        visCtx.lineTo(cx, hipY);
        visCtx.stroke();

        visCtx.beginPath();
        visCtx.moveTo(cx, hipY);
        visCtx.lineTo(cx - 10, groundY - lift);
        visCtx.moveTo(cx, hipY);
        visCtx.lineTo(cx + 10, groundY - (8 - lift));
        visCtx.stroke();

    }

    drawPartner(ax, 0);
    drawPartner(bx, Math.PI);

    visCtx.beginPath();
    visCtx.moveTo(ax, neckY + 14);
    visCtx.lineTo(bx, neckY + 6);
    visCtx.moveTo(ax, neckY + 22);
    visCtx.lineTo(bx, neckY + 26);
    visCtx.stroke();

}
function drawGroove(color, bands, w, h, dt, bassPunch, midPunch, treblePunch, speedFactor) {

    danceTime += dt * 2.3 * speedFactor;

    const sway = Math.sin(danceTime) * (8 + midPunch * 28);
    const centerX = w / 2 + sway;
    const groundY = h - 40;

    const bob = Math.abs(Math.sin(danceTime * 2)) * (5 + bassPunch * 28);

    const hipY = groundY - 60 - bob;
    const neckY = hipY - 40;
    const headY = neckY - 14;

    const armPhase = Math.sin(danceTime * 2);
    const armReach = 14 + treblePunch * 42;
    const leftArmY = neckY + 10 - armPhase * armReach;
    const rightArmY = neckY + 10 + armPhase * armReach;

    const stepPhase = Math.sin(danceTime * 2 + Math.PI / 2);
    const stepReach = 5 + midPunch * 18;

    visCtx.strokeStyle = color;
    visCtx.lineWidth = 3;
    visCtx.shadowColor = color;
    visCtx.shadowBlur = 8;

    visCtx.beginPath();
    visCtx.arc(centerX + sway * 0.2, headY, 11, 0, Math.PI * 2);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(centerX, neckY + 12);
    visCtx.lineTo(centerX - sway * 0.3, hipY);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(centerX, neckY + 12);
    visCtx.lineTo(centerX - 26, leftArmY);
    visCtx.moveTo(centerX, neckY + 12);
    visCtx.lineTo(centerX + 26, rightArmY);
    visCtx.stroke();

    visCtx.beginPath();
    visCtx.moveTo(centerX - sway * 0.3, hipY);
    visCtx.lineTo(centerX - 16 - stepPhase * stepReach, groundY);
    visCtx.moveTo(centerX - sway * 0.3, hipY);
    visCtx.lineTo(centerX + 16 + stepPhase * stepReach, groundY);
    visCtx.stroke();

}

function drawStickman(color, bands, w, h, dt) {

    const state = getPlaybackState();

    if (state !== "dancing") {
        drawIdle(color, w, h, state === "sleeping", dt);
        return;
    }

    updatePunchEnvelopes(bands);

    const overallEnergy = updateSmoothEnergy(bands);

    const speedFactor = clamp(0.85 + overallEnergy * 0.6, 0.85, 1.5);

    switch (detectDanceStyle()) {

        case "headbang":
    if (detectBeatDrop(dt, overallEnergy)) {
        drawWindmillHeadbang(color, w, h, dt, bassPunch, speedFactor);
    } else {
        drawHeadbang(color, bands, w, h, dt, bassPunch, speedFactor);
    }
    break;

        case "rave":
            drawRave(color, bands, w, h, dt, bassPunch, treblePunch, speedFactor);
            break;

        case "sway":
            drawWaltz(color, w, h, dt, bassPunch, speedFactor);
            break;

        default:
            drawGroove(color, bands, w, h, dt, bassPunch, midPunch, treblePunch, speedFactor);

    }

}
/* =========================
   MAIN LOOP
========================= */

function drawVisualizer() {
    if (!visRunning) return;

    visAnimationId = requestAnimationFrame(drawVisualizer);

    if (!analyser || !audioCtx) {
        initAudioGraph();
        if (!analyser) return; 
    }

    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Get unscaled layout dimensions
    const rect = visWindow.getBoundingClientRect();
    const w = visCanvas.clientWidth;
    const h = visCanvas.clientHeight;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.fftSize);

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    const bands = getFrequencyBands(freqData);

    const mainColor =
        getComputedStyle(document.documentElement)
            .getPropertyValue("--main")
            .trim() || "#76CB65";

    // Clear using the layout width/height
    visCtx.clearRect(0, 0, w, h);

    drawGrid(mainColor, w, h);
    drawScanline(mainColor, w, h);
    drawCornerBrackets(mainColor, w, h);
    drawLabels(mainColor, bands, w);
    drawBandMeters(mainColor, bands, w, h);

    if (stickmanEnabled) {
        drawStickman(mainColor, bands, w, h, dt);
    } else {
        drawWaveform(mainColor, timeData, w, h);
    }
}
function startVisualizer() {
    initAudioGraph();

    if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
    }

    resizeCanvas();

    if (!visRunning) {
        visRunning = true;
        lastFrameTime = performance.now();
        drawVisualizer();
    }
}
function stopVisualizer() {

    visRunning = false;
    cancelAnimationFrame(visAnimationId);

}

/* =========================
   CONTROLS
========================= */

DOM.more.visualizer.addEventListener("click", () => {

    DOM.more.popup.classList.add("hidden");

    visPopup.classList.remove("hidden");

    startVisualizer();

});
visClose.addEventListener("click", () => {

    visPopup.classList.add("hidden");

    stopVisualizer();

});
stickmanToggle.addEventListener("click", () => {

    stickmanEnabled = !stickmanEnabled;

    stickmanToggle.classList.toggle("active", stickmanEnabled);
    stickmanToggle.textContent = stickmanEnabled ? "☺ DANCE [ON]" : "☺ DANCE";

});
window.addEventListener("resize", () => {

    if (!visPopup.classList.contains("hidden")) {
        resizeCanvas();
    }

});

new ResizeObserver(resizeCanvas).observe(visWindow);

/* =========================
   DRAG WINDOW
========================= */

let draggingVis = false;
let visOffsetX = 0;
let visOffsetY = 0;

visTitlebar.addEventListener("mousedown", e => {

    if (e.target.tagName === "BUTTON") return;

    draggingVis = true;

    visOffsetX = e.clientX - visWindow.offsetLeft;
    visOffsetY = e.clientY - visWindow.offsetTop;

});
document.addEventListener("mousemove", e => {

    if (!draggingVis) return;

    visWindow.style.left = `${e.clientX - visOffsetX}px`;
    visWindow.style.top = `${e.clientY - visOffsetY}px`;

});
document.addEventListener("mouseup", () => {

    draggingVis = false;

});
/* =========================
   EDIT
========================= */
const editPopup = document.getElementById("edit-popup");
const editSaveBtn = document.getElementById("edit-save");

const editInputs = {
    title:        document.getElementById("edit-title"),
    artist:       document.getElementById("edit-artist"),
    album:        document.getElementById("edit-album"),
    year:         document.getElementById("edit-year"),
    genre:        document.getElementById("edit-genre"),
    path:         document.getElementById("edit-path"),
    coverPreview: document.getElementById("edit-cover-preview"),
    coverInput:   document.getElementById("edit-cover-input")
};

let pendingCoverBlob = null;

document.getElementById("edit-info")?.addEventListener("click", () => {
    editPopup?.classList.remove("hidden");
    populateEditPopup();
});

document.getElementById("edit-close")?.addEventListener("click", closeEditPopup);

function closeEditPopup() {
    editPopup?.classList.add("hidden");
}

editInputs.coverPreview?.addEventListener("click", () => {
    editInputs.coverInput?.click();
});

editInputs.coverInput?.addEventListener("change", () => {
    const file = editInputs.coverInput.files?.[0];
    if (!file) return;
    pendingCoverBlob = file;
    if (editInputs.coverPreview.src.startsWith("blob:")) {
        URL.revokeObjectURL(editInputs.coverPreview.src);
    }
    editInputs.coverPreview.src = URL.createObjectURL(file);
});

function populateEditPopup() {
    const song = window.currentSong;
    if (!song) return;

    pendingCoverBlob = null;
    if (editInputs.coverInput) editInputs.coverInput.value = "";

    editInputs.title.value  = song.musicbrainz?.title  || song.title  || "";
    editInputs.artist.value = song.musicbrainz?.artist || song.artist || "";
    editInputs.album.value  = song.musicbrainz?.album  || song.album  || "";
    editInputs.year.value   = song.musicbrainz?.year   || song.year   || "";

    const rawGenre = song.musicbrainz?.genres || song.genre || "";
    editInputs.genre.value  = Array.isArray(rawGenre) ? rawGenre.join(", ") : rawGenre;
    editInputs.path.textContent = song.path || "Unknown";

    const currentTheme = themes[settings.theme]?.folder || "default";
    editInputs.coverPreview.src = song.cover || `imgs/${currentTheme}/music.png`;
}

function syncSongFromCache(song) {
    if (!song?.path) return;

    const pathKey = song.path.toLowerCase();
    const tagKey  = `${song.musicbrainz?.artist || song.artist}|${song.musicbrainz?.album || song.album}|${song.musicbrainz?.title || song.title}`.toLowerCase();

    const entry = musicbrainzCache[pathKey] || musicbrainzCache[tagKey];
    if (!entry) return;

    // Sync musicbrainz metadata
    if (entry.musicbrainz) {
        song.musicbrainz = entry.musicbrainz;
        song.title       = entry.musicbrainz.title   || song.title;
        song.artist      = entry.musicbrainz.artist  || song.artist;
        song.album       = entry.musicbrainz.album   || song.album;
        song.year        = entry.musicbrainz.year    || song.year;
    }

    // Sync lyrics
    if (entry.lyrics) {
        song.lyrics        = song.lyrics || {};
        song.lyrics.remote = entry.lyrics.remote ?? song.lyrics.remote;
        song.lyrics.synced = entry.lyrics.synced ?? song.lyrics.synced;

        // Re-parse synced lyrics into lines
        if (song.lyrics.synced && typeof parseLRC === "function") {
            song.lyrics.lines = parseLRC(song.lyrics.synced);
        }
    }

    // Sync cover
    if (entry.musicbrainz?.remoteCover) {
        song.cover = `file:///${entry.musicbrainz.remoteCover.replace(/\\/g, "/")}`;
    }

    // Sync favorite
    if (entry.favorite !== undefined) {
        song.favorite = entry.favorite;
    }
}

// ── IndexedDB cover store ─────────────────────────────────────────────────────
const DB_NAME    = "MusicPlayerDB";
const STORE_NAME = "covers";

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror  = () => reject(request.error);
    });
}

const CoverStore = {
    async setCover(pathKey, blob) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req   = store.put(blob, pathKey.toLowerCase());
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    },

    async getCoverURL(pathKey) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req   = store.get(pathKey.toLowerCase());
            req.onsuccess = () => {
                const blob = req.result;
                if (!blob) return resolve(null);
                resolve(URL.createObjectURL(blob));
            };
            req.onerror = () => reject(req.error);
        });
    },

    async removeCover(pathKey) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req   = store.delete(pathKey.toLowerCase());
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }
};

// ── Helper: build both cache keys for a song ─────────────────────────────────
function getCacheKeys(song) {
    const pathKey = (song.path || "").toLowerCase();
    const album   = song.musicbrainz?.album || song.album || "";
    const artist  = song.musicbrainz?.artist || song.artist || "";
    const title   = song.musicbrainz?.title  || song.title  || "";
    const tagKey  = `${artist}|${album}|${title}`.toLowerCase();
    return { pathKey, tagKey };
}

// ── Helper: write a cache entry to BOTH keys atomically ──────────────────────
function writeCacheEntry(song, patch) {
    const { pathKey, tagKey } = getCacheKeys(song);

    // Merge the patch on top of whatever exists for this song
    const existing = musicbrainzCache[pathKey] || musicbrainzCache[tagKey] || {};
    const merged   = { ...existing, ...patch };

    musicbrainzCache[pathKey] = merged;
    musicbrainzCache[tagKey]  = merged;

    window.api.saveCache(musicbrainzCache);
    return merged;
}

async function saveEditMetadata() {
    const song = window.currentSong;
    if (!song) return;

    const pathKey = (song.path || "").toLowerCase();

    // ── Cover ─────────────────────────────────────────────────────────────────
    if (pendingCoverBlob) {
        await CoverStore.setCover(pathKey, pendingCoverBlob);
        if (song.cover?.startsWith("blob:")) URL.revokeObjectURL(song.cover);
        song.cover = URL.createObjectURL(pendingCoverBlob);
    }

    // ── Metadata ──────────────────────────────────────────────────────────────
    const newTitle  = editInputs.title.value.trim()  || song.title  || "";
    const newArtist = editInputs.artist.value.trim() || song.artist || "";
    const newAlbum  = editInputs.album.value.trim()  || song.album  || "";
    const newYear   = editInputs.year.value.trim()   || song.year   || "";
    const newGenre  = editInputs.genre.value.trim()  || song.genre  || "";

    // Update the in-memory song object
    song.title  = newTitle;
    song.artist = newArtist;
    song.album  = newAlbum;
    song.year   = newYear;
    song.genre  = newGenre;

    song.musicbrainz = {
        ...(song.musicbrainz || {}),
        title:  newTitle,
        artist: newArtist,
        album:  newAlbum,
        year:   newYear,
        genre:  newGenre,
        genres: newGenre ? [newGenre] : (song.musicbrainz?.genres || [])
    };

    writeCacheEntry(song, {
        searched:       true,
        disabled:       musicbrainzCache[pathKey]?.disabled ?? false, // preserve
        musicbrainz:    song.musicbrainz,
        hasCustomCover: pendingCoverBlob
            ? true
            : (musicbrainzCache[pathKey]?.hasCustomCover || false),
        // lyrics intentionally NOT touched — edit popup doesn't change lyrics
    });

    // ── Update active player if this is the current song ─────────────────────
    if (window.currentSong?.path === song.path) {
        Object.assign(window.currentSong, {
            title:       song.title,
            artist:      song.artist,
            album:       song.album,
            year:        song.year,
            genre:       song.genre,
            cover:       song.cover,
            musicbrainz: song.musicbrainz
        });

        if (DOM?.miniPlayer?.title)  DOM.miniPlayer.title.textContent  = song.title;
        if (DOM?.miniPlayer?.artist) DOM.miniPlayer.artist.textContent = song.artist;
        if (DOM?.miniPlayer?.cover && song.cover) DOM.miniPlayer.cover.src = song.cover;
        if (DOM?.library?.cover && song.cover) {
            DOM.library.cover.innerHTML = `<img src="${song.cover}" class="w-full h-full object-cover">`;
        }
    }

        syncSongFromCache(song);
    if (typeof displaySongs === "function") displaySongs(currentLibrary);
    if (window.currentSong?.path === song.path) loadSong(song, false);
    closeEditPopup();
    console.log("[Edit] Saved metadata for:", pathKey);
}

editSaveBtn?.addEventListener("click", saveEditMetadata);

/* =======================================
   DISABLE & REFRESH METADATA FUNCTIONS
======================================= */

function disableMetadata(song) {
    if (!song?.path) return;
    delete song.musicbrainz;
    writeCacheEntry(song, {
        disabled:    true,
        searched:    true,
        musicbrainz: null
    });

    syncSongFromCache(song);
    displaySongs(currentLibrary);
    if (currentLibrary[currentSongIndex] === song) {
        loadSong(song, false);
    }
}

let currentSearchId = 0;

async function refreshMetadata(song, customQuery = null) {
    if (!song) return;

    const listContainer = document.getElementById("mbz-candidates-list");
    const popup         = document.getElementById("mbz-picker-popup");
    const searchInput   = document.getElementById("mbz-search-input");

    if (searchInput) {
        searchInput.value = customQuery || `${song.artist} ${song.title}`.trim();
    }

    listContainer.innerHTML = `<div class="text-center py-4">Searching MusicBrainz...</div>`;
    popup.classList.remove("hidden");

    const thisSearchId = ++currentSearchId;

    try {
        const searchTarget = customQuery
            ? { title: customQuery, artist: "", album: "" }
            : song;

        const candidates = await window.api.musicbrainzSearchCandidates(searchTarget);

        if (thisSearchId !== currentSearchId) return;

        if (!candidates?.length) {
            listContainer.innerHTML = `<div class="text-center py-4">No MusicBrainz matches found.</div>`;
            return;
        }

        listContainer.innerHTML = "";
        const fallbackCover = `imgs/${themes[settings.theme].folder}/music.png`;

        candidates.forEach(recording => {
            const artistName  = recording["artist-credit"]?.map(a => a.name).join(", ") || "Unknown Artist";
            const release     = recording.releases?.[0];
            const releaseTitle= release?.title || "Unknown Album";
            const year        = release?.date   || "N/A";
            const releaseId   = release?.id;
            const coverUrl    = releaseId
                ? `https://coverartarchive.org/release/${releaseId}/front-250`
                : fallbackCover;

            const card = document.createElement("div");
            card.className = "songbox p-2 hover:border-main cursor-pointer flex gap-3 items-center";
            card.innerHTML = `
                <img class="candidate-cover w-14 h-14 object-cover border-1 flex-shrink-0"
                     src="${coverUrl}" alt="Cover">
                <div class="flex flex-col flex-1 overflow-hidden">
                    <div class="flex justify-between font-bold truncate">
                        <span class="truncate">${recording.title}</span>
                        <span class="ml-2">Score: ${recording.realScore}</span>
                    </div>
                    <div class="text-xs opacity-80 truncate">Artist: ${artistName}</div>
                    <div class="text-xs opacity-80 truncate">Album: ${releaseTitle} (${year})</div>
                </div>
            `;

            const img = card.querySelector(".candidate-cover");
            img?.addEventListener("error", () => { img.src = fallbackCover; }, { once: true });

            card.addEventListener("click", async () => {
                listContainer.innerHTML = `<div class="text-center py-4 font-mono">Applying metadata...</div>`;
                await applySelectedMatch(song, recording);
                popup.classList.add("hidden");
            });

            listContainer.appendChild(card);
        });

    } catch (err) {
        if (thisSearchId === currentSearchId) {
            console.error("MusicBrainz search error:", err);
            listContainer.innerHTML = `<div class="text-center py-4 text-red-500">Error fetching matches.</div>`;
        }
    }
}

document.getElementById("mbz-search-btn")?.addEventListener("click", () => {
    const song  = currentLibrary[currentSongIndex];
    const query = document.getElementById("mbz-search-input")?.value.trim();
    if (song && query) refreshMetadata(song, query);
});

document.getElementById("mbz-search-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("mbz-search-btn")?.click();
});

async function applySelectedMatch(song, recording) {
    if (!song || !recording) return;

    const pathKey = (song.path || "").toLowerCase();

    await CoverStore.removeCover(pathKey);
    song.customCover = null;

    const artistName   = recording["artist-credit"]?.map(a => a.name).join(", ") || song.artist || "";
    const release      = recording.releases?.[0];
    const releaseTitle = release?.title   || song.album || "";
    const releaseId    = release?.id      || "";
    const recordingId  = recording.id     || "";
    const rawTags      = recording.tags?.map(t => t.name) || [];
    const genreString  = rawTags.join(",");

    let localCoverPath = "";
    if (releaseId) {
        try {
            const downloaded = await window.api.downloadCoverArt(releaseId);
            if (downloaded) localCoverPath = downloaded;
        } catch (err) {
            console.warn("[CoverArt] Download failed:", err);
        }
    }

    const mbData = {
        recordingId,
        releaseId,
        title:       recording.title || song.title || "",
        artist:      artistName,
        album:       releaseTitle,
        genres:      rawTags,
        remoteCover: localCoverPath || null,
        genre:       genreString
    };

    // Update in-memory song
    song.musicbrainz = mbData;
    song.title       = mbData.title;
    song.artist      = mbData.artist;
    song.album       = mbData.album;
    song.cover       = localCoverPath
        ? `file:///${localCoverPath.replace(/\\/g, "/")}`
        : `imgs/${themes[settings.theme].folder}/music.png`;

    // FIX: merge with existing entry — preserve lyrics, favorites, etc.
    writeCacheEntry(song, {
        searched:    true,
        disabled:    false, // re-enable since user explicitly chose a match
        musicbrainz: mbData
        // lyrics intentionally preserved from existing entry
    });

    syncSongFromCache(song);

if (window.currentSong?.path === song.path) {
    loadSong(song, false);
} else {
    displaySongs(currentLibrary);
}
}

document.getElementById("mbz-picker-close")?.addEventListener("click", () => {
    currentSearchId++;
    document.getElementById("mbz-picker-popup")?.classList.add("hidden");
});

/* =========================
   EDIT LYRICS
========================= */

document.getElementById("edit-lyrics")?.addEventListener("click", openEditLyricsModal);

document.getElementById("editlyrics-close")?.addEventListener("click", () => {
    document.getElementById("editlyrics-popup")?.classList.add("hidden");
});

function resolveLyrics(song) {
    if (!song) return { text: null, synced: null, lines: null, source: "none" };

    const l = song.lyrics || {};

    if (l.synced && l.synced.trim()) {
        return {
            text:   l.synced,
            synced: l.synced,
            lines:  (typeof parseLRC === "function") ? parseLRC(l.synced) : null,
            source: l.source === "manual" ? "manual" : "synced"
        };
    }

    if (l.remote && l.remote.trim()) {
        return {
            text:   l.remote,
            synced: null,
            lines:  null,
            source: l.source === "manual" ? "manual" : "remote"
        };
    }

    if (l.embedded && l.embedded.trim()) {
        return {
            text:   l.embedded,
            synced: null,
            lines:  null,
            source: "embedded"
        };
    }

    return { text: null, synced: null, lines: null, source: "none" };
}

function openEditLyricsModal() {
    const song = window.currentSong;
    if (!song) return;

    const popup       = document.getElementById("editlyrics-popup");
    const textarea    = document.getElementById("lyrics-editor-text");
    const searchInput = document.getElementById("lrclib-search-input");
    const resultsList = document.getElementById("lrclib-results-list");

    searchInput.value = `${song.artist} ${song.title}`.trim();
    resultsList.classList.add("hidden");
    resultsList.innerHTML = "";

    // Show whichever lyrics we have — prefer synced
    const existing = song.lyrics?.synced || song.lyrics?.remote || song.lyrics?.embedded || "";
    textarea.value = existing;

    popup.classList.remove("hidden");
}

document.getElementById("lrclib-search-btn")?.addEventListener("click", async () => {
    const query       = document.getElementById("lrclib-search-input")?.value.trim();
    const resultsList = document.getElementById("lrclib-results-list");
    const textarea    = document.getElementById("lyrics-editor-text");

    if (!query) return;

    resultsList.classList.remove("hidden");
    resultsList.innerHTML = `<div class="text-center py-2">Searching LRCLIB...</div>`;

    try {
        const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
        const data     = await response.json();

        if (!data?.length) {
            resultsList.innerHTML = `<div class="text-center py-2 opacity-70">No lyrics found on LRCLIB.</div>`;
            return;
        }

        resultsList.innerHTML = "";

        data.forEach(item => {
            const card      = document.createElement("div");
            card.className  = "p-2 border-1 cursor-pointer flex justify-between items-center mb-[5px]";
            const hasSynced = Boolean(item.syncedLyrics);

            card.innerHTML = `
                <div class="truncate">
                    <span class="font-bold">${item.trackName}</span>
                    <span class="opacity-70"> by ${item.artistName} (${item.albumName || "N/A"})</span>
                </div>
                <span class="p-[5px] border ${hasSynced ? "opacity-100" : "opacity-20"}">
                    ${hasSynced ? "SYNCED" : "PLAIN"}
                </span>
            `;

            card.addEventListener("click", () => {
                textarea.value = item.syncedLyrics || item.plainLyrics || "";
                resultsList.classList.add("hidden");
            });

            resultsList.appendChild(card);
        });

    } catch (err) {
        console.error("LRCLIB search error:", err);
        resultsList.innerHTML = `<div class="text-center py-2 text-red-500">Error fetching from LRCLIB.</div>`;
    }
});

document.getElementById("lyrics-save")?.addEventListener("click", () => {
    const song = window.currentSong;
    if (!song) return;

    const textarea = document.getElementById("lyrics-editor-text");
    const content  = textarea.value.trim();
    const isSynced = content.startsWith("[") && /\[\d{2}:\d{2}/.test(content);

    song.lyrics = song.lyrics || {};

    if (isSynced) {
        song.lyrics.synced = content;
        song.lyrics.remote = null;
        song.lyrics.lines  = typeof parseLRC === "function" ? parseLRC(content) : null;
    } else {
        song.lyrics.remote = content;
        song.lyrics.synced = null;
        song.lyrics.lines  = null;
    }

    song.lyrics.source = "manual";

    writeCacheEntry(song, {
        lyrics: {
            remote: song.lyrics.remote ?? null,
            synced: song.lyrics.synced ?? null
        }
    });

    // Re-render immediately using the same path as loadSong
    // — no metadata refresh needed
    const lyrics = resolveLyrics(song);
    if (lyrics.synced && lyrics.lines?.length) {
        renderSyncedLyrics(lyrics.lines);
    } else if (lyrics.text) {
        renderPlainLyrics(lyrics.text);
    } else {
        DOM.lyrics.container.innerHTML = `<div class="opacity-50 p-4">No lyrics available.</div>`;
    }

    document.getElementById("editlyrics-popup")?.classList.add("hidden");
});

/* =========================
   LAST.FM & AUDIO PREVIEWS
========================= */

const apiKey = "377bda08fce0375719d11510a81ae3f8"; 
let activePreviewAudio = null;
let mainAudioWasPlaying = false; // Tracks if main audio was playing before preview started

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function stopCurrentPreview({ restoreMain = true } = {}) {
    if (activePreviewAudio) {
        activePreviewAudio.pause();
        activePreviewAudio.onended = null;
        activePreviewAudio = null;
        // inside stopCurrentPreview(), replace the reset line with:
document.querySelectorAll(".play-preview-btn, .play-album-preview-btn").forEach(btn => btn.innerText = "▶");
document.querySelectorAll(".play-download-preview-btn").forEach(btn => btn.innerText = "▶ PREVIEW");
        if (restoreMain && mainAudioWasPlaying) {
            audio.play();
            mainAudioWasPlaying = false;
        }
    }
}

(function attachMainAudioPreviewGuard() {
    if (typeof audio !== "undefined" && audio) {
        audio.addEventListener("play", () => stopCurrentPreview());
    } else {
        setTimeout(attachMainAudioPreviewGuard, 200);
    }
})();

function createPreviewToggler(playBtn, previewUrl, labels = { play: "▶", pause: "❚❚" }) {
    playBtn.addEventListener("click", () => {
        if (activePreviewAudio && activePreviewAudio.src === previewUrl) {
            if (activePreviewAudio.paused) {
                activePreviewAudio.play();
                audio.pause();
                playBtn.innerText = labels.pause;
            } else {
                stopCurrentPreview();
            }
            return;
        }

        if (!activePreviewAudio) {
            mainAudioWasPlaying = !audio.paused;
        }

        stopCurrentPreview({ restoreMain: false });

        audio.pause();
        activePreviewAudio = new Audio(previewUrl);
        activePreviewAudio.play();
        playBtn.innerText = labels.pause;

        activePreviewAudio.onended = () => stopCurrentPreview();
    });
}

async function openSimilarModal() {
    const song = window.currentSong;
    if (!song) return;

    stopCurrentPreview();

    const popup = document.getElementById("similar-popup");
    const subtitle = document.getElementById("similar-subtitle");
    const listContainer = document.getElementById("similars-list");

    const trackName = song.musicbrainz?.title || song.title;
    const artistName = song.musicbrainz?.artist || song.artist;

    subtitle.innerText = `Based on: ${artistName} - ${trackName}`;
    listContainer.innerHTML = `<div class="text-center py-4">Fetching recommendations...</div>`;
    popup.classList.remove("hidden");

    try {
        // Fetch via IPC from Node environment rather than renderer fetch
        const res = await window.api.getSimilarTracks({
            artist: artistName,
            track: trackName,
            apiKey: apiKey
        });

        if (!res.success) {
            throw new Error(res.error);
        }

        const tracks = res.data?.similartracks?.track;

        if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-4 opacity-70">No similar tracks found on Last.fm.</div>`;
            return;
        }

        listContainer.innerHTML = "";

        for (const item of tracks) {
            const name = item.name;
            const artist = item.artist?.name || "Unknown Artist";
            const matchScore = item.match ? `${Math.round(parseFloat(item.match) * 100)}% match` : "";

            // Fallback image from Last.fm if iTunes fails
            const lastFmCover = item.image?.find(img => img.size === 'medium' || img.size === 'large')?.['#text'] || "";

            const card = document.createElement("div");
            card.className = "p-2 border-1 flex items-center justify-between gap-3";

            card.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden flex-1">
                    <div class="relative group size-12 flex-shrink-0 bg-neutral-800">
                        <img class="track-artwork size-12 object-cover ${lastFmCover ? '' : 'opacity-0'} transition-opacity duration-200" 
                             src="${lastFmCover}" alt="">
                        <button class="play-preview-btn hidden absolute inset-0 bg-black/70 text-main flex items-center justify-center font-bold text-xs">
                            ▶
                        </button>
                    </div>

                    <div class="flex flex-col truncate">
                        <span class="truncate font-semibold">${name}</span>
                        <span class="opacity-70 text-xs truncate">${artist}</span>
                    </div>
                </div>

                <div class="flex items-center gap-2 flex-shrink-0">
                    ${matchScore ? `<span class="text-[10px] border-1 px-1.5 py-0.5">${matchScore}</span>` : ""}
                </div>
            `;

            listContainer.appendChild(card);

            // Rate-limit iTunes lookups (wait 150ms between requests)
            await sleep(150);

            fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + " " + name)}&entity=song&limit=1`, {
                headers: {
                    'Accept': 'application/json'
                }
            })
            .then(async (r) => {
                if (!r.ok) {
                    throw new Error(`iTunes API error ${r.status}`);
                }
                return r.json();
            })
            .then(itunesData => {
                const match = itunesData?.results?.[0];
                if (match) {
                    const img = card.querySelector(".track-artwork");
                    if (img && match.artworkUrl100) {
                        img.src = match.artworkUrl100;
                        img.classList.remove("opacity-0");
                    }

                    if (match.previewUrl) {
                        const playBtn = card.querySelector(".play-preview-btn");
                        playBtn?.classList.remove("hidden");
                        createPreviewToggler(playBtn, match.previewUrl);
                    }
                }
            })
            .catch(e => {
                console.warn(`iTunes fallback triggered for ${artist} - ${name}`);
            });
        }
    } catch (err) {
        console.error("Last.fm Fetch Error:", err.message);
        listContainer.innerHTML = `<div class="text-center py-4 text-red-500 font-mono">Error loading recommendations: ${err.message}</div>`;
    }
}

document.getElementById("recs")?.addEventListener("click", openSimilarModal);

/* =========================
   DISCOVER
========================= */

function openTabs(song) {
    if (!song) return;

    const artist = song.musicbrainz?.artist ?? song.artist ?? "";
    const title = song.musicbrainz?.title ?? song.title ?? "";
    const query = encodeURIComponent(`${artist} ${title}`);

    const popup = document.getElementById("similar-popup");
    const subtitle = document.getElementById("similar-subtitle");
    const listContainer = document.getElementById("similars-list");

    subtitle.innerText = `${artist.toUpperCase()} - TABS & CHORDS`;
    popup.classList.remove("hidden");

    const tabProviders = [
        { 
            label: "Songsterr", 
            sub: "Interactive Guitar/Bass/Drum Tabs", 
            url: `https://www.songsterr.com/a/wa/search?pattern=${query}` 
        },
        { 
            label: "Ultimate Guitar", 
            sub: "Chords, Official Tabs & Ukulele", 
            url: `https://www.ultimateguitar.com/search.php?search_type=title&value=${query}` 
        },
        { 
            label: "Chordify", 
            sub: "Automatic Chords & Play-along", 
            url: `https://chordify.net/search/${query}` 
        },
        { 
            label: "Search All Tabs", 
            sub: "Google Search for PDF / Custom Tabs", 
            url: `https://www.google.com/search?q=${query}+guitar+tab+chords` 
        }
    ];

    listContainer.innerHTML = `
        <div class="flex flex-col gap-2">
            ${tabProviders.map(provider => `
                <a href="${provider.url}" target="_blank" rel="noopener noreferrer" 
                   class="default-btn p-3 flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="fong-bold">${provider.label}</span>
                        <span class="text-xs opacity-60">${provider.sub}</span>
                    </div>
                    <span class="opacity-80">OPEN ↗</span>
                </a>
            `).join('')}
        </div>
    `;
}
document.getElementById("tabs")?.addEventListener("click", () => {
    const song = window.currentSong;
    if (song) openTabs(song);
});

async function fetchArtistBio(artistName) {
    if (!artistName) return "No biography available.";

    try {
        const artistQuery = encodeURIComponent(artistName);
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${artistQuery}`);
        
        if (res.ok) {
            const data = await res.json();
            if (data.extract) {
                return data.extract;
            }
        }
    } catch (err) {
        console.warn("Wikipedia bio fetch error:", err);
    }

    return "No biography available.";
}
async function showLinksAndBio(song) {
    if (!song) return;

    const artist = song.musicbrainz?.artist ?? song.artist ?? "";
    const title = song.musicbrainz?.title ?? song.title ?? "";
    const query = encodeURIComponent(`${artist} ${title}`);

    const popup = document.getElementById("similar-popup");
    const subtitle = document.getElementById("similar-subtitle");
    const listContainer = document.getElementById("similars-list");

    subtitle.innerText = `${artist.toUpperCase()} - INFO & LINKS`;
    listContainer.innerHTML = `<div class="text-center py-4">Fetching biography...</div>`;
    popup.classList.remove("hidden");

    const bioText = await fetchArtistBio(artist);

    const links = [
        { label: "▶ YouTube", url: `https://www.youtube.com/results?search_query=${query}` },
        { label: "෴ Bandcamp", url: `https://bandcamp.com/search?q=${query}` },
        { label: "🎧 Spotify", url: `https://open.spotify.com/search/${query}` },
        { label: "★ RateYourMusic", url: `https://rateyourmusic.com/search?searchtype=a&searchterm=${query}` },
        { label: "💿 Discogs", url: `https://www.discogs.com/search/?q=${query}&type=all` },
        { label: "☁ SoundCloud", url: `https://soundcloud.com/search?q=${query}` }
    ];

    listContainer.innerHTML = `
        <div class="p-3 leading-relaxed max-h-[160px] overflow-y-auto border-1 mb-3 opacity-90 themed-scrollbar">
            ${bioText}
        </div>
        <div class="grid grid-cols-2 gap-2">
            ${links.map(link => `
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" 
                   class="default-btn text-center py-2 no-underline flex items-center justify-center">
                    ${link.label}
                </a>
            `).join('')}
        </div>
    `;
}
document.getElementById("external-links")?.addEventListener("click", () => {
    const song = window.currentSong;
    if (song) showLinksAndBio(song);
});

/* =========================
   ALBUM EXPLORER
========================= */

async function openAlbumExplorer() {
    const song = window.currentSong;
    if (!song) return;

    stopCurrentPreview();

    const popup = document.getElementById("similar-popup");
    const subtitle = document.getElementById("similar-subtitle");
    const listContainer = document.getElementById("similars-list");

    const trackName = song.musicbrainz?.title || song.title;
    const artistName = song.musicbrainz?.artist || song.artist;
    const albumName = song.musicbrainz?.album || song.album || "";

    subtitle.innerText = `Album Explorer: ${artistName} - ${albumName || trackName}`;
    listContainer.innerHTML = `<div class="text-center py-4">Fetching tracklist from MusicBrainz...</div>`;
    popup.classList.remove("hidden");

    try {
        const mbQuery = encodeURIComponent(`artist:"${artistName}" AND release:"${albumName}"`);
        const mbRes = await fetch(`https://musicbrainz.org/ws/2/release?query=${mbQuery}&fmt=json`);
        const mbData = await mbRes.json();

        const release = mbData.releases?.[0];
        if (!release) {
            listContainer.innerHTML = `<div class="text-center py-4 opacity-70">Album not found on MusicBrainz.</div>`;
            return;
        }

        const releaseRes = await fetch(`https://musicbrainz.org/ws/2/release/${release.id}?inc=recordings&fmt=json`);
        const releaseData = await releaseRes.json();
        const mbTracks = releaseData.media?.[0]?.tracks || [];

        if (mbTracks.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-4 opacity-70">No tracks found.</div>`;
            return;
        }

        listContainer.innerHTML = "";

        for (const track of mbTracks) {
            const trackNum = track.position ?? "•";
            const title = track.title;
            const durationSec = Math.floor((track.length || 0) / 1000);
            const durationFormatted = durationSec ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : "--:--";

            const card = document.createElement("div");
            card.className = "p-2 border-1 flex items-center justify-between gap-3";

            card.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden flex-1">
                    <span class="w-6 text-center text-xs opacity-60 font-mono">${trackNum}</span>
                    <div class="relative group size-12 flex-shrink-0 bg-slate-800 flex items-center justify-center">
                        <img class="track-artwork size-12 object-cover hidden" src="">
                        <button class="play-album-preview-btn hidden absolute inset-0 bg-black/70 text-main flex items-center justify-center font-bold text-xs cursor-pointer">
                            ▶
                        </button>
                    </div>
                    <div class="flex flex-col truncate">
                        <span class="text-sm font-semibold truncate">${title}</span>
                        <span class="opacity-70 text-xs truncate">${artistName}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs opacity-60">${durationFormatted}</span>
                </div>
            `;

            listContainer.appendChild(card);

            fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName + " " + title)}&entity=song&limit=1`)
                .then(r => r.json())
                .then(itunesData => {
                    const match = itunesData.results?.[0];
                    if (!match) return;

                    const img = card.querySelector(".track-artwork");
                    if (img && match.artworkUrl100) {
                        img.src = match.artworkUrl100;
                        img.classList.remove("hidden");
                    }

                    if (match.previewUrl) {
                        const playBtn = card.querySelector(".play-album-preview-btn");
                        playBtn?.classList.remove("hidden");
                        createPreviewToggler(playBtn, match.previewUrl);
                    }
                })
                .catch(e => console.error("iTunes track preview error:", e));
        }
    } catch (err) {
        console.error("Album Explorer Fetch Error:", err);
        listContainer.innerHTML = `<div class="text-center py-4 text-red-500 font-mono">Error loading album tracklist.</div>`;
    }
}
document.getElementById("album-explorer")?.addEventListener("click", openAlbumExplorer);

document.getElementById("similar-close")?.addEventListener("click", () => {
    stopCurrentPreview();
    document.getElementById("similar-popup")?.classList.add("hidden");
});

/* =========================
   DELETE N MORE INFO
========================= */

function updateMoreInfo() {
    const song = window.currentSong;
    if (!song) return;

    DOM.more.info.innerHTML = `
        <div>Artist: ${song.musicbrainz?.artist ?? song.artist}</div>
        <div>Album: ${song.musicbrainz?.album ?? song.album}</div>
        <div>Year: ${song.musicbrainz?.year ?? "Unknown"}</div>
        <div>Genres: ${song.musicbrainz?.genres ?? "Unknown"}</div>
        <div>Path: ${song.path}</div>

        <div class="py-[10px] flex gap-3 flex-wrap">
            <span>${song.cover ? "■" : "□"} Embedded Cover</span>
            <span>${song.musicbrainz ? "■" : "□"} MusicBrainz</span>
            <span>${song.lyrics?.remote || song.lyrics?.embedded ? "■" : "□"} Lyrics</span>
        </div>

        <button id="delete" class="text-center outline-2 p-[5px] w-full text-red-500 hover:bg-red-500/10">
            🗑 DELETE
        </button>
    `;

        document.getElementById("refresh-mbz")?.addEventListener("click", () => refreshMetadata(song));
    document.getElementById("disable-mbz")?.addEventListener("click", () => disableMetadata(song));

    DOM.more.info.querySelector("#delete")?.addEventListener("click", handleDeleteSong);
}
async function handleDeleteSong() {
    const song = window.currentSong;
    if (!song || !song.path) return;

    if (!confirm(`Are you sure you want to permanently delete:\n"${song.title || song.path}"?`)) {
        return;
    }

    try {
        audio.pause();
        audio.src = "";
        audio.load();

        const result = await window.api.trashItem(song.path);
        if (!result.success) {
            throw new Error(result.error || "Unknown error");
        }

        const deleteIndex = currentLibrary.indexOf(song);
if (deleteIndex !== -1) currentLibrary.splice(deleteIndex, 1);

const libraryIndex = songs.indexOf(song);
if (libraryIndex !== -1) songs.splice(libraryIndex, 1);

currentSongIndex = deleteIndex;
document.getElementById("more-popup")?.classList.add("hidden");

if (currentLibrary.length > 0) {
    if (currentSongIndex >= currentLibrary.length) {
        currentSongIndex = 0;
    }

            if (typeof loadSong === "function") {
                loadSong(currentLibrary[currentSongIndex]);
            }
        } else {
            currentSongIndex = 0;
            if (DOM.songTitle) DOM.songTitle.textContent = "No Tracks Available";
            if (DOM.artistName) DOM.artistName.textContent = "";
        }

    } catch (err) {
        console.error("Failed to delete song:", err);
        alert(`Could not delete file: ${err.message}`);
    }
}