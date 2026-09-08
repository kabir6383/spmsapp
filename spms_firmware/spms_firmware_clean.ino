#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <PZEM004Tv30.h>
#include <time.h>
#include <esp_task_wdt.h>
#include "secrets.h"

/* --- INDUSTRIAL CONFIGURATION --- */
/* --- PIN ASSIGNMENTS --- */
#define PZ_RX       4
#define PZ_TX       5
#define SOLAR_PIN   35
const int PIR_PINS[] = {-1, -1, -1, 13, 14, -1};
const int LDR_PINS[] = {32, 33, 34, 26, 27, 25};
const int R_PINS[]   = {16, 17, 23, 22, 21, 18, 19, 15};

/* --- THRESHOLDS & SETTINGS --- */
const float LOAD_THRESHOLD_W  = 600.0f;
const float RESTORE_W         = 480.0f;
const int   LDR_DARK_THRESH   = 500;  // >500 = Dark
const int   LDR_BRIGHT_THRESH = 2;    // Low ADC = Bright (per user request)
const unsigned long OCCUPANCY_TIMEOUT = 5000; // 5 Seconds (Immediate)
const unsigned long LDR_TIMEOUT       = 5000; // 5 Seconds

/* --- GLOBAL OBJECTS --- */
PZEM004Tv30    pzem(Serial2, PZ_RX, PZ_TX);
FirebaseData   fbdo;
FirebaseAuth   auth;
FirebaseConfig config;

/* --- STATE VARIABLES --- */
float curV = 0, curW = 0, curA = 0, curPF = 0, curFreq = 0, curSolar = 0, totalKWh = 0;
const float POWER_CALIBRATION = 1.124f; 
int pirReading[6] = {0}, ldrReading[6] = {0}, ldrMain = 0, faultCount = 0;
unsigned long lastMotion[6] = {0}, lastShedTime[8] = {0}, lastFailsafeTime = 0, ldrConditionStart = 0;
bool relayState[8] = {false, false, true, true, true, true, true, true};
bool stabilized = false, aiAlive = false, currentLdrState = false, ldrPendingState = false;
String systemMode = "AUTO";

void updateRelays() {
  for (int i = 0; i < 8; i++)
    digitalWrite(R_PINS[i], relayState[i] ? LOW : HIGH);
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n==========================================");
  Serial.println("  SPMS INDUSTRIAL FIRMWARE v6.0 - READY");
  Serial.println("==========================================\n");
  
  esp_task_wdt_config_t wdt = { .timeout_ms = 30000, .idle_core_mask = (1 << 0), .trigger_panic = true };
  esp_task_wdt_init(&wdt);
  esp_task_wdt_add(NULL);

  for (int p : R_PINS)   pinMode(p, OUTPUT);
  for (int p : PIR_PINS) if (p != -1) pinMode(p, INPUT_PULLDOWN);
  pinMode(SOLAR_PIN, INPUT);
  
  updateRelays();

  Serial2.begin(9600, SERIAL_8N1, PZ_RX, PZ_TX);
  delay(1000);
  pzem.setAddress(0x01);

  WiFi.begin(WIFI_NAME, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); esp_task_wdt_reset(); }

  config.database_url = DB_URL;
  config.signer.tokens.legacy_token = DB_SECRET;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  fbdo.setResponseSize(4096);

  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
}

void readSensors() {
  // 1. PZEM Reading
  float v = pzem.voltage();
  if (!isnan(v) && v > 50.0f) {
    curV = v; curW = pzem.power() * POWER_CALIBRATION; curA = pzem.current();
    curPF = pzem.pf(); curFreq = pzem.frequency(); faultCount = 0;
  } else {
    faultCount++;
    if (faultCount % 20 == 0 && isnan(v)) Serial2.begin(9600, SERIAL_8N1, PZ_RX, PZ_TX);
    if (faultCount >= 15) { curV = curW = curA = curPF = 0; }
  }

  // 2. LDR & PIR Reading
  long ldrSum = 0;
  for (int i = 0; i < 6; i++) {
    ldrReading[i] = analogRead(LDR_PINS[i]);
    ldrSum += ldrReading[i];
    if (PIR_PINS[i] != -1) {
      pirReading[i] = digitalRead(PIR_PINS[i]);
      if (pirReading[i] == 1) lastMotion[i] = millis();
    }
  }
  ldrMain = (int)(ldrSum / 6);

  // 3. Solar Reading
  curSolar = (analogRead(SOLAR_PIN) / 4095.0f) * 5.0f;
}

