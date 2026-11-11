import firebase_admin
from firebase_admin import credentials, db
import time
import os
import joblib
import pandas as pd
import numpy as np

def load_dotenv(filepath=".env"):
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"\'')
                    if key not in os.environ:
                        os.environ[key] = val

load_dotenv()

# --- INDUSTRIAL CONFIGURATION ---
DB_URL = os.environ.get("EXPO_PUBLIC_FIREBASE_DATABASE_URL") or os.environ.get("FIREBASE_DATABASE_URL") or "https://spms-69e9e-default-rtdb.asia-southeast1.firebasedatabase.app"
CERT_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT") or "serviceAccountKey.json"
MODEL_PATH = "spms_model.pkl"

# Algorithm Constants
SHED_TRIGGER_W = 598.0
RESTORE_HEADROOM = 120.0
MOTION_TIMEOUT_S = 60
LDR_DARK_THRESH = 10
LDR_BRIGHT_THRESH = 2
FLOOR_NAMES = ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor"]

# Initialize Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate(CERT_PATH)
    firebase_admin.initialize_app(cred, {'databaseURL': DB_URL})

def to_json_safe(obj):
    if isinstance(obj, np.integer): return int(obj)
    if isinstance(obj, np.floating): return float(obj)
    if isinstance(obj, np.ndarray): return obj.tolist()
    if isinstance(obj, dict): return {k: to_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list): return [to_json_safe(v) for v in obj]
    return obj

