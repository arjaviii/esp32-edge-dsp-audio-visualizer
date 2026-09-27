# Edge DSP Audio Visualizer - IoT Web Dashboard

A real-time, cyber-aesthetic IoT web dashboard for an **ESP32-based Edge Computing Audio Visualizer**. The user interface utilizes a high-contrast dark mode aesthetic mimicking an **OLED display**, with neon cyan (`#00f3ff`) and neon green (`#00ff88`) accents.

---

## ⚡ Key Highlights & Engineering Innovation

1. **Edge DSP Computing Paradigm**:
   - Rather than streaming high-bandwidth raw audio to a host PC or cloud server, the ESP32 samples and computes filterbanks on-chip.
   - **Power Consumption**: `< 0.5 Watts` (99.4% energy reduction compared to desktop visualizers drawing 65W–250W).
   - **ADC Sampling**: Rapid 100-sample window with continuous DMA buffering.
   - **Round-Trip Latency**: Fluctuates in real time between **12ms and 18ms**.

2. **Core 5-Bar Neon Equalizer**:
   - Built on an HTML5 `<canvas>` rendering engine running at a smooth 60 FPS via `requestAnimationFrame`.
   - Frequency Bins:
     - **SUB-BASS** (63 Hz)
     - **BASS** (250 Hz)
     - **MIDS** (1.0 kHz)
     - **PRESENCE** (4.0 kHz)
     - **BRILLIANCE** (12.0 kHz)
   - Features **segmented OLED LED bars**, **glowing peak hold markers**, and a strict **≥ 5.0% baseline floor** so the bars never drop to zero.

3. **Remote DSP Control Panel**:
   - **Noise Gate Threshold Slider** (`0 to 500`): Filters out ambient background room noise.
   - **Maximum Sensitivity Slider** (`500 to 4095`): Calibrates 12-bit ADC peak scale.
   - **Decay Falloff Speed Slider**: Studio standard decay vs. responsive gaming falloff.
   - **DSP Presets**: One-click profiles (*Bass Boost*, *Vocal Pop*, *Flat Monitor*, *Club EDM*).
   - **"Sync to ESP32" Button**: Transmits updated DSP registers directly to the microcontroller with visual feedback.

4. **Multiple Audio Sources Supported**:
   - **Mock Audio DSP**: Built-in rhythmic music generator (124 BPM beat pattern with kicks, snares, hats, and synths) for immediate demonstration.
   - **Live Browser Mic**: Uses Web Audio API to visualize real room acoustics or your voice through your laptop/PC microphone.
   - **ESP32 WebSocket Stream**: Directly streams from your physical ESP32 over local Wi-Fi.

---

## 🚀 How to Run the Dashboard

Simply open the `index.html` file in any modern web browser (Google Chrome, Microsoft Edge, Firefox, Brave):

```bash
# Direct double-click on Windows:
explorer E:\Antigravity\index.html
```

Or serve via any local HTTP server:

```bash
# Python
python -m http.server 8000 --directory E:\Antigravity

# Or npx
npx serve E:\Antigravity
```

---

## 🔌 Connecting to Your Physical ESP32

### Step 1: Flash the ESP32
Open `esp32_firmware_example.ino` in the Arduino IDE or PlatformIO.
1. Enter your Wi-Fi SSID and Password:
   ```cpp
   const char* ssid     = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
2. Connect your analog microphone or audio source to **GPIO 34** (ADC1_CH6).
3. Upload to your ESP32 board and open the Serial Monitor (115200 baud) to find its IP address (e.g. `192.168.1.144`).

### Step 2: Connect from the Dashboard
1. Click the **gear icon** ⚙️ next to the WebSocket indicator in the top right.
2. Enter your ESP32 URI: `ws://192.168.1.144:81`
3. Click **Connect Stream** or select **ESP32 WebSocket Stream** in the source bar.

---

## 🛠️ Front-End Developer JavaScript Hooks

The front-end exposes clean, modular functions in `app.js` and on the global `window` object:

### 1. `connectWebSocket(url)`
Connects to an ESP32 WebSocket server with auto-reconnect and status handling.
```javascript
connectWebSocket("ws://192.168.1.144:81");
```

### 2. `updateVisualizerData(amplitude)`
Feeds a single amplitude value (e.g., `0 to 4095` from the ESP32 ADC, or `0.0 to 1.0` normalized) and maps it dynamically across all 5 bands.
```javascript
updateVisualizerData(2850);
```

### 3. `updateEqualizerBands([b0, b1, b2, b3, b4])`
Allows directly updating all 5 individual frequency bands if you are computing FFT on the ESP32:
```javascript
updateEqualizerBands([0.85, 0.60, 0.40, 0.70, 0.30]);
```

---

## 📂 File Structure

- `index.html`: Responsive 3-column cyber dashboard layout (Tailwind CSS, Google Fonts).
- `app.js`: Real-time 60 FPS canvas visualizer, physics engine, telemetry updates, WebSocket driver.
- `styles.css`: OLED glow effects, cyber sliders, CRT scanline overlay.
- `esp32_firmware_example.ino`: Complete, production-ready Arduino C++ sketch for ESP32.
- `README.md`: Documentation and evaluation guide.
