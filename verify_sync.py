import firebase_admin
from firebase_admin import credentials, db
import time

import os

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

SERVICE_ACCOUNT = os.environ.get("FIREBASE_SERVICE_ACCOUNT") or "serviceAccountKey.json"
DB_URL = os.environ.get("EXPO_PUBLIC_FIREBASE_DATABASE_URL") or os.environ.get("FIREBASE_DATABASE_URL") or 'https://spms-69e9e-default-rtdb.asia-southeast1.firebasedatabase.app/'

try:
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT)
        firebase_admin.initialize_app(cred, {'databaseURL': DB_URL})
    
    # Check device health timestamp
    data = db.reference('spms/health/device').get()
    if data:
        ts = data.get('timestamp', 0)
        now = int(time.time())
        diff = now - ts
        print(f"DEVICE_TS: {ts}")
        print(f"CURRENT_TS: {now}")
        print(f"DIFF: {diff} seconds")
        if diff < 60:
            print("STATUS: SYNC_OK")
        else:
            print("STATUS: SYNC_STALE")
    else:
        print("STATUS: NO_DATA")
except Exception as e:
    print(f"ERROR: {e}")