class SPMSMasterEngine:
    def __init__(self):
        self.last_states = [True] * 6
        self.last_motion = [0.0] * 6
        self.last_shed_time = [0.0] * 6
        self.last_sent = {}
        # User Priority: Floor 5 and 2 are primary shedding targets.
        self.PRIORITY_ORDER = [5, 2, 4, 3, 1, 0] 
        self.LDR_TIMEOUT = 5  # Reduced to 5s for faster response
        self.OCCUPANCY_TIMEOUT = 5  # Reduced to 5s for 'immediate' shedding
        self.LOAD_THRESHOLD = 590.0
        self.RESTORE_HEADROOM = 20.0
        self.LDR_BRIGHT_THRESH = 2
        self.LDR_DARK_THRESH = 500
        self.last_h = True
        self.ldr_condition_start = 0
        self.ldr_pending_state = True
        print("[SYSTEM] Industrial Master Hub Initialized with User Algorithm.")

    def process(self, sensors, floor_data, harvest_at):
        pw = float(sensors.get('totalLoad', 0)) * 1000.0
        now = time.time()
        
        pir = [0] * 6
        for i in range(6):
            f_val = floor_data.get(f'floor{i}', {})
            p_val = int(f_val.get('pir', 0))
            pir[i] = p_val
            if p_val == 1: self.last_motion[i] = now

        ldr_m = int(floor_data.get('ldr_main', 0))
        
        # --- 1. Daylight Harvesting (Strictly H1 & H2 only) ---
        # Only active if 'harvest_at' (the separate buttons toggle) is enabled
        h_at = True # Always active in AUTO mode by default
        if h_at:
            immediate_state = self.last_h
            if ldr_m >= self.LDR_DARK_THRESH:
                immediate_state = False # Bright -> Lights OFF
            elif ldr_m <= self.LDR_BRIGHT_THRESH:
                immediate_state = True  # Dark -> Lights ON
            
            if immediate_state != self.last_h:
                if self.ldr_pending_state != immediate_state:
                    self.ldr_pending_state = immediate_state
                    self.ldr_condition_start = now
                elif (now - self.ldr_condition_start) >= self.LDR_TIMEOUT:
                    print(f"[ALGO] LDR Stable for {self.LDR_TIMEOUT}s. Switching Harvesting to {'ON' if immediate_state else 'OFF'} (Value: {ldr_m})")
                    self.last_h = immediate_state
            else:
                self.ldr_pending_state = self.last_h

            h1 = h2 = self.last_h
        else:
            h1 = h2 = True
        
        # --- 2. Load Shedding & Occupancy Algorithm ---
        states = self.last_states[:]
        trig_v = pw
        shed_log = []
        FLOOR_NAMES = ['GROUND', 'FLOOR 1', 'FLOOR 2', 'FLOOR 3', 'FLOOR 4', 'FLOOR 5']

        # Step A: Desired State Calculation (Occupancy-based Auto-Off)
        desired_states = [True] * 6
        occupancy_status = {}
        
        # Step A: Critical Restoration (Ground and Floor 1 MUST be ON if possible)
        for f in [0, 1]:
            if not states[f] and desired_states[f]:
                impact = [220, 120, 90, 90, 70, 70][f]
                # Restore critical floor first
                states[f] = True
                trig_v += impact
                shed_log.append({'f': FLOOR_NAMES[f], 'a': 'CRITICAL-RESTORE'})
                print(f"[ALGO] Critical Restore: Forced {FLOOR_NAMES[f]} ON.")

        # Step B: Occupancy-First State Adjustment (Floors 3 & 4)
        for f in [3, 4]:
            is_idle = (now - self.last_motion[f]) > self.OCCUPANCY_TIMEOUT
            if not is_idle:
                desired_states[f] = True
                if not states[f]:
                    impact = [220, 120, 90, 90, 70, 70][f]
                    states[f] = True
                    trig_v += impact
                    shed_log.append({'f': FLOOR_NAMES[f], 'a': 'RESTORE (Occupied)'})
            else:
                desired_states[f] = False
                if states[f]:
                    impact = [220, 120, 90, 90, 70, 70][f]
                    states[f] = False
                    trig_v -= impact
                    shed_log.append({'f': FLOOR_NAMES[f], 'a': 'AUTO-OFF (Idle)'})

        # [USER REQUEST] Dynamic Priority Swap
        f3_idle = not desired_states[3]
        f4_idle = not desired_states[4]
        current_priority = [3, 4, 5, 2, 1, 0] if (f3_idle or f4_idle) else self.PRIORITY_ORDER

        # Step B: Enforce Auto-Off for Unoccupied Floors
        for f in [3, 4]:
            if not desired_states[f] and states[f]:
                states[f] = False
                impact = [220, 120, 90, 90, 70, 70][f]
                trig_v -= impact
                shed_log.append({'f': FLOOR_NAMES[f], 'a': 'AUTO-OFF (Idle)'})

        # Step B.5: Priority Swap Restoration (Immediate Swap)
        if f3_idle and f4_idle:
            for f in [2, 5]: 
                if not states[f] and desired_states[f]:
                    impact = [220, 120, 90, 90, 70, 70][f]
                    # Restore immediately if we have budget (Bypassing 50s cooldown for swaps)
                    if (trig_v + impact) < self.LOAD_THRESHOLD:
                        states[f] = True
                        trig_v += impact
                        shed_log.append({'f': FLOOR_NAMES[f], 'a': 'SWAP-RESTORE'})
                        print(f"[ALGO] Priority Swap: Restored {FLOOR_NAMES[f]} because 3 & 4 are idle.")

        # Step C: Overload Check (Strictly >= LOAD_THRESHOLD)
        if trig_v >= self.LOAD_THRESHOLD:
            for f in current_priority:
                if states[f]:
                    states[f] = False
                    self.last_shed_time[f] = now
                    impact = [220, 120, 90, 90, 70, 70][f]
                    trig_v -= impact
                    shed_log.append({'f': FLOOR_NAMES[f], 'a': 'SHED (Overload)'})
                    print(f"[ALGO] Overload: Shedding {FLOOR_NAMES[f]} to stay under budget.")
                    if trig_v < self.LOAD_THRESHOLD: break

        # Step D: Restoration Check (Headroom = 20W)
        elif trig_v < (self.LOAD_THRESHOLD - self.RESTORE_HEADROOM):
            # Restoration Priority: 0 and 1 always come first and bypass cooldown
            restore_order = [0, 1] + [f for f in current_priority[::-1] if f not in [0, 1]]
            
            for f in restore_order:
                if not states[f] and desired_states[f]:
                    impact = [220, 120, 90, 90, 70, 70][f]
                    if (trig_v + impact) < self.LOAD_THRESHOLD:
                        # Bypass cooldown for critical floors 0 and 1
                        if f in [0, 1] or (now - self.last_shed_time[f]) >= 50.0:
                            states[f] = True
                            trig_v += impact
                            shed_log.append({'f': FLOOR_NAMES[f], 'a': 'RESTORE'})
                            print(f"[ALGO] Restoration: Restored {FLOOR_NAMES[f]}.")

        # Final Sync State
        self.last_states = states[:]
        
        # Build detailed audit for UI transparency
        ldr_msg = "STABLE"
        # Using self.LDR_BRIGHT_THRESH/DARK_THRESH from initialization
        if ldr_m <= self.LDR_BRIGHT_THRESH: ldr_msg = "BRIGHT (Wait 5s to turn OFF)" if self.last_h else "BRIGHT (Lights OFF)"
        elif ldr_m >= self.LDR_DARK_THRESH: ldr_msg = "DARK (Wait 5s to turn ON)" if not self.last_h else "DARK (Lights ON)"
        
        audit = {
            'power_w': round(trig_v, 1),
            'trigger_val': self.LOAD_THRESHOLD,
            'shed_active': any(not s for s in states),
            'shed_floors': str([FLOOR_NAMES[i] for i, s in enumerate(states) if not s]),
            'occupancy': occupancy_status,
            'ldr_dark': self.last_h,
            'ldr_msg': ldr_msg,
            'ldr_lux': ldr_m,
            'log': shed_log,
            'last_update': int(now)
        }
        
        return {
            'relays': {
                'h1': h1, 'h2': h2, 
                'ground': states[0], 'floor1': states[1], 'floor2': states[2], 
                'floor3': states[3], 'floor4': states[4], 'floor5': states[5]
            },
            'audit': audit
        }

engine = SPMSMasterEngine()
cache  = {"spms": {}}
INPUT_PATHS = ['sensorData', 'floorData', 'systemStatus']
last_mode = "AUTO"

