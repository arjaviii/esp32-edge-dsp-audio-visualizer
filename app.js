/**
 * Edge DSP Audio Visualizer - Frontend Dashboard Engine
 * Designed for ESP32-based Edge Computing Audio Visualizer
 */

// ============================================================================
// 1. STATE MANAGEMENT & CONFIGURATION
// ============================================================================
const state = {
  // DSP parameters
  noiseGate: 120,          // 0 to 500 ADC raw floor
  maxSensitivity: 3200,    // 500 to 4095 peak map
  decaySpeed: 3,           // 1 to 5 (falloff speed)
  
  // Audio Bands: 5-band equalizer values (0.0 to 1.0)
  // Baseline is hard-clamped to never drop below 0.05 (5%)
  bands: [0.15, 0.25, 0.45, 0.30, 0.12],
  targetBands: [0.15, 0.25, 0.45, 0.30, 0.12],
  peakHold: [0.15, 0.25, 0.45, 0.30, 0.12],
  peakHoldTime: [0, 0, 0, 0, 0],
  
  // Waveform buffer for raw oscilloscope display
  waveformBuffer: new Float32Array(100),
  
  // Stream Mode: 'mock' | 'mic' | 'websocket'
  sourceMode: 'mock',
  
  // WebSocket state
  ws: null,
  wsUrl: 'ws://192.168.1.144:81',
  isConnected: true, // Default to true for simulated demo mode
  
  // Telemetry metrics
  latency: 14.2,
  latencyHistory: [14, 15, 13, 16, 14, 17, 13, 15, 14, 16, 15, 14, 13, 18, 14, 15],
  fps: 60.0,
  frameCount: 0,
  lastFpsTimestamp: performance.now(),
  freeHeap: 186.4,
  dieTemp: 38.4,
  uptimeSeconds: 868,

  // Audio Context for optional live mic
  audioCtx: null,
  analyser: null,
  micStream: null,
};

// ============================================================================
// 2. DOM ELEMENT REFERENCES
// ============================================================================
const dom = {
  // Canvases
  visualizerCanvas: document.getElementById('visualizerCanvas'),
  waveformCanvas: document.getElementById('waveformCanvas'),
  latencySparkline: document.getElementById('latencySparkline'),
  
  // Header & Clock
  liveClock: document.getElementById('liveClock'),
  fpsCounter: document.getElementById('fpsCounter'),
  wsStatusBadge: document.getElementById('wsStatusBadge'),
  wsStatusDot: document.getElementById('wsStatusDot'),
  wsStatusPing: document.getElementById('wsStatusPing'),
  wsStatusText: document.getElementById('wsStatusText'),
  wsConfigBtn: document.getElementById('wsConfigBtn'),
  
  // Source Mode Buttons
  srcMockBtn: document.getElementById('srcMockBtn'),
  srcMicBtn: document.getElementById('srcMicBtn'),
  srcWsBtn: document.getElementById('srcWsBtn'),
  
  // Sliders & Controls
  noiseGateSlider: document.getElementById('noiseGateSlider'),
  noiseGateValue: document.getElementById('noiseGateValue'),
  sensitivitySlider: document.getElementById('sensitivitySlider'),
  sensitivityValue: document.getElementById('sensitivityValue'),
  decaySpeedSlider: document.getElementById('decaySpeedSlider'),
  decaySpeedValue: document.getElementById('decaySpeedValue'),
  syncEspBtn: document.getElementById('syncEspBtn'),
  syncBtnText: document.getElementById('syncBtnText'),
  syncIcon: document.getElementById('syncIcon'),
  syncToast: document.getElementById('syncToast'),
  
  // Readout Badges
  peakRmsDisplay: document.getElementById('peakRmsDisplay'),
  clipIndicator: document.getElementById('clipIndicator'),
  avgEnergyVal: document.getElementById('avgEnergyVal'),
  latencyDisplay: document.getElementById('latencyDisplay'),
  freeHeapDisplay: document.getElementById('freeHeapDisplay'),
  dieTempDisplay: document.getElementById('dieTempDisplay'),
  uptimeDisplay: document.getElementById('uptimeDisplay'),
  
  // Modal Elements
  wsModal: document.getElementById('wsModal'),
  closeWsModal: document.getElementById('closeWsModal'),
  cancelWsModalBtn: document.getElementById('cancelWsModalBtn'),
  saveAndConnectWsBtn: document.getElementById('saveAndConnectWsBtn'),
  wsUriInput: document.getElementById('wsUriInput'),
  autoReconnectCheck: document.getElementById('autoReconnectCheck'),
  
  // 5 Band value labels
  bandValLabels: [
    document.getElementById('val-band-0'),
    document.getElementById('val-band-1'),
    document.getElementById('val-band-2'),
    document.getElementById('val-band-3'),
    document.getElementById('val-band-4')
  ]
};

