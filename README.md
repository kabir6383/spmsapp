# SPMS: Smart Power Management System (Industrial G+5)

## Industrial SPMS Cloud Brain
The system is now powered by **Firebase Cloud Functions**. The logic runs 24/7 on Google's servers.

### Deployment Instructions:
1. Ensure you have Firebase CLI installed: `npm install -g firebase-tools`
2. Login to Firebase: `firebase login`
3. Deploy the AI Brain: `cd functions && firebase deploy --only functions`

Once deployed, the building will be 100% autonomous regardless of whether the mobile app or PC is on.
 (Industrial G+5)

## 🏗️ Building Architecture
- **Structure**: Ground + 5 Floors
- **Relay Mapping**:
  - Relay 1 & 2: Daylight Harvesting (LDR-based reduction)
  - Relay 3: Ground Floor
  - Relay 4: Floor 1
  - Relay 5: Floor 2
  - Relay 6: Floor 3
  - Relay 7: Floor 4
  - Relay 8: Floor 5

## ⚡ Technical Specifications (Prototype)
- **Maximum Demand**: 600W
- **Shedding Logic**: Hardware-level failsafe triggers at 600W. AI-level predictive shedding starts at 500W.
- **Microcontroller**: ESP32 (38-Pin Industrial Board)
- **Sensors**: PZEM-004T (Power), 6x LDR Array, Dual PIR Occupancy sensors.

## 🧠 AI Engine
- **Model**: HistGradientBoosting (scikit-learn)
- **Features**: Time, Peak-status, Voltage, Current, Solar, Efficiency, PF, Occupancy, Lux.
- **Bridge**: Python-based real-time inference bridge connecting ESP32 (Serial) to Firebase (RTDB).

## 🚀 Deployment Instructions

### 1. Firmware
- Open `spms_firmware/spms_firmware.ino` in Arduino IDE.
- Partition Scheme: **Huge APP (3MB No OTA)**.
- Upload Speed: **115200**.

### 2. AI Bridge
- Ensure `serviceAccountKey.json` is in the root directory.
- Run: `python ai_bridge.py`

### 3. Mobile App
- Run: `npm install`
- Start: `npx expo start`
- **Security**: Switching to MANUAL mode requires biometric authentication.

---
**Confidential Industrial Firmware - G+5 Facility Protocol**
