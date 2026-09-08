import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, TouchableOpacity, Switch, Platform } from 'react-native';
import { ProgressBar, Title, Subheading } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { ref, onValue, set } from 'firebase/database';
import { database } from '@/constants/firebaseConfig';
import { AuthContext } from './_layout';
import { useRouter } from 'expo-router';

// --- Global Online Detection State (Bulletproof against Fast Refresh) ---
let g_bridgeLastTs = 0;
let g_deviceLastTs = 0;
let g_lastActivity = Date.now();

export default function SheddingScreen() {
  const { isLoggedIn } = useContext(AuthContext);
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [isBridgeOnline, setIsBridgeOnline] = useState(false);
  const [sensorStatuses, setSensorStatuses] = useState<any>({});
  const [systemMode, setSystemMode] = useState('MANUAL');
  const [uiMode, setUiMode] = useState('day');
  const alertOpacity = useState(new Animated.Value(1))[0];


  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/');
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const spmsRef = ref(database, 'spms');
    const unsubscribe = onValue(spmsRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        // --- CLOCK-DRIFT PROOF ONLINE DETECTION ---
        const bridgeTs = Number(val.health?.bridge?.last_seen) || 0;
        const deviceTs = Number(val.health?.device?.timestamp) || 0;
        
        if (bridgeTs !== g_bridgeLastTs || deviceTs !== g_deviceLastTs) {
           g_lastActivity = Date.now();
           g_bridgeLastTs = bridgeTs;
           g_deviceLastTs = deviceTs;
        }

        const isLive = (Date.now() - g_lastActivity) < 60000;
        setIsBridgeOnline(isLive);


        setSensorStatuses(val.health?.sensors || {});
        setData(val);
        if (val.settings?.ui_mode) setUiMode(val.settings.ui_mode);
        const modeVal = val.systemStatus?.mode || 'AUTO';
        setSystemMode(modeVal);
      } else {
        setData(null);
        setIsBridgeOnline(false);
      }
    });
    return () => unsubscribe();
  }, [isLoggedIn]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(alertOpacity, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(alertOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const accentColor = uiMode === 'night' ? '#00D4FF' : '#39FF14';
  const sensorData = data?.sensorData || {};
  const relayStatus = data?.relays || {};
  const totalLoad = sensorData.totalLoad || 0;
  const isHighLoad = totalLoad >= 0.598; // 598 Watts = 0.598 kW

  const toggleRelay = (key: string, current: boolean) => {
    if (systemMode === 'AUTO') return;
    set(ref(database, `spms/relays/${key}`), !current);
  };

  const buildingRelays = [
    { id: 'h1', label: 'HARVEST 1', sid: 'h1' },
    { id: 'h2', label: 'HARVEST 2', sid: 'h2' },
    { id: 'ground', label: 'GROUND', sid: 'g' },
    { id: 'floor1', label: 'FLOOR 1', sid: '1' },
    { id: 'floor2', label: 'FLOOR 2', sid: '2' },
    { id: 'floor3', label: 'FLOOR 3', sid: '3' },
    { id: 'floor4', label: 'FLOOR 4', sid: '4' },
    { id: 'floor5', label: 'FLOOR 5', sid: '5' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.tabTitle}>SHEDDING</Text>
      </View>
      {/* Offline Banner Removed per user request */}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Title style={styles.title}>LOAD SHEDDING</Title>
          <Subheading style={styles.sub}>Clinical Infrastructure Control</Subheading>
        </View>

        {/* LOAD MONITOR */}
        <View style={[styles.mainCard, { borderColor: accentColor }]}>
          <View style={styles.heroRow}>
            <View>
                <Text style={styles.heroLab}>CURRENT BUILDING LOAD</Text>
                <Text style={[styles.heroVal, isHighLoad && { color: '#FF3131' }]}>{totalLoad.toFixed(1)} <Text style={[styles.heroUnit, { color: accentColor }]}>kW</Text></Text>
            </View>
            <View style={[styles.prioMaster, { backgroundColor: isHighLoad ? 'rgba(255, 49, 49, 0.1)' : 'rgba(57, 255, 20, 0.1)' }]}>
                <Text style={[styles.prioMasterText, { color: isHighLoad ? '#FF3131' : accentColor }]}>{isHighLoad ? 'PEAK' : 'STABLE'}</Text>
            </View>
          </View>
          <ProgressBar progress={Math.min(totalLoad/1.0, 1)} color={isHighLoad ? (systemMode === 'AUTO' ? '#FF3131' : '#FFD700') : accentColor} style={styles.progress} />
          {isHighLoad && (
            <Animated.View style={[styles.alert, { opacity: alertOpacity }]}>
              <MaterialCommunityIcons name={systemMode === 'AUTO' ? "shield-alert" : "alert"} size={16} color={systemMode === 'AUTO' ? "#FF3131" : "#FFD700"} />
              <Text style={[styles.alertText, systemMode === 'MANUAL' && { color: '#FFD700' }]}>
                {systemMode === 'AUTO' ? 'AUTOMATIC LOAD LIMITING ENGAGED' : 'PEAK LOAD DETECTED (MANUAL OVERRIDE - NO SHEDDING)'}
              </Text>
            </Animated.View>
          )}
        </View>

        {/* MASTER SYSTEM CONTROLLER */}
        <View style={styles.masterSection}>
            <View style={styles.masterHeader}>
                <MaterialCommunityIcons name="robot-industrial" size={22} color={accentColor} />
                <Text style={styles.masterTitle}>MASTER BUILDING COMMAND</Text>
            </View>
            <View style={styles.masterRow}>
                <View>
                    <Text style={styles.modeStatusText}>SYSTEM MODE: <Text style={{color: accentColor}}>{systemMode}</Text></Text>
                    <Text style={styles.modeDesc}>{systemMode === 'AUTO' ? 'AI is managing energy optimization.' : 'Manual hardware control active.'}</Text>
                </View>
                <Switch 
                    value={systemMode === 'AUTO'}
                    onValueChange={async (val) => {
                        if (val) {
                            setSystemMode('AUTO');
                            set(ref(database, 'spms/systemStatus/mode'), 'AUTO');
                        } else {
                            let authSuccess = false;
                            if (Platform.OS === 'web') {
                                authSuccess = true;
                            } else {
                                const result = await LocalAuthentication.authenticateAsync({
                                    promptMessage: 'Authorize Manual System Override',
                                });
                                authSuccess = result.success;
                            }

                            if (authSuccess) {
                                setSystemMode('MANUAL');
                                set(ref(database, 'spms/systemStatus/mode'), 'MANUAL');
                            }
                        }
                    }}
                    trackColor={{ false: '#222', true: accentColor }}
                    thumbColor="#FFF"
                />
            </View>
        </View>

        <View style={styles.gridHeader}>
            <Text style={styles.gridTitle}>8-CHANNEL RELAY MATRIX</Text>
            <View style={styles.liveBadge}><View style={[styles.liveDot, { backgroundColor: accentColor }]} /><Text style={styles.liveText}>HARDWARE READY</Text></View>
        </View>

        <View style={styles.relayGrid}>
            {buildingRelays.map((relay, index) => {
                const isActive = relayStatus[relay.id] || false;
                const isFloor = index < 6;
                const nodeOnline = isFloor ? (sensorStatuses[`pzem_${relay.sid}`] === 'online' || sensorStatuses[`lux_${relay.sid}`] === 'online') : true;

                return (
                    <TouchableOpacity 
                        key={relay.id} 
                        style={[styles.relayCard, isActive && (uiMode === 'night' ? styles.relayCardActiveNight : styles.relayCardActive)]}
                        onPress={() => toggleRelay(relay.id, isActive)}
                        disabled={systemMode === 'AUTO'}
                    >
                        <MaterialCommunityIcons 
                            name={isActive ? "lightning-bolt" : "lightning-bolt-outline"} 
                            size={20} 
                            color={isActive ? "#000" : "#444"} 
                        />
                        <Text style={[styles.relayLabel, isActive && { color: '#000' }]}>{relay.label}</Text>
                        <View style={[styles.miniStatus, { backgroundColor: isActive ? '#000' : (nodeOnline ? accentColor : '#333') }]} />
                    </TouchableOpacity>
                )
            })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: 60 },
  topBar: { paddingHorizontal: 25, marginBottom: 10 },
  tabTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  offlineBanner: { backgroundColor: '#FF3131', paddingVertical: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  offlineText: { color: '#000', fontSize: 10, fontWeight: '900', marginLeft: 10 },
  scroll: { paddingHorizontal: 20 },
  header: { marginBottom: 30, paddingHorizontal: 5 },
  title: { color: '#FFF', fontWeight: '900', fontSize: 24, letterSpacing: 1 },
  sub: { color: '#555', fontSize: 14 },
  mainCard: { backgroundColor: '#0A0A0A', padding: 25, borderRadius: 25, borderWidth: 1, marginBottom: 25 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  heroLab: { color: '#444', fontWeight: 'bold', fontSize: 10, letterSpacing: 2 },
  heroVal: { color: '#FFF', fontSize: 36, fontWeight: '900', marginTop: 8 },
  heroUnit: { fontSize: 18 },
  prioMaster: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  prioMasterText: { fontSize: 10, fontWeight: '900' },
  progress: { height: 6, borderRadius: 3, backgroundColor: '#111' },
  alert: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  alertText: { color: '#FF3131', fontWeight: 'bold', fontSize: 9, marginLeft: 8, letterSpacing: 1 },
  
  masterSection: { backgroundColor: '#0A0A0A', borderRadius: 20, padding: 20, marginBottom: 30, borderWidth: 1, borderColor: '#111' },
  masterHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  masterTitle: { color: '#FFF', fontSize: 12, fontWeight: '900', marginLeft: 10, letterSpacing: 1 },
  masterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeStatusText: { color: '#888', fontWeight: 'bold', fontSize: 11 },
  modeDesc: { color: '#444', fontSize: 9, marginTop: 4 },

  gridHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 5 },
  gridTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  liveDot: { width: 5, height: 5, borderRadius: 3, marginRight: 6 },
  liveText: { color: '#FFF', fontSize: 8, fontWeight: 'bold' },

  relayGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  relayCard: { backgroundColor: '#0A0A0A', width: '48%', height: 80, borderRadius: 15, marginBottom: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  relayCardActive: { backgroundColor: '#39FF14' },
  relayCardActiveNight: { backgroundColor: '#00D4FF' },
  relayLabel: { color: '#666', fontSize: 10, fontWeight: 'bold', marginTop: 8 },
  miniStatus: { position: 'absolute', top: 10, right: 10, width: 6, height: 6, borderRadius: 3 }
});