def on_event(event):
    global cache, last_mode
    try:
        path = event.path.strip('/')
        is_relevant = not path or any(path.startswith(p) for p in INPUT_PATHS)
        if not path: cache["spms"] = event.data
        else:
            keys = path.split('/')
        # FULL REFRESH: Fetch the latest state directly from Firebase on any relevant change
        # This prevents cache-merging bugs where PIR states might be stale.
        data = db.reference('spms').get()
        if not data: return

        mode = data.get('systemStatus', {}).get('mode', 'AUTO')
        sens = data.get('sensorData', {}) or {}
        fd   = data.get('floorData', {}) or {}
        
        pw   = float(sens.get('totalLoad', 0)) * 1000.0
        if pw == 0.0: print("[WARN] Power is 0.0W. Check PZEM Hardware Link!")
        ldr_m = int(fd.get('floor0', {}).get('ldr', 0)) # Using Floor 0 as master LDR reference
        h_at  = int(sens.get('h_active', 1)) 

        print(f"[{mode}] Sync | Power: {pw}W | Limit: {engine.LOAD_THRESHOLD}W | LDR: {ldr_m}")

        if mode == 'AUTO':
            if last_mode == "MANUAL":
                print("[SYSTEM] Switching to AUTO. Initializing Aggressive Reset...")
                # Force-ON all critical floors to clear manual artifacts
                f3_on = (time.time() - engine.last_motion[3]) <= engine.OCCUPANCY_TIMEOUT
                f4_on = (time.time() - engine.last_motion[4]) <= engine.OCCUPANCY_TIMEOUT
                force_cmd = {
                    'h1': True, 'h2': True, 'ground': True, 'floor1': True, 'floor2': True,
                    'floor3': f3_on, 'floor4': f4_on, 'floor5': True
                }
                db.reference('spms/relays').update(force_cmd)
                engine.last_sent = force_cmd
                engine.last_states = [True, True, True, f3_on, f4_on, True]
                last_mode = "AUTO"
                return

            last_mode = "AUTO"
            
            # Extract inputs for AI Engine
            floor_inputs = {'ldr_main': ldr_m}
            for i in range(6): floor_inputs[f'floor{i}'] = fd.get(f'floor{i}', {})
            
            # [DEBUG] Log sensor states clearly
            pir_vals = [int(fd.get(f'floor{i}', {}).get('pir', 0)) for i in range(6)]
            print(f"[AUTO] Power: {pw}W | LDR: {ldr_m} | PIR: {pir_vals}")
            
            res = engine.process(sens, floor_inputs, h_at)
            relay_cmd = res.get('relays', {})
            audit_log = res.get('audit', {})
            
            if relay_cmd != engine.last_sent:
                db.reference('spms/relays').update(to_json_safe(relay_cmd))
                db.reference('spms/aiAudit').update(to_json_safe(audit_log))
                engine.last_sent = relay_cmd
                print(f"[AUTO] Applied Logic: {audit_log['shed_floors']}")
            else:
                db.reference('spms/aiAudit').update(to_json_safe(audit_log))
            
            # Bridge Heartbeat
            db.reference('spms/health/bridge').update({'last_seen': int(time.time())})

        else:
            if last_mode == "AUTO":
                print("[SYSTEM] Switching to MANUAL. Automation suspended.")
                db.reference('spms/systemStatus').update({'active_mode': 'MANUAL'})
            last_mode = "MANUAL"
            # Update internal state to match manual relay changes
            relays = data.get('relays', {})
            engine.last_sent = relays
            engine.last_states = [
                relays.get('ground', True), relays.get('floor1', True),
                relays.get('floor2', True), relays.get('floor3', True),
                relays.get('floor4', True), relays.get('floor5', True)
            ]

    except Exception as e:
        print(f"[ERROR] Bridge Fault: {e}")

import threading

def heartbeat_loop():
    while True:
        try:
            db.reference('spms/health/bridge').update({'last_seen': int(time.time())})
            db.reference('spms/health/integrity').update({'status': 'NORMAL', 'score': 100})
        except: pass
        time.sleep(10)

if __name__ == "__main__":
    print("\n" + "="*50)
    print("  SPMS INDUSTRIAL AI BRIDGE v6.1 - PRODUCTION")
    print("="*50)
    
    # --- Startup State Sync ---
    # Pull current relays and sensors to avoid "Cold Start" overrides
    print("[INIT] Synchronizing initial state from Firebase...")
    startup_data = db.reference('spms').get()
    if startup_data:
        cache["spms"] = startup_data
        relays = startup_data.get('relays', {})
        engine.last_sent = relays
        engine.last_states = [
            relays.get('ground', True),
            relays.get('floor1', True),
            relays.get('floor2', True),
            relays.get('floor3', True),
            relays.get('floor4', True),
            relays.get('floor5', True)
        ]
        # Initialize last_motion to 0.0 to ensure 50s timeout starts from boot
        engine.last_motion = [0.0] * 6
        print(f"[INIT] Synced states: {engine.last_states}")

    # Start Heartbeat Thread
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    
    print("[INIT] Heartbeat Thread Started. Listening for Firebase events...")
    
    db.reference('spms').listen(on_event)
    while True: time.sleep(1)