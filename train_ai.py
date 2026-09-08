"""
SPMS AI Training Pipeline v5.1 (High-Performance Edition)
========================================================
Trains a ultra-high accuracy (>90%) ensemble model aligned with 
the Industrial Master Algorithm v5.1.
"""

import pandas as pd
import numpy as np
import joblib
import json
import os
import time
from datetime import datetime
from sklearn.ensemble import (
    RandomForestClassifier,
    HistGradientBoostingClassifier,
    VotingClassifier,
)
from sklearn.multioutput import MultiOutputClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# Configuration
BASE_DATA       = 'spms_dataset_professional.csv'
MODEL_FILE      = 'spms_model.pkl'
SCALER_FILE     = 'spms_scaler.pkl'
ACCURACY_REPORT = 'accuracy_report.json'
ACCURACY_TARGET = 0.90
RANDOM_SEED     = 42

def engineer_features(df):
    df = df.copy()
    # Explicit indicators for LDR logic
    df['is_dark']   = (df['LDR_Main'] >= 2500).astype(int)
    df['is_bright'] = (df['LDR_Main'] <= 1200).astype(int)
    
    # Interaction terms for Floor priorities
    for f in range(6):
        df[f'Motion_Priority_{f}'] = df[f'PIR_Floor_{f}'] * (100 if f in [3,4] else 10)
        
    return df

def build_hgb_ensemble():
    # High-performance HistGradientBoosting
    hgb = HistGradientBoostingClassifier(
        max_iter=300,
        max_depth=12,
        learning_rate=0.03,
        l2_regularization=0.1,
        random_state=RANDOM_SEED
    )
    return hgb

def train_model():
    print(f"[AI] Initializing Training Pipeline v5.1...")
    if not os.path.exists(BASE_DATA):
        print("[ERROR] Dataset missing.")
        return
        
    df = pd.read_csv(BASE_DATA)
    df = engineer_features(df)
    
    # Feature set
    features = ['Hour', 'Voltage_V', 'LDR_Main', 'Total_Power_W', 'Power_Factor', 'is_dark', 'is_bright']
    for f in range(6):
        features.extend([f'PIR_Floor_{f}', f'Load_Floor_{f}_W', f'Motion_Priority_{f}'])
        
    targets = ['Relay_H1', 'Relay_H2'] + [f'Relay_Floor_{f}' for f in range(6)]
    
    X = df[features]
    y = df[targets]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=RANDOM_SEED)
    
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)
    
    print(f"[AI] Training Multi-Output Ensemble on {len(X_train)} samples...")
    start = time.time()
    
    # We use a MultiOutput wrapper around our high-perf classifier
    model = MultiOutputClassifier(build_hgb_ensemble(), n_jobs=-1)
    model.fit(X_train_scaled, y_train)
    
    end = time.time()
    print(f"[AI] Training complete in {end-start:.1f}s")
    
    # Evaluation
    y_pred = model.predict(X_test_scaled)
    report = {'relays': {}, 'overall_accuracy': 0}
    
    total_acc = 0
    for i, col in enumerate(targets):
        acc = accuracy_score(y_test.iloc[:, i], y_pred[:, i])
        report['relays'][col] = round(acc, 4)
        print(f"      {col:15s}: {acc*100:.2f}%")
        total_acc += acc
        
    avg_acc = total_acc / len(targets)
    report['overall_accuracy'] = round(avg_acc, 4)
    print(f"[AI] OVERALL ACCURACY: {avg_acc*100:.2f}%")
    
    # Save Artifacts
    joblib.dump({
        'model': model,
        'scaler': scaler,
        'features': features,
        'targets': targets,
        'version': '5.1'
    }, MODEL_FILE)
    
    with open(ACCURACY_REPORT, 'w') as f:
        json.dump(report, f, indent=2)
        
    print(f"[AI] Models saved. Accuracy target {'MET' if avg_acc >= ACCURACY_TARGET else 'FAILED'}.")

if __name__ == "__main__":
    train_model()