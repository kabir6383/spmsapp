import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const LOAD_THRESHOLD = 600.0;
const RESTORE_HEADROOM = 20.0;
const PRIORITY_ORDER = [5, 2, 4, 3, 1, 0];
const LOADS = [220, 120, 90, 90, 70, 70]; 

export const spmsAIEngine = functions.database.ref("/spms")
    .onWrite(async (change, context) => {
        const data = change.after.val();
        if (!data || data.systemStatus?.active_mode !== "AUTO") return null;

        const relays = data.relays || {};
        let states = [
            relays.ground ?? true, relays.floor1 ?? true,
            relays.floor2 ?? true, relays.floor3 ?? true,
            relays.floor4 ?? true, relays.floor5 ?? true
        ];

        let trigV = (data.sensorData?.totalLoad || 0) * 1000.0;
        const ldr0 = data.floorData?.floor0?.ldr || 0;
        
        // 1. LDR Logic (Dark = ON, Bright = OFF)
        // Values: 0-2 = Dark (Shadow), 500+ = Bright (Natural)
        let ldrState = true; 
        if (ldr0 >= 500) ldrState = false; // Bright -> OFF
        else if (ldr0 <= 2) ldrState = true; // Dark -> ON
        
        // Apply LDR to critical floors (0, 1)
        if (!ldrState) {
            if (states[0]) { states[0] = false; trigV -= LOADS[0]; }
            if (states[1]) { states[1] = false; trigV -= LOADS[1]; }
        }

        // 2. Load Shedding Logic
        if (trigV >= LOAD_THRESHOLD) {
            for (const f of PRIORITY_ORDER) {
                if (states[f]) {
                    states[f] = false;
                    trigV -= LOADS[f];
                    if (trigV < LOAD_THRESHOLD) break;
                }
            }
        } 
        // 3. Restoration Logic
        else if (trigV < (LOAD_THRESHOLD - RESTORE_HEADROOM)) {
            // Restore priority: Critical floors first, then low to high
            const restoreOrder = [0, 1, 5, 2, 4, 3];
            for (const f of restoreOrder) {
                if (!states[f]) {
                    // Check if it fits in budget
                    if (trigV + LOADS[f] < LOAD_THRESHOLD) {
                        states[f] = true;
                        trigV += LOADS[f];
                    }
                }
            }
        }

        // 4. Final state check to avoid redundant writes
        const changed = 
            states[0] !== relays.ground || 
            states[1] !== relays.floor1 || 
            states[2] !== relays.floor2 || 
            states[3] !== relays.floor3 || 
            states[4] !== relays.floor4 || 
            states[5] !== relays.floor5;

        if (!changed) return null;

        console.log(`[AI CLOUD] Applying Logic. New States: ${states}`);

        // Update Firebase
        return change.after.ref.child("relays").update({
            ground: states[0],
            floor1: states[1],
            floor2: states[2],
            floor3: states[3],
            floor4: states[4],
            floor5: states[5]
        });
    });
