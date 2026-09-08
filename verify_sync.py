import firebase_admin
from firebase_admin import credentials, db
import time

SERVICE_ACCOUNT = "serviceAccountKey.json"
DB_URL = 'https://spms-69e9e-default-rtdb.asia-southeast1.firebasedatabase.app/'

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
