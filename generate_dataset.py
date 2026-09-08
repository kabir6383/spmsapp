"""
SPMS Industrial Dataset Generator v5.1 (Professional Edition)
============================================================
Generates a physics-accurate training dataset aligned with the 
Industrial Master Algorithm v5.1.

Logic:
- LDR Thresh: 2500 (Dark), 1200 (Bright)
- Priority: Ground > 1st > 2nd > 3rd(Motion) > 4th(Motion) > 5th
- Trigger: 598W
- Motion Timeout: 1 minute (simulated as 12 samples of 5s each)
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random

# Constants
POWER_THRESHOLD_W  = 600.0
SHED_TRIGGER_W     = 598.0
LDR_DARK_THRESH    = 2500
LDR_BRIGHT_THRESH  = 1200
NOMINAL_LOADS      = [220.0, 120.0, 90.0, 90.0, 70.0, 70.0]
NUM_FLOORS         = 6
NUM_SAMPLES        = 20_000 # Increased for better accuracy
RANDOM_SEED        = 42

np.random.seed(RANDOM_SEED)
random.seed(RANDOM_SEED)

def get_relay_priority(pir_status, floor_idx):
    # Hierarchy: G=100, 1=90, 2=80, 3=70, 4=60, 5=50
    base = [100, 90, 80, 70, 60, 50][floor_idx]
    if floor_idx in [3, 4] and pir_status == 1:
        base += 100 # Motion boost
    return base

def generate_industrial_data():
    print(f"[GEN] Generating {NUM_SAMPLES:,} Professional SPMS Samples...")
    rows = []
    
    for i in range(NUM_SAMPLES):
        # 1. Random Inputs
        hour = random.randint(0, 23)
        ldr_main = random.randint(0, 4095)
        voltage = round(np.random.uniform(220, 245), 1)
        
        # Motion Simulation (Heavier on lower floors during day, lower overall at night)
        pir = [0] * 6
        for f in range(6):
            prob = [0.8, 0.6, 0.4, 0.3, 0.3, 0.2][f] if 8 <= hour <= 20 else 0.05
            pir[f] = 1 if random.random() < prob else 0
            
        # Actual Load per floor (Boosted for better shedding training)
        floor_loads = [round(NOMINAL_LOADS[f] * np.random.uniform(0.9, 1.5), 1) if pir[f] or random.random() < 0.4 else 0 for f in range(6)]

        
        # 2. Algorithm Simulation
        relay = [True] * 8
        
        # Daylight Harvesting (H1, H2)
        h_on = (ldr_main >= LDR_DARK_THRESH)
        relay[0] = relay[1] = h_on
        
        # Calculate Initial Load
        total_p = sum(floor_loads) + (20.0 if h_on else 0)
        
        shed_active = False
        if total_p >= SHED_TRIGGER_W:
            # Shed Order: Lowest priority first
            scores = [(f, get_relay_priority(pir[f], f)) for f in range(6)]
            scores.sort(key=lambda x: x[1]) # Ascending priority
            
            tmp_p = total_p
            for f_idx, score in scores:
                if tmp_p < SHED_TRIGGER_W: break
                relay[f_idx + 2] = False
                tmp_p -= floor_loads[f_idx]
                shed_active = True
        
        # 3. Final Current and Power
        final_p = sum(floor_loads[f] for f in range(6) if relay[f+2]) + (20.0 if relay[0] else 0)
        pf = round(np.random.uniform(0.85, 0.99), 2)
        current = round(final_p / (voltage * pf), 3)
        
        # 4. Build Row
        row = {
            'Hour': hour,
            'Voltage_V': voltage,
            'LDR_Main': ldr_main,
            'Total_Power_W': round(final_p, 1),
            'Power_Factor': pf,
            'Load_Shed_Active': int(shed_active)
        }
        for f in range(6):
            row[f'PIR_Floor_{f}'] = pir[f]
            row[f'Load_Floor_{f}_W'] = floor_loads[f]
            row[f'Relay_Floor_{f}'] = int(relay[f+2])
        
        row['Relay_H1'] = int(relay[0])
        row['Relay_H2'] = int(relay[1])
        
        rows.append(row)

    df = pd.DataFrame(rows)
    df.to_csv('spms_dataset_professional.csv', index=False)
    print(f"[GEN] Dataset saved to spms_dataset_professional.csv")
    print(f"      Shedding Frequency: {df['Load_Shed_Active'].mean()*100:.1f}%")
    return df

if __name__ == "__main__":
    generate_industrial_data()
