"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spmsAIEngine = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const LOAD_THRESHOLD = 600.0;
const RESTORE_HEADROOM = 20.0;
const PRIORITY_ORDER = [5, 2, 4, 3, 1, 0];
const LOADS = [220, 120, 90, 90, 70, 70];
exports.spmsAIEngine = functions.database.ref("/spms")
    .onWrite(async (change, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const data = change.after.val();
    if (!data || ((_a = data.systemStatus) === null || _a === void 0 ? void 0 : _a.active_mode) !== "AUTO")
        return null;
    const relays = data.relays || {};
    let states = [
        (_b = relays.ground) !== null && _b !== void 0 ? _b : true,
        (_c = relays.floor1) !== null && _c !== void 0 ? _c : true,
        (_d = relays.floor2) !== null && _d !== void 0 ? _d : true,
        (_e = relays.floor3) !== null && _e !== void 0 ? _e : true,
        (_f = relays.floor4) !== null && _f !== void 0 ? _f : true,
        (_g = relays.floor5) !== null && _g !== void 0 ? _g : true
    ];
    let trigV = (((_h = data.sensorData) === null || _h === void 0 ? void 0 : _h.totalLoad) || 0) * 1000.0;
    const ldr0 = ((_k = (_j = data.floorData) === null || _j === void 0 ? void 0 : _j.floor0) === null || _k === void 0 ? void 0 : _k.ldr) || 0;
    // 1. LDR Logic (Dark = ON, Bright = OFF)
    // Values: 0-2 = Dark (Shadow), 500+ = Bright (Natural)
    let ldrState = true;
    if (ldr0 >= 500)
        ldrState = false; // Bright -> OFF
    else if (ldr0 <= 2)
        ldrState = true; // Dark -> ON
    // Apply LDR to critical floors (0, 1)
    if (!ldrState) {
        if (states[0]) {
            states[0] = false;
            trigV -= LOADS[0];
        }
        if (states[1]) {
            states[1] = false;
            trigV -= LOADS[1];
        }
    }
    // 2. Load Shedding Logic
    if (trigV >= LOAD_THRESHOLD) {
        for (const f of PRIORITY_ORDER) {
            if (states[f]) {
                states[f] = false;
                trigV -= LOADS[f];
                if (trigV < LOAD_THRESHOLD)
                    break;
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
    const changed = states[0] !== relays.ground ||
        states[1] !== relays.floor1 ||
        states[2] !== relays.floor2 ||
        states[3] !== relays.floor3 ||
        states[4] !== relays.floor4 ||
        states[5] !== relays.floor5;
    if (!changed)
        return null;
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
//# sourceMappingURL=index.js.map