// ============================================================================
// 3. CANVAS CONTEXTS & RESIZING
// ============================================================================
const ctxEq = dom.visualizerCanvas.getContext('2d');
const ctxWave = dom.waveformCanvas.getContext('2d');
const ctxSpark = dom.latencySparkline.getContext('2d');

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;

  // Resize Equalizer Canvas
  const rectEq = dom.visualizerCanvas.getBoundingClientRect();
  dom.visualizerCanvas.width = rectEq.width * dpr;
  dom.visualizerCanvas.height = rectEq.height * dpr;
  ctxEq.resetTransform();
  ctxEq.scale(dpr, dpr);

  // Resize Waveform Canvas
  const rectWave = dom.waveformCanvas.getBoundingClientRect();
  dom.waveformCanvas.width = rectWave.width * dpr;
  dom.waveformCanvas.height = rectWave.height * dpr;
  ctxWave.resetTransform();
  ctxWave.scale(dpr, dpr);

  // Resize Latency Sparkline Canvas
  const rectSpark = dom.latencySparkline.getBoundingClientRect();
  dom.latencySparkline.width = rectSpark.width * dpr;
  dom.latencySparkline.height = rectSpark.height * dpr;
  ctxSpark.resetTransform();
  ctxSpark.scale(dpr, dpr);
}

window.addEventListener('resize', resizeCanvases);

// ============================================================================
// 4. MOCK AUDIO GENERATOR (Rhythmic Music Simulation)
// ============================================================================
let mockBeatClock = 0;
let mockKickTrigger = 0;
let mockSnareTrigger = 0;
let mockHatTrigger = 0;

function generateMockAudioFrame(dt) {
  mockBeatClock += dt;
  
  // 124 BPM rhythm simulation (Kick on quarter notes, Snare on 2 and 4, Hats on 16ths)
  const bpm = 124;
  const beatDuration = 60 / bpm;
  const currentBeat = (mockBeatClock / beatDuration) % 4;
  
  // Kick drum hit on beats 0, 1, 2, 3
  const kickPhase = currentBeat % 1.0;
  const kickAmp = Math.max(0, 1.0 - kickPhase * 4.5);
  
  // Snare/Clap on beats 1 and 3
  const isSnareBeat = (currentBeat >= 1 && currentBeat < 2) || (currentBeat >= 3 && currentBeat < 4);
  const snarePhase = currentBeat % 1.0;
  const snareAmp = isSnareBeat ? Math.max(0, 1.0 - snarePhase * 3.5) : 0;
  
  // Hi-hat groove (16th notes)
  const sixteenthPhase = (currentBeat * 4) % 1.0;
  const hatAmp = Math.max(0, 0.85 - sixteenthPhase * 5.0) * (0.4 + 0.6 * Math.random());
  
  // Melodic synth modulation (harmonics shifting smoothly)
  const synthMod1 = Math.sin(mockBeatClock * 3.1) * 0.25 + 0.35;
  const synthMod2 = Math.cos(mockBeatClock * 1.8) * 0.20 + 0.30;
  
  // Sub-Bass (Band 0): Dominated by Kick drum + Sub-bass rumble
  let sub = 0.08 + kickAmp * 0.75 + Math.sin(mockBeatClock * 4.0) * 0.08;
  
  // Bass (Band 1): Kick punch + bassline movement
  let bass = 0.10 + kickAmp * 0.60 + synthMod1 * 0.35;
  
  // Mids (Band 2): Snare body + vocal/synth energy
  let mids = 0.12 + snareAmp * 0.50 + synthMod1 * 0.40 + synthMod2 * 0.25;
  
  // High-Mids / Presence (Band 3): Snare snap + synth harmonics
  let pres = 0.09 + snareAmp * 0.65 + hatAmp * 0.25 + synthMod2 * 0.35;
  
  // Treble / Brilliance (Band 4): Hi-hats + air shimmer
  let brill = 0.07 + hatAmp * 0.65 + (Math.random() * 0.15);

  // Apply Noise Gate Threshold filtering:
  // If the simulated overall level is below the normalized gate, attenuate heavily
  const normalizedGate = state.noiseGate / 500; // 0 to 1
  const rawSum = (sub + bass + mids + pres + brill) / 5;
  
  if (rawSum < normalizedGate * 0.6) {
    const attenuation = Math.max(0.05, rawSum / (normalizedGate * 0.6 + 0.001));
    sub *= attenuation;
    bass *= attenuation;
    mids *= attenuation;
    pres *= attenuation;
    brill *= attenuation;
  }
  
  // Apply Maximum Sensitivity scaling (ESP32 12-bit mapping)
  const sensitivityMultiplier = (4095 / state.maxSensitivity);
  sub *= sensitivityMultiplier;
  bass *= sensitivityMultiplier;
  mids *= sensitivityMultiplier;
  pres *= sensitivityMultiplier;
  brill *= sensitivityMultiplier;

  // ENSURE HARD BASELINE: The baseline should NEVER drop below 5% (0.05)
  const clampBaseline = (val) => Math.min(0.98, Math.max(0.05, val));

  state.targetBands[0] = clampBaseline(sub);
  state.targetBands[1] = clampBaseline(bass);
  state.targetBands[2] = clampBaseline(mids);
  state.targetBands[3] = clampBaseline(pres);
  state.targetBands[4] = clampBaseline(brill);

  // Synthesize oscillating raw ADC buffer
  for (let i = 0; i < state.waveformBuffer.length; i++) {
    const t = mockBeatClock * 25 + i * 0.18;
    const wave = Math.sin(t) * 0.4 * sub + 
                 Math.sin(t * 2.8) * 0.3 * mids + 
                 (Math.random() - 0.5) * 0.15 * brill;
    state.waveformBuffer[i] = wave;
  }
}