void applyLogic() {
  if (systemMode != "AUTO") return; 

  // LDR Logic (Relays 0, 1) - 50 Second Timeout / Debounce
  bool immediateState = currentLdrState;
  if (ldrMain >= LDR_DARK_THRESH) { immediateState = false; } // Bright -> OFF
  else if (ldrMain <= LDR_BRIGHT_THRESH) { immediateState = true; } // Dark -> ON

  if (immediateState != currentLdrState) {
    if (ldrPendingState != immediateState) {
      ldrPendingState = immediateState;
      ldrConditionStart = millis();
    } else if (millis() - ldrConditionStart >= LDR_TIMEOUT) {
      currentLdrState = immediateState;
    }
  } else {
    ldrPendingState = currentLdrState;
  }
  relayState[0] = relayState[1] = currentLdrState;

  // Occupancy Logic (Relays 2-7) - Only runs in AUTO if AI is dead
  for (int i = 0; i < 6; i++) {
    int rid = i + 2;
    if (PIR_PINS[i] != -1) {
      bool occupied = (millis() - lastMotion[i] < OCCUPANCY_TIMEOUT);
      if (occupied) {
        // [USER REQUEST] Waiting timeout after shedding is 50 seconds
        if (millis() - lastShedTime[rid] >= 50000) {
          relayState[rid] = true;
        }
      } else {
        relayState[rid] = false;
      }
    } 
  }

  // Load Shedding
  if (curW >= LOAD_THRESHOLD_W) {
    int pOrder[] = {7, 4, 6, 5, 3, 2}; 
    if ((millis() - lastMotion[3] >= OCCUPANCY_TIMEOUT) || (millis() - lastMotion[4] >= OCCUPANCY_TIMEOUT)) {
      int tmp[] = {5, 6, 7, 4, 3, 2}; 
      for(int j=0; j<6; j++) pOrder[j] = tmp[j];
    }

    for (int i = 0; i < 6; i++) {
      int rid = pOrder[i];
      if (relayState[rid]) {
        // [USER REQUEST] If floor is occupied, don't shed.
        int floorIdx = rid - 2;
        bool occupied = (floorIdx >= 0 && floorIdx < 6 && PIR_PINS[floorIdx] != -1) ? (millis() - lastMotion[floorIdx] < OCCUPANCY_TIMEOUT) : false;
        if (occupied) continue; 

        relayState[rid] = false; 
        lastShedTime[rid] = millis();
        break; 
      }
    }
  }
  updateRelays();
}

