import firebase_admin
from firebase_admin import credentials, db
import json

CERT_PATH = "serviceAccountKey.json"
DB_URL = "https://spms-69e9e-default-rtdb.asia-southeast1.firebasedatabase.app"

if not firebase_admin._apps:
    cred = credentials.Certificate(CERT_PATH)
    firebase_admin.initialize_app(cred, {'databaseURL': DB_URL})

data = db.reference('spms').get()
print(json.dumps({
    "mode": data.get('systemStatus', {}).get('mode'),
    "active_mode": data.get('systemStatus', {}).get('active_mode'),
    "totalLoad": data.get('sensorData', {}).get('totalLoad'),
    "sensorFault": data.get('sensorData', {}).get('sensorFault'),
    "aiAudit": data.get('aiAudit')
}, indent=2))