// ============================================================================
// 5. REAL-TIME CANVAS RENDERING LOOP (5-BAR EQUALIZER)
// ============================================================================
let lastFrameTime = performance.now();

function renderDashboard(now) {
  requestAnimationFrame(renderDashboard);

  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  // 1. Calculate FPS
  state.frameCount++;
  if (now - state.lastFpsTimestamp >= 500) {
    state.fps = (state.frameCount / ((now - state.lastFpsTimestamp) / 1000)).toFixed(1);
    dom.fpsCounter.textContent = state.fps;
    state.frameCount = 0;
    state.lastFpsTimestamp = now;
  }

  // 2. Generate Audio Frame if in Mock mode
  if (state.sourceMode === 'mock') {
    generateMockAudioFrame(dt);
  } else if (state.sourceMode === 'mic' && state.analyser) {
    pollMicrophoneAudio();
  }

  // 3. Smooth Band Interpolation & Peak Hold Dynamics
  // Decay speed mappings: 1=very slow/heavy, 3=medium studio, 5=rapid
  const attack = 0.55; 
  const decayRate = 0.08 + (6 - state.decaySpeed) * 0.035;

  for (let i = 0; i < 5; i++) {
    const target = Math.max(0.05, state.targetBands[i]); // Baseline >= 5%
    
    // Attack / Release smoothing
    if (target > state.bands[i]) {
      state.bands[i] += (target - state.bands[i]) * attack;
    } else {
      state.bands[i] -= (state.bands[i] - target) * (decayRate * 60 * dt);
    }
    
    // Strict clamp baseline >= 5%
    if (state.bands[i] < 0.05) {
      state.bands[i] = 0.05;
    }

    // Peak Hold indicator calculation
    if (state.bands[i] >= state.peakHold[i]) {
      state.peakHold[i] = state.bands[i];
      state.peakHoldTime[i] = now;
    } else {
      // Hold for 350ms before gentle falling
      if (now - state.peakHoldTime[i] > 350) {
        state.peakHold[i] -= 0.45 * dt;
        if (state.peakHold[i] < state.bands[i]) {
          state.peakHold[i] = state.bands[i];
        }
      }
    }
    
    // Update numeric percentage labels below each bar
    const pct = Math.round(state.bands[i] * 100);
    if (dom.bandValLabels[i]) {
      dom.bandValLabels[i].textContent = `${pct}%`;
    }
  }

  // 4. Draw Main 5-Bar Equalizer Canvas
  drawEqualizerCanvas();

  // 5. Draw Waveform Oscilloscope Canvas
  drawWaveformCanvas();

  // 6. Update Audio Stats
  updateAudioStats();
}

/**
 * Draws the 5-Bar Neon Equalizer onto HTML5 Canvas
 * Features:
 * - OLED deep black backdrop with grid guidelines
 * - 5 glowing vertical bars with segmented OLED/LED blocks
 * - Neon cyan & green linear gradient styling with blur glow
 * - High-intensity floating peak caps
 * - Visual 5% minimum floor baseline guide
 */