void syncCloud() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  long ts = (long)time(nullptr);
  if (ts < 1000000000L) ts = (long)(millis() / 1000);

  FirebaseJson master;
  FirebaseJson d;
  d.set("voltage", curV); 
  d.set("current", curA); 
  d.set("totalLoad", curW / 1000.0f);
  d.set("powerFactor", curPF);          // Added for dashboard analytics
  d.set("frequency", curFreq);          // Added for dashboard analytics
  d.set("efficiency", curPF * 100.0f);  // Added for dashboard analytics
  d.set("solarOutput", curSolar);  
  d.set("energyKWh", totalKWh); 
  d.set("occupancyPct", (pirReading[0] || pirReading[1] || pirReading[2] || pirReading[3] || pirReading[4] || pirReading[5]) ? 100 : 0);
  d.set("sensorFault",  (faultCount >= 6)); 
  d.set("ldr_lx",       ldrMain); // Main LDR value in lux
  d.set("timestamp",    ts);
  master.set("sensorData", d);

  FirebaseJson fd;
  fd.set("ldr_main", ldrMain); fd.set("timestamp", ts);
  for (int i = 0; i < 6; i++) {
    FirebaseJson fn;
    fn.set("pir", pirReading[i]); fn.set("ldr", ldrReading[i]);
    fn.set("relay_on", relayState[i + 2]);
    fd.set("floor" + String(i), fn);
  }
  master.set("floorData", fd);

  FirebaseJson rs;
  for (int i = 0; i < 8; i++) rs.set("r" + String(i), relayState[i]);
  rs.set("timestamp", ts); rs.set("ai_alive", aiAlive);
  master.set("hardware/relayStatus", rs);

  FirebaseJson h;
  h.set("uptime_s", (int)(millis() / 1000)); h.set("wifi_rssi", WiFi.RSSI());
  h.set("timestamp", ts); h.set("last_seen", ts);
  master.set("health/device", h);

  FirebaseJson integrity;
  integrity.set("score", (faultCount == 0) ? 100 : 50);
  integrity.set("status", (faultCount == 0) ? "NORMAL" : "OFFLINE");
  master.set("health/integrity", integrity);

  if (!Firebase.RTDB.updateNode(&fbdo, "/spms", &master)) {
    Serial.printf("[CLOUD] Error: %s\n", fbdo.errorReason().c_str());
  }

  // 4. Sync System Mode from Cloud
  static String lastMode = "";
  if (Firebase.RTDB.getString(&fbdo, "/spms/systemStatus/mode")) {
    systemMode = fbdo.stringData();
    if (systemMode != lastMode) {
      Serial.print("[SYSTEM] Mode Changed to: "); Serial.println(systemMode);
      lastMode = systemMode;
    }
  }

  // 5. Sync Relays from Cloud (Master Node or Manual Dashboard)
  if (systemMode != "OFF" && Firebase.RTDB.getJSON(&fbdo, "/spms/relays")) {
    FirebaseJsonData jd;
    FirebaseJson &json = fbdo.jsonObject();
    const char* keys[] = {"h1", "h2", "ground", "floor1", "floor2", "floor3", "floor4", "floor5"};
    
    // Only update from cloud if we aren't in a sticky failsafe cooldown
    if (millis() - lastFailsafeTime > 5000) {
      bool changed = false;
      for (int i = 0; i < 8; i++) {
        json.get(jd, keys[i]); 
        if (jd.success && relayState[i] != jd.boolValue) {
          relayState[i] = jd.boolValue;
          changed = true;
        }
      }
      if (changed) updateRelays();
    }
  }

  if (Firebase.RTDB.getInt(&fbdo, "/spms/health/bridge/last_seen")) {
    long b_ts = fbdo.intData();
    aiAlive = (b_ts > 0 && (ts - b_ts) < 30);
  }
}

void loop() {
  esp_task_wdt_reset();
  static unsigned long tS = 0, tC = 0, tE = 0, tB = millis();

  if (!stabilized) {
    if (millis() - tB < 5000) {
      for (int i = 2; i < 8; i++) relayState[i] = true;
      relayState[0] = relayState[1] = false; updateRelays(); return;
    }
    stabilized = true;
  }

  if (millis() - tS > 500) { 
    tS = millis(); 
    readSensors(); 
    
    // Emergency Hardware Failsafe (Only in AUTO mode)
    if (systemMode == "AUTO" && curW >= 650.0f) {
      int pOrder[] = {7, 4, 6, 5, 3, 2}; 
      if ((millis() - lastMotion[3] >= OCCUPANCY_TIMEOUT) || (millis() - lastMotion[4] >= OCCUPANCY_TIMEOUT)) {
        int tmp[] = {5, 6, 7, 4, 3, 2}; 
        for(int j=0; j<6; j++) pOrder[j] = tmp[j];
      }

      for (int i = 0; i < 6; i++) {
        int rid = pOrder[i];
        if (relayState[rid]) { 
          // [USER REQUEST] Respect occupancy even in emergency
          int floorIdx = rid - 2;
          bool occupied = (floorIdx >= 0 && floorIdx < 6 && PIR_PINS[floorIdx] != -1) ? (millis() - lastMotion[floorIdx] < OCCUPANCY_TIMEOUT) : false;
          if (occupied) continue;

          relayState[rid] = false; 
          lastShedTime[rid] = millis();
          lastFailsafeTime = millis(); // Set sticky cooldown
          break; 
        }
      }
      updateRelays();
    } else if (systemMode == "MANUAL" && curW >= 650.0f) {
      // Intentionally do nothing to enforce 100% manual control
      Serial.println("[MANUAL OVERRIDE] Power exceeds 650W, but hardware failsafe is disabled.");
    }
    
    if (systemMode == "AUTO" && !aiAlive) applyLogic(); 
  }
  if (millis() - tE > 60000) { tE = millis(); if (curW > 0) totalKWh += (curW / 60000.0f); }
  if (millis() - tC > 500) { tC = millis(); syncCloud(); }
}
