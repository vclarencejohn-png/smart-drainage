/*
  Smart Drainage ESP32 - revised firmware

  CHANGE ONLY THESE VALUES BEFORE UPLOADING:
    WIFI_SSID, WIFI_PASSWORD, API_KEY, and UNIT_ID (if this is another drainage).

  Keep the existing hardware pins unless the physical wiring changes:
    JSN-SR04T: TRIG 12, ECHO 13
    Float switch: 26 (LOW = overflow)
    LEDs: green 25, yellow 33, red 32

  IMPORTANT:
  - Full is permanently 21 cm because of the JSN-SR04T blind zone.
  - Use the website Admin > Drainages > Calibrate zero only when the storage is empty.
  - The calibration button is applied by the ESP32 on its next configuration check.
  - There is no physical buzzer. Alerts are handled by the website only.
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <time.h>

// ========== CHANGE THESE BEFORE UPLOADING ==========
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL = "https://smart-drainage-api.onrender.com";
const char* API_KEY = "PASTE_THE_SAME_API_KEY_FROM_RENDER_HERE";
const char* UNIT_ID = "drainage_1";

// ========== EXISTING HARDWARE PINS ==========
constexpr int TRIG_PIN = 12;
constexpr int ECHO_PIN = 13;
constexpr int FLOAT_PIN = 26;
constexpr int LED_GREEN = 25;
constexpr int LED_YELLOW = 33;
constexpr int LED_RED = 32;

// ========== CALIBRATION AND TIMING ==========
constexpr float DEFAULT_EMPTY_DISTANCE = 33.92F;
constexpr float FULL_DISTANCE = 21.0F; // Fixed JSN-SR04T blind-zone boundary.
constexpr unsigned long REPORT_INTERVAL_MS = 10'000;
constexpr unsigned long CONFIG_INTERVAL_MS = 10'000;
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 10'000;
constexpr int PHILIPPINES_UTC_OFFSET_SECONDS = 8 * 60 * 60;

constexpr int MEDIAN_SAMPLES = 7;
constexpr int MOVING_AVERAGE_SAMPLES = 5;

Preferences preferences;
float emptyDistance = DEFAULT_EMPTY_DISTANCE;
float movingReadings[MOVING_AVERAGE_SAMPLES] = {};
int movingIndex = 0;
int movingCount = 0;
bool previousOverflow = false;
unsigned long lastSendTime = 0;
unsigned long lastConfigCheckTime = 0;
unsigned long lastWifiAttemptTime = 0;

void startWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptTime = millis();
  Serial.print("Connecting to Wi-Fi");
}

bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  const unsigned long now = millis();
  if (now - lastWifiAttemptTime >= WIFI_RETRY_INTERVAL_MS) {
    Serial.println("\nWi-Fi disconnected. Retrying...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastWifiAttemptTime = now;
  }
  return false;
}

bool synchronizeClock() {
  configTime(PHILIPPINES_UTC_OFFSET_SECONDS, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeInfo;
  for (int attempt = 0; attempt < 15; attempt++) {
    if (getLocalTime(&timeInfo, 1000)) {
      Serial.println("Internet time synchronized.");
      return true;
    }
  }
  Serial.println("Time sync unavailable. Readings will retry when time is available.");
  return false;
}

bool isoTimestamp(String& output) {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo, 1000)) return false;
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S+08:00", &timeInfo);
  output = buffer;
  return true;
}

float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30'000);
  const float distance = duration * 0.0343F / 2.0F;
  if (distance <= 0 || distance > 400) return -1;
  return distance;
}

float stableDistance() {
  float samples[MEDIAN_SAMPLES];
  int valid = 0;

  for (int index = 0; index < MEDIAN_SAMPLES; index++) {
    const float distance = measureDistance();
    if (distance > 0) samples[valid++] = distance;
    delay(70);
  }
  if (valid == 0) return -1;

  for (int left = 0; left < valid - 1; left++) {
    for (int right = 0; right < valid - left - 1; right++) {
      if (samples[right] > samples[right + 1]) {
        const float temporary = samples[right];
        samples[right] = samples[right + 1];
        samples[right + 1] = temporary;
      }
    }
  }
  return samples[valid / 2];
}

float smoothedDistance(float newDistance) {
  movingReadings[movingIndex] = newDistance;
  movingIndex = (movingIndex + 1) % MOVING_AVERAGE_SAMPLES;
  if (movingCount < MOVING_AVERAGE_SAMPLES) movingCount++;

  float sum = 0;
  for (int index = 0; index < movingCount; index++) sum += movingReadings[index];
  return sum / movingCount;
}

int fillPercentage(float distance) {
  if (distance >= emptyDistance) return 0;
  if (distance <= FULL_DISTANCE) return 100;

  const float fill = ((emptyDistance - distance) / (emptyDistance - FULL_DISTANCE)) * 100.0F;
  return constrain(static_cast<int>(round(fill)), 0, 100);
}

String ledStatusFor(int fillLevel, bool overflow) {
  if (overflow || fillLevel >= 75) return "RED";
  if (fillLevel >= 40) return "YELLOW";
  return "GREEN";
}

void updateLeds(int fillLevel, bool overflow) {
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);

  if (overflow || fillLevel >= 75) digitalWrite(LED_RED, HIGH);
  else if (fillLevel >= 40) digitalWrite(LED_YELLOW, HIGH);
  else digitalWrite(LED_GREEN, HIGH);
}

bool postJson(const String& path, const String& json, String* response = nullptr) {
  if (!ensureWiFi()) return false;

  WiFiClientSecure client;
  client.setInsecure(); // Prototype HTTPS connection. Use Render's CA certificate for a hardened production build.
  HTTPClient http;
  if (!http.begin(client, String(API_BASE_URL) + path)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  const int status = http.POST(json);
  if (response != nullptr && status > 0) *response = http.getString();
  Serial.printf("POST %s -> %d\n", path.c_str(), status);
  http.end();
  return status >= 200 && status < 300;
}

bool getConfig(String& response) {
  if (!ensureWiFi()) return false;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  const String path = String(API_BASE_URL) + "/api/device-config/" + UNIT_ID;
  if (!http.begin(client, path)) return false;

  http.addHeader("X-API-Key", API_KEY);
  const int status = http.GET();
  if (status >= 200 && status < 300) response = http.getString();
  Serial.printf("GET device config -> %d\n", status);
  http.end();
  return status >= 200 && status < 300;
}

void handleCalibrationRequest() {
  String config;
  if (!getConfig(config)) return;
  if (config.indexOf("\"calibration_pending\":true") < 0) return;

  Serial.println("Calibration request received. Measuring empty distance...");
  const float measuredEmptyDistance = stableDistance();
  if (measuredEmptyDistance <= FULL_DISTANCE + 0.5F) {
    Serial.println("Calibration rejected: storage may not be empty or sensor reading is invalid.");
    return;
  }

  const String json = "{\"empty_distance\":" + String(measuredEmptyDistance, 2) + "}";
  if (postJson(String("/api/device-config/") + UNIT_ID + "/calibration", json)) {
    emptyDistance = measuredEmptyDistance;
    preferences.putFloat("empty_cm", emptyDistance);
    movingCount = 0; // Do not mix readings from the old calibration with the new one.
    Serial.printf("Zero calibration saved: %.2f cm\n", emptyDistance);
  }
}

bool sendReading(float distance, int fillLevel, bool overflow, const String& ledStatus) {
  String timestamp;
  if (!isoTimestamp(timestamp)) {
    Serial.println("Cannot send reading until internet time is synchronized.");
    synchronizeClock();
    return false;
  }

  const String json = "{"
    "\"unit_id\":\"" + String(UNIT_ID) + "\","
    "\"debris_level\":" + String(fillLevel) + ","
    "\"distance\":" + String(distance, 2) + ","
    "\"overflow\":" + String(overflow ? "true" : "false") + ","
    "\"led_status\":\"" + ledStatus + "\","
    "\"timestamp\":\"" + timestamp + "\""
    "}";

  return postJson("/api/readings", json);
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(FLOAT_PIN, INPUT_PULLUP);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  updateLeds(0, false);

  preferences.begin("smartdrain", false);
  emptyDistance = preferences.getFloat("empty_cm", DEFAULT_EMPTY_DISTANCE);

  Serial.println("=== Smart Drainage revised firmware ===");
  Serial.printf("Unit ID: %s\n", UNIT_ID);
  Serial.printf("Empty: %.2f cm | Full: %.2f cm\n", emptyDistance, FULL_DISTANCE);
  startWiFi();

  const unsigned long now = millis();
  lastSendTime = now - REPORT_INTERVAL_MS;
  lastConfigCheckTime = now - CONFIG_INTERVAL_MS;
}

void loop() {
  const unsigned long now = millis();
  const bool online = ensureWiFi();
  if (online) {
    static bool clockWasSynchronized = false;
    if (!clockWasSynchronized) clockWasSynchronized = synchronizeClock();
    if (now - lastConfigCheckTime >= CONFIG_INTERVAL_MS) {
      lastConfigCheckTime = now;
      handleCalibrationRequest();
    }
  }

  const float rawDistance = stableDistance();
  if (rawDistance < 0) {
    Serial.println("Sensor error: no valid ultrasonic reading.");
    delay(1'000);
    return;
  }

  const float distance = smoothedDistance(rawDistance);
  const bool overflow = digitalRead(FLOAT_PIN) == LOW;
  const int fillLevel = fillPercentage(distance);
  const String ledStatus = ledStatusFor(fillLevel, overflow);
  updateLeds(fillLevel, overflow);

  const bool overflowStarted = overflow && !previousOverflow;
  if (online && (now - lastSendTime >= REPORT_INTERVAL_MS || overflowStarted)) {
    sendReading(distance, fillLevel, overflow, ledStatus);
    lastSendTime = now;
  }
  previousOverflow = overflow;

  Serial.printf("Distance: %.2f cm | Fill: %d%% | Overflow: %s | LED: %s\n",
    distance, fillLevel, overflow ? "YES" : "NO", ledStatus.c_str());
  delay(700);
}