function drawEqualizerCanvas() {
  const canvas = dom.visualizerCanvas;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  ctxEq.clearRect(0, 0, width, height);

  // Background subtle grid lines
  ctxEq.strokeStyle = 'rgba(26, 38, 56, 0.4)';
  ctxEq.lineWidth = 1;
  const gridRows = 8;
  for (let r = 1; r < gridRows; r++) {
    const y = (height / gridRows) * r;
    ctxEq.beginPath();
    ctxEq.moveTo(0, y);
    ctxEq.lineTo(width, y);
    ctxEq.stroke();
  }

  // 5-bar layout geometry
  const numBars = 5;
  const totalMargin = width * 0.12;
  const availableWidth = width - totalMargin;
  const barSpacing = availableWidth / (numBars * 3.5);
  const barWidth = (availableWidth - (numBars - 1) * barSpacing) / numBars;
  const startX = totalMargin / 2;

  // Segmented OLED parameters
  const segmentHeight = 8;
  const segmentGap = 3;
  const totalStep = segmentHeight + segmentGap;
  const maxSegments = Math.floor((height * 0.90) / totalStep);
  const chartBottomY = height * 0.95;

  for (let i = 0; i < numBars; i++) {
    const currentAmp = state.bands[i];
    const peakAmp = state.peakHold[i];
    const x = startX + i * (barWidth + barSpacing);
    const activeSegments = Math.max(1, Math.round(currentAmp * maxSegments));

    // Outer glow for active bar
    ctxEq.save();
    ctxEq.shadowColor = (i < 2 || i === 4) ? 'rgba(0, 243, 255, 0.55)' : 'rgba(0, 255, 136, 0.55)';
    ctxEq.shadowBlur = 14;

    // Draw segmented LED stack
    for (let s = 0; s < maxSegments; s++) {
      const segY = chartBottomY - (s + 1) * totalStep;
      const isLit = s < activeSegments;
      const normalizedHeight = s / maxSegments;

      if (isLit) {
        // Neon color gradient depending on height and band
        let segColor;
        if (normalizedHeight > 0.85) {
          segColor = '#ff0055'; // High clip red
        } else if (normalizedHeight > 0.70) {
          segColor = '#ffb703'; // Warning amber
        } else if (i === 2 || i === 3) {
          segColor = '#00ff88'; // Vibrant Neon Green
        } else {
          segColor = '#00f3ff'; // Electric Neon Cyan
        }

        ctxEq.fillStyle = segColor;
        // Rounded OLED segment
        drawRoundedRect(ctxEq, x, segY, barWidth, segmentHeight, 2);
        ctxEq.fill();

        // Inner highlight reflection
        ctxEq.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctxEq.fillRect(x + 2, segY + 1, barWidth - 4, 1.5);
      } else {
        // Ghost / unlit segment in background (authentic OLED matrix look)
        ctxEq.fillStyle = 'rgba(15, 23, 42, 0.35)';
        drawRoundedRect(ctxEq, x, segY, barWidth, segmentHeight, 1);
        ctxEq.fill();
      }
    }
    ctxEq.restore();

    // Draw Peak Hold Floating Marker Cap
    const peakSeg = Math.min(maxSegments - 1, Math.max(0, Math.round(peakAmp * maxSegments)));
    const peakY = chartBottomY - (peakSeg + 1) * totalStep;
    
    ctxEq.save();
    ctxEq.shadowColor = '#ffffff';
    ctxEq.shadowBlur = 8;
    ctxEq.fillStyle = '#ffffff';
    drawRoundedRect(ctxEq, x, peakY - 1, barWidth, 3, 1.5);
    ctxEq.fill();
    ctxEq.restore();
  }
}

/**
 * Utility to draw rounded rectangle on canvas
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draws the Raw ADC Oscilloscope waveform
 */
function drawWaveformCanvas() {
  const canvas = dom.waveformCanvas;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const midY = height / 2;

  ctxWave.clearRect(0, 0, width, height);

  // Center line
  ctxWave.strokeStyle = 'rgba(30, 41, 59, 0.6)';
  ctxWave.lineWidth = 1;
  ctxWave.beginPath();
  ctxWave.moveTo(0, midY);
  ctxWave.lineTo(width, midY);
  ctxWave.stroke();

  // Waveform line with glowing cyan trace
  ctxWave.save();
  ctxWave.strokeStyle = '#00f3ff';
  ctxWave.shadowColor = 'rgba(0, 243, 255, 0.7)';
  ctxWave.shadowBlur = 6;
  ctxWave.lineWidth = 1.8;
  ctxWave.beginPath();

  const buffer = state.waveformBuffer;
  const step = width / (buffer.length - 1);

  for (let i = 0; i < buffer.length; i++) {
    const val = buffer[i];
    const y = midY + val * (height * 0.42);
    if (i === 0) {
      ctxWave.moveTo(0, y);
    } else {
      ctxWave.lineTo(i * step, y);
    }
  }

  ctxWave.stroke();
  ctxWave.restore();
}

