/*
 * ==============================================================================
 * Edge DSP Audio Visualizer - ESP32 Firmware Example
 * ==============================================================================
 * 
 * Hardware Target: ESP32 / ESP32-S3 (Dual-Core Xtensa LX6 / LX7 @ 240MHz)
 * Audio Input: Analog Microphone module (e.g. MAX9814, MAX4466, or INMP441 I2S)
 * Output: WebSocket JSON Stream broadcast to the IoT Web Dashboard
 * 
 * Required Arduino Libraries:
 *  - WebSockets by Markus Sattler (Install via Arduino Library Manager)
 *  - ArduinoJson by Benoit Blanchon (v6 or v7)
 *  - WiFi.h (Built-in ESP32 core)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// --- Wi-Fi Credentials ---
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// --- Pin Definitions ---
#define AUDIO_ADC_PIN 34    // ADC1 Channel 6 (GPIO 34, input-only, low-noise)

// --- DSP Parameters (Remote controlled via Dashboard) ---
volatile int noiseGateThreshold = 120;     // 0 to 500
volatile int maxSensitivity     = 3200;    // 500 to 4095
const int SAMPLE_WINDOW         = 100;     // Rapid 100-sample window (~2.5ms)

// --- WebSockets Server (Port 81) ---
WebSocketsServer webSocket = WebSocketsServer(81);

// Telemetry timer
unsigned long lastTelemetryTime = 0;
unsigned long lastSampleTime    = 0;

// --- WebSocket Event Callback ---
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Dashboard Client Disconnected!\n", num);
      break;
      
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[%u] Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      
      // Send initial handshake confirmation
      StaticJsonDocument<128> doc;
      doc["type"] = "handshake";
      doc["status"] = "connected";
      doc["chip"] = "ESP32-D0WDQ6";
      String response;
      serializeJson(doc, response);
      webSocket.sendTXT(num, response);
      break;
    }
    
    case WStype_TEXT: {
      // Received remote DSP parameter change from dashboard
      StaticJsonDocument<256> doc;
      DeserializationError error = deserializeJson(doc, payload, length);
      
      if (!error) {
        const char* action = doc["action"];
        if (action && strcmp(action, "set_dsp_params") == 0) {
          noiseGateThreshold = doc["noiseGate"] | noiseGateThreshold;
          maxSensitivity     = doc["maxSensitivity"] | maxSensitivity;
          Serial.printf("Updated DSP Params -> Gate: %d, MaxSens: %d\n", noiseGateThreshold, maxSensitivity);
        }
      }
      break;
    }
    
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Booting ESP32 Edge DSP Visualizer ===");

  // Configure ADC: 12-Bit resolution (0 - 4095), 11dB attenuation (~0 - 3.3V)
  analogReadResolution(12);
  analogSetPinAttenuation(AUDIO_ADC_PIN, ADC_11db);

  // Connect to Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi Connected!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // Start WebSocket Server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("WebSocket Server started on port 81");
}

void loop() {
  webSocket.loop();

  // Rapid 100-sample ADC Window Acquisition
  unsigned int peakToPeak = 0;
  unsigned int signalMax = 0;
  unsigned int signalMin = 4095;

  for (int i = 0; i < SAMPLE_WINDOW; i++) {
    int sample = analogRead(AUDIO_ADC_PIN);
    if (sample > signalMax) signalMax = sample;
    if (sample < signalMin) signalMin = sample;
  }

  peakToPeak = signalMax - signalMin; // Dynamic peak-to-peak amplitude

  // Apply Noise Gate Threshold filter
  if (peakToPeak < noiseGateThreshold) {
    peakToPeak = 0;
  }

  // Broadcast audio data to dashboard every 16ms (~60 FPS)
  unsigned long now = millis();
  if (now - lastSampleTime >= 16) {
    lastSampleTime = now;

    // Normalize amplitude to 0.0 - 1.0 (clamped)
    float normalizedAmp = (float)peakToPeak / (float)maxSensitivity;
    if (normalizedAmp > 1.0) normalizedAmp = 1.0;
    if (normalizedAmp < 0.05) normalizedAmp = 0.05; // Maintain 5% floor

    // Broadcast frame to all connected web clients
    StaticJsonDocument<128> doc;
    doc["type"] = "audio_frame";
    doc["amplitude"] = peakToPeak;
    doc["normalized"] = normalizedAmp;

    String jsonString;
    serializeJson(doc, jsonString);
    webSocket.broadcastTXT(jsonString);
  }

  // Periodic Telemetry Broadcast (every 2 seconds)
  if (now - lastTelemetryTime >= 2000) {
    lastTelemetryTime = now;

    StaticJsonDocument<128> telem;
    telem["type"] = "telemetry";
    telem["freeHeap"] = ESP.getFreeHeap() / 1024.0; // In KB
    telem["rssi"] = WiFi.RSSI();
    telem["uptime"] = millis() / 1000;

    String telemStr;
    serializeJson(telem, telemStr);
    webSocket.broadcastTXT(telemStr);
  }
}
