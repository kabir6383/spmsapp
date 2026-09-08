"""
SPMS Model Accuracy Evaluator
==============================
Loads the trained model, runs evaluation on a fresh test split,
and prints/saves a per-relay accuracy report.
"""

import pandas as pd
import numpy as np
import joblib
import json
import os
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

MODEL_FILE  = 'spms_model.pkl'
DATA_FILE   = 'spms_dataset_600W.csv'
REPORT_FILE = 'accuracy_report.json'
TARGET      = 0.87

print("\n" + "="*55)
print("  SPMS Model Accuracy Evaluator")
print("="*55)

if not os.path.exists(MODEL_FILE):
    exit("[ERROR] No model found. Run: python train_ai.py")
if not os.path.exists(DATA_FILE):
    exit("[ERROR] No dataset found. Run: python generate_dataset.py")

model_data = joblib.load(MODEL_FILE)
df = pd.read_csv(DATA_FILE)

# --- Feature engineering (must match train_ai.py) ---
for i in range(6):
    if f'PIR_Floor_{i}' in df.columns and f'Load_Floor_{i}_W' in df.columns:
        df[f'PIR_Load_{i}'] = df[f'PIR_Floor_{i}'] * df[f'Load_Floor_{i}_W']
if 'Total_Power_W' in df.columns:
    df['Power_Headroom'] = 600.0 - df['Total_Power_W']
    df['Near_Threshold'] = (df['Power_Headroom'].abs() < 50).astype(int)
if 'LDR_Main' in df.columns:
    df['LDR_Hour']    = df['LDR_Main'] * df['Hour']
    df['LDR_IsNight'] = df['LDR_Main'] * df.get('Is_Night', 0)
occ_cols = [f'Occupancy_Floor_{i}' for i in range(6) if f'Occupancy_Floor_{i}' in df.columns]
pir_cols = [f'PIR_Floor_{i}'       for i in range(6) if f'PIR_Floor_{i}'       in df.columns]
if occ_cols: df['Total_Occupied_Floors'] = df[occ_cols].sum(axis=1)
if pir_cols: df['Total_Motion_Floors']   = df[pir_cols].sum(axis=1)

strat = 'Load_Shed_Active' if 'Load_Shed_Active' in df.columns else 'Relay_H1'
_, test_df = train_test_split(df, test_size=0.20, stratify=df[strat], random_state=42)

ldr_targets   = ['Relay_H1', 'Relay_H2']
floor_targets = [f'Relay_Floor_{i}' for i in range(6)]
floor_names   = ['G Floor','1st Floor','2nd Floor','3rd Floor','4th Floor','5th Floor']

report = {'relays': {}, 'per_relay_classification': {}}
all_pass = True

# --- LDR Relays ---
m_ldr = model_data.get('model_ldr')
s_ldr = model_data.get('scaler_ldr')
f_ldr = model_data.get('features_ldr', [])
f_ldr = [f for f in f_ldr if f in test_df.columns]

print(f"\n  {'Relay':<22} {'Accuracy':>10}  {'Status':>6}")
print(f"  {'-'*22} {'-'*10}  {'-'*6}")

if m_ldr and s_ldr and f_ldr:
    X_ldr = s_ldr.transform(test_df[f_ldr].fillna(0))
    y_pred = m_ldr.predict(X_ldr)
    for j, name in enumerate(['H1 (Lighting)', 'H2 (Lighting)']):
        acc = accuracy_score(test_df[ldr_targets[j]], y_pred[:, j])
        ok  = acc >= TARGET
        all_pass &= ok
        print(f"  {name:<22} {acc*100:>9.2f}%  {'PASS' if ok else 'FAIL':>6}")
        report['relays'][ldr_targets[j]] = {'accuracy': round(acc, 4), 'pass': ok}
        report['per_relay_classification'][ldr_targets[j]] = classification_report(
            test_df[ldr_targets[j]], y_pred[:, j], output_dict=True)

# --- Floor Relays ---
m_fl = model_data.get('model_floor')
s_fl = model_data.get('scaler_floor')
f_fl = model_data.get('features_floor', [])
f_fl = [f for f in f_fl if f in test_df.columns]

if m_fl and s_fl and f_fl:
    X_fl = s_fl.transform(test_df[f_fl].fillna(0))
    y_pred_fl = m_fl.predict(X_fl)
    for j, name in enumerate(floor_names):
        acc = accuracy_score(test_df[floor_targets[j]], y_pred_fl[:, j])
        ok  = acc >= TARGET
        all_pass &= ok
        print(f"  {name:<22} {acc*100:>9.2f}%  {'PASS' if ok else 'FAIL':>6}")
        report['relays'][floor_targets[j]] = {'accuracy': round(acc, 4), 'pass': ok}
        report['per_relay_classification'][floor_targets[j]] = classification_report(
            test_df[floor_targets[j]], y_pred_fl[:, j], output_dict=True)

# --- Overall ---
all_acc = [v['accuracy'] for v in report['relays'].values()]
overall = np.mean(all_acc)
report['overall_accuracy'] = round(float(overall), 4)
report['all_relays_pass']  = all_pass

print(f"\n  {'-'*42}")
print(f"  {'Overall System Accuracy':<22} {overall*100:>9.2f}%  {'PASS' if overall >= TARGET else 'FAIL':>6}")
print(f"  {'Target (>=87%)':<22} {TARGET*100:>9.1f}%")
print("="*55)

with open(REPORT_FILE, 'w') as f:
    json.dump(report, f, indent=2)
print(f"\n  Report saved -> {REPORT_FILE}\n")