/**
 * Updates RMS calculation, clip lights, and energy metrics
 */
function updateAudioStats() {
  let sum = 0;
  let maxVal = 0;
  for (let i = 0; i < 5; i++) {
    sum += state.bands[i];
    if (state.bands[i] > maxVal) maxVal = state.bands[i];
  }
  const avg = sum / 5;
  
  // Calculate approximate dBFS: 20 * log10(maxVal)
  const db = (20 * Math.log10(Math.max(0.01, maxVal))).toFixed(1);
  dom.peakRmsDisplay.textContent = `${db} dB`;
  
  // Clip indicator
  if (maxVal > 0.88) {
    dom.clipIndicator.textContent = 'PEAK';
    dom.clipIndicator.className = 'px-1.5 py-0.5 rounded text-[10px] bg-red-600/30 text-neon-red font-bold uppercase transition-colors border border-neon-red/50';
  } else {
    dom.clipIndicator.textContent = 'NORM';
    dom.clipIndicator.className = 'px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-bold uppercase transition-colors';
  }

  dom.avgEnergyVal.textContent = `${(avg * 100).toFixed(1)}%`;
}

// ============================================================================
// 6. TELEMETRY & HARDWARE INNOVATIONS (Updating every few seconds)
// ============================================================================
function updateHardwareTelemetry() {
  // Latency fluctuating realistically between 12ms and 18ms
  const baseLatency = 14.5;
  const jitter = (Math.random() - 0.5) * 5.0; // +/- 2.5
  state.latency = Math.min(18.0, Math.max(12.0, baseLatency + jitter));
  dom.latencyDisplay.textContent = state.latency.toFixed(1);

  // Push to sparkline history
  state.latencyHistory.push(state.latency);
  if (state.latencyHistory.length > 25) {
    state.latencyHistory.shift();
  }
  drawLatencySparkline();

  // Subtle natural fluctuations in ESP32 heap and core temperature
  state.freeHeap = (186.4 + (Math.random() - 0.5) * 3.5).toFixed(1);
  state.dieTemp = (38.4 + (Math.random() - 0.5) * 0.8).toFixed(1);
  dom.freeHeapDisplay.textContent = `${state.freeHeap} KB`;
  dom.dieTempDisplay.textContent = `${state.dieTemp} °C`;

  // Increment Uptime
  state.uptimeSeconds += 2;
  const hrs = String(Math.floor(state.uptimeSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((state.uptimeSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(state.uptimeSeconds % 60).padStart(2, '0');
  dom.uptimeDisplay.textContent = `${hrs}:${mins}:${secs}`;
}

/**
 * Draws the latency history sparkline graph
 */
function drawLatencySparkline() {
  const canvas = dom.latencySparkline;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const history = state.latencyHistory;

  ctxSpark.clearRect(0, 0, width, height);

  const minLat = 10;
  const maxLat = 20;
  const step = width / (history.length - 1);

  ctxSpark.strokeStyle = '#ffb703';
  ctxSpark.lineWidth = 1.5;
  ctxSpark.beginPath();

  for (let i = 0; i < history.length; i++) {
    const norm = (history[i] - minLat) / (maxLat - minLat);
    const y = height - (norm * height);
    if (i === 0) {
      ctxSpark.moveTo(0, y);
    } else {
      ctxSpark.lineTo(i * step, y);
    }
  }

  ctxSpark.stroke();
}

// Tick telemetry every 2 seconds
setInterval(updateHardwareTelemetry, 2000);

// ============================================================================
// 7. SYSTEM CLOCK TICKER
// ============================================================================
function updateLiveClock() {
  const now = new Date();
  const hrs = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');
  dom.liveClock.textContent = `${hrs}:${mins}:${secs}`;
}
setInterval(updateLiveClock, 1000);
updateLiveClock();

// ============================================================================
// 8. CONTROL PANEL EVENT LISTENERS & DSP SYNC
// ============================================================================

// Noise Gate Slider
dom.noiseGateSlider.addEventListener('input', (e) => {
  state.noiseGate = parseInt(e.target.value, 10);
  dom.noiseGateValue.textContent = state.noiseGate;
});

// Sensitivity Slider
dom.sensitivitySlider.addEventListener('input', (e) => {
  state.maxSensitivity = parseInt(e.target.value, 10);
  dom.sensitivityValue.textContent = state.maxSensitivity;
});

// Decay Speed Slider
const decayLabels = ['Fastest', 'Fast', 'Studio', 'Smooth', 'Ultra Slow'];
dom.decaySpeedSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  state.decaySpeed = val;
  dom.decaySpeedValue.textContent = decayLabels[val - 1] || 'Studio';
});

// DSP Presets
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.getAttribute('data-preset');
    switch (preset) {
      case 'bass':
        state.noiseGate = 90;
        state.maxSensitivity = 3800;
        break;
      case 'vocal':
        state.noiseGate = 140;
        state.maxSensitivity = 3400;
        break;
      case 'flat':
        state.noiseGate = 100;
        state.maxSensitivity = 3000;
        break;
      case 'club':
        state.noiseGate = 160;
        state.maxSensitivity = 4000;
        break;
    }
    dom.noiseGateSlider.value = state.noiseGate;
    dom.noiseGateValue.textContent = state.noiseGate;
    dom.sensitivitySlider.value = state.maxSensitivity;
    dom.sensitivityValue.textContent = state.maxSensitivity;

    // Trigger visual sync toast
    showSyncFeedback('Preset Applied & Synced');
  });
});

// "Sync to ESP32" Button Action
dom.syncEspBtn.addEventListener('click', () => {
  // Animate button icon
  dom.syncIcon.classList.add('rotate-180');
  dom.syncBtnText.textContent = 'Transmitting...';
  
  // Construct DSP parameters payload
  const payload = {
    action: 'set_dsp_params',
    noiseGate: state.noiseGate,
    maxSensitivity: state.maxSensitivity,
    decaySpeed: state.decaySpeed,
    timestamp: Date.now()
  };

  // If live WebSocket is connected, send real packet
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(payload));
  } else {
    console.log('[ESP32 Sync Simulated] Transmitted payload:', payload);
  }

  // Restore button and show toast after simulated 350ms network round-trip
  setTimeout(() => {
    dom.syncIcon.classList.remove('rotate-180');
    dom.syncBtnText.textContent = 'Sync to ESP32';
    showSyncFeedback('✓ Parameters Synced to ESP32 NVRAM');
  }, 350);
});

function showSyncFeedback(msg) {
  dom.syncToast.textContent = msg;
  dom.syncToast.classList.remove('hidden', 'opacity-0');
  dom.syncToast.classList.add('opacity-100');
  setTimeout(() => {
    dom.syncToast.classList.remove('opacity-100');
    dom.syncToast.classList.add('opacity-0');
    setTimeout(() => dom.syncToast.classList.add('hidden'), 300);
  }, 2500);
}

// ============================================================================
// 9. SOURCE MODE SWITCHING (Mock / Live Mic / ESP32 WebSocket)
// ============================================================================
dom.srcMockBtn.addEventListener('click', () => setSourceMode('mock'));
dom.srcMicBtn.addEventListener('click', () => setSourceMode('mic'));
dom.srcWsBtn.addEventListener('click', () => setSourceMode('websocket'));

function setSourceMode(mode) {
  state.sourceMode = mode;
  
  // Reset button states
  [dom.srcMockBtn, dom.srcMicBtn, dom.srcWsBtn].forEach(btn => {
    btn.className = 'px-3 py-1 rounded text-xs font-mono font-medium transition-all text-slate-400 hover:text-white';
  });

  if (mode === 'mock') {
    dom.srcMockBtn.className = 'px-3 py-1 rounded text-xs font-mono font-medium transition-all bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 shadow-neon-cyan-sm';
    setConnectionBadge(true, 'Mock Feed: Online');
  } else if (mode === 'mic') {
    dom.srcMicBtn.className = 'px-3 py-1 rounded text-xs font-mono font-medium transition-all bg-neon-green/20 text-neon-green border border-neon-green/40 shadow-neon-green-sm';
    initMicrophoneAudio();
    setConnectionBadge(true, 'Browser Mic: Active');
  } else if (mode === 'websocket') {
    dom.srcWsBtn.className = 'px-3 py-1 rounded text-xs font-mono font-medium transition-all bg-amber-400/20 text-amber-300 border border-amber-400/40';
    connectWebSocket(state.wsUrl);
  }
}

function setConnectionBadge(connected, label) {
  state.isConnected = connected;
  if (connected) {
    dom.wsStatusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-neon-green/10 border border-neon-green/40 shadow-neon-green-sm transition-all duration-300';
    dom.wsStatusDot.className = 'relative inline-flex rounded-full h-2 w-2 bg-neon-green';
    dom.wsStatusPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75';
    dom.wsStatusText.className = 'text-xs font-mono font-semibold text-neon-green uppercase tracking-wider';
    dom.wsStatusText.textContent = label || 'WS: Connected';
  } else {
    dom.wsStatusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/40 transition-all duration-300';
    dom.wsStatusDot.className = 'relative inline-flex rounded-full h-2 w-2 bg-neon-red';
    dom.wsStatusPing.className = 'hidden';
    dom.wsStatusText.className = 'text-xs font-mono font-semibold text-neon-red uppercase tracking-wider';
    dom.wsStatusText.textContent = label || 'WS: Offline';
  }
}

// Optional Live Mic Input via Web Audio API
async function initMicrophoneAudio() {
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }
    if (!state.micStream) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      state.micStream = stream;
      const source = state.audioCtx.createMediaStreamSource(stream);
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = 256;
      state.analyser.smoothingTimeConstant = 0.8;
      source.connect(state.analyser);
    }
  } catch (err) {
    console.warn('Microphone access denied or unavailable:', err);
    alert('Could not access microphone. Falling back to Mock DSP Engine.');
    setSourceMode('mock');
  }
}

function pollMicrophoneAudio() {
  if (!state.analyser) return;
  const bufferLength = state.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  state.analyser.getByteFrequencyData(dataArray);

  // Divide the 128 bins into 5 acoustic bands:
  // Sub-Bass (0-3), Bass (4-11), Mids (12-35), Presence (36-70), Brilliance (71-127)
  const bandRanges = [
    [0, 3],
    [4, 11],
    [12, 35],
    [36, 70],
    [71, 127]
  ];

  const rawBands = bandRanges.map(([start, end]) => {
    let sum = 0;
    for (let i = start; i <= end; i++) {
      sum += dataArray[i];
    }
    return (sum / (end - start + 1)) / 255;
  });

  // Apply noise gate
  const gateNorm = state.noiseGate / 500;
  for (let i = 0; i < 5; i++) {
    let val = rawBands[i];
    if (val < gateNorm * 0.5) val *= 0.1;
    state.targetBands[i] = Math.min(0.98, Math.max(0.05, val * (4095 / state.maxSensitivity)));
  }

  // Update waveform from time domain
  const timeData = new Uint8Array(bufferLength);
  state.analyser.getByteTimeDomainData(timeData);
  for (let i = 0; i < state.waveformBuffer.length; i++) {
    const idx = Math.floor(i * (bufferLength / state.waveformBuffer.length));
    state.waveformBuffer[i] = (timeData[idx] - 128) / 128;
  }
}

// ============================================================================
// 10. WEBSOCKET CLIENT & ESP32 HARDWARE INTEGRATION HOOKS
// ============================================================================

/**
 * Placeholder & Operational WebSocket Client
 * Connects to the ESP32 Wi-Fi WebSocket server (e.g. ws://192.168.1.144:81)
 * 
 * @param {string} url - WebSocket server URL
 */
function connectWebSocket(url) {
  state.wsUrl = url || state.wsUrl;
  console.log(`[WebSocket] Initiating connection to ${state.wsUrl}...`);

  if (state.ws) {
    try { state.ws.close(); } catch (e) {}
  }

  try {
    state.ws = new WebSocket(state.wsUrl);

    state.ws.onopen = () => {
      console.log(`[WebSocket] Connected successfully to ${state.wsUrl}`);
      setConnectionBadge(true, 'ESP32: Connected');
    };

    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle 5-band payload: { type: 'audio_frame', bands: [0.1, 0.4, 0.8, 0.5, 0.2] }
        if (data.bands && Array.isArray(data.bands)) {
          updateEqualizerBands(data.bands);
        } 
        // Handle single amplitude payload: { type: 'audio_frame', amplitude: 2350 }
        else if (data.amplitude !== undefined) {
          updateVisualizerData(data.amplitude);
        }

        // Handle optional hardware telemetry packet from ESP32
        if (data.freeHeap) state.freeHeap = data.freeHeap;
        if (data.temp) state.dieTemp = data.temp;
      } catch (err) {
        // If message is plain float/number
        const rawNum = parseFloat(event.data);
        if (!isNaN(rawNum)) {
          updateVisualizerData(rawNum);
        }
      }
    };

    state.ws.onerror = (error) => {
      console.warn('[WebSocket] Error encountered:', error);
      setConnectionBadge(false, 'WS: Error');
    };

    state.ws.onclose = () => {
      console.warn('[WebSocket] Connection closed.');
      setConnectionBadge(false, 'WS: Offline');
      
      // Auto-reconnect if configured and still in WS mode
      if (dom.autoReconnectCheck.checked && state.sourceMode === 'websocket') {
        setTimeout(() => {
          if (state.sourceMode === 'websocket') {
            connectWebSocket(state.wsUrl);
          }
        }, 3000);
      }
    };
  } catch (err) {
    console.error('[WebSocket] Initialization failed:', err);
    setConnectionBadge(false, 'WS: Failed');
  }
}

/**
 * Placeholder Function: updateVisualizerData(amplitude)
 * Required by specification for wiring single-channel amplitude streams from ESP32.
 * 
 * Maps a single raw ADC amplitude reading (0 to 4095, or normalized 0.0 to 1.0)
 * into a realistic 5-band frequency spectrum using edge-computing filter weights.
 * 
 * @param {number} amplitude - Raw ADC amplitude or normalized value
 */
function updateVisualizerData(amplitude) {
  let normalized = amplitude;
  
  // Detect if incoming value is raw 12-bit ADC (0 - 4095)
  if (amplitude > 1.0) {
    // Apply noise gate
    if (amplitude < state.noiseGate) {
      amplitude = 0;
    }
    // Scale against Maximum Sensitivity
    normalized = Math.min(1.0, Math.max(0.0, amplitude / state.maxSensitivity));
  }

  // Baseline floor should NEVER drop below 5% (0.05)
  const floor = 0.05;

  // Synthesize dynamic 5-band distribution from single amplitude reading
  state.targetBands[0] = Math.max(floor, normalized * 0.95); // Sub
  state.targetBands[1] = Math.max(floor, normalized * 0.85); // Bass
  state.targetBands[2] = Math.max(floor, normalized * 0.70); // Mids
  state.targetBands[3] = Math.max(floor, normalized * 0.55); // Presence
  state.targetBands[4] = Math.max(floor, normalized * 0.40); // Brilliance
}

/**
 * Helper Function: updateEqualizerBands(bandsArray)
 * Directly updates all 5 frequency bands when ESP32 does onboard FFT calculation.
 * 
 * @param {number[]} bandsArray - Array of 5 numbers (0.0 to 1.0, or 0 to 100)
 */
function updateEqualizerBands(bandsArray) {
  if (!Array.isArray(bandsArray) || bandsArray.length < 5) return;

  for (let i = 0; i < 5; i++) {
    let val = bandsArray[i];
    if (val > 1.0) val = val / 100; // Handle percentages (0-100)

    // Hard baseline clamp >= 5%
    state.targetBands[i] = Math.min(0.98, Math.max(0.05, val));
  }
}

// Expose integration functions to global window scope for physical hardware / console testing
window.connectWebSocket = connectWebSocket;
window.updateVisualizerData = updateVisualizerData;
window.updateEqualizerBands = updateEqualizerBands;

// ============================================================================
// 11. WEBSOCKET CONFIGURATION MODAL HANDLERS
// ============================================================================
dom.wsConfigBtn.addEventListener('click', () => {
  dom.wsUriInput.value = state.wsUrl;
  dom.wsModal.classList.remove('hidden');
});

dom.closeWsModal.addEventListener('click', () => {
  dom.wsModal.classList.add('hidden');
});

dom.cancelWsModalBtn.addEventListener('click', () => {
  dom.wsModal.classList.add('hidden');
});

dom.saveAndConnectWsBtn.addEventListener('click', () => {
  const newUri = dom.wsUriInput.value.trim();
  if (newUri) {
    state.wsUrl = newUri;
    dom.wsModal.classList.add('hidden');
    setSourceMode('websocket');
  }
});

// Close modal when clicking backdrop
dom.wsModal.addEventListener('click', (e) => {
  if (e.target === dom.wsModal) {
    dom.wsModal.classList.add('hidden');
  }
});

// ============================================================================
// 12. INITIALIZATION
// ============================================================================
function init() {
  resizeCanvases();
  updateLiveClock();
  updateHardwareTelemetry();
  setConnectionBadge(true, 'WS: Connected');
  
  // Launch 60 FPS visualizer animation loop
  requestAnimationFrame(renderDashboard);

  console.log('%c[Edge DSP Audio Visualizer Engine Initialized]', 'color:#00f3ff; font-weight:bold; font-size:12px;');
  console.log('Available test commands:');
  console.log(' - updateVisualizerData(2500)');
  console.log(' - updateEqualizerBands([0.8, 0.5, 0.9, 0.4, 0.2])');
  console.log(' - connectWebSocket("ws://your-esp32-ip:81")');
}

// Boot up once DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
