import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Platform } from 'react-native';
import { Title, Subheading } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ref, onValue } from 'firebase/database';
import { database } from '@/constants/firebaseConfig';
import { AuthContext } from './_layout';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, withRepeat, withTiming, withSequence, useSharedValue } from 'react-native-reanimated';

// --- Global Online Detection State (Bulletproof against Fast Refresh) ---
let g_bridgeLastTs = 0;
let g_deviceLastTs = 0;
let g_lastActivity = Date.now();

export default function HealthScreen() {
  const { isLoggedIn } = useContext(AuthContext);
  const router = useRouter();
  const [healthData, setHealthData] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [isBridgeOnline, setIsBridgeOnline] = useState(false);
  const [uiMode, setUiMode] = useState('day');
  const [aiHealth, setAiHealth] = useState<any>(null);
  const [sentinel, setSentinel] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/');
    }
  }, [isLoggedIn]);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.1, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1, true
    );
  }, []);

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
        setData(val);
        setHealthData(isLive ? val.health : null);
        if (val.settings?.ui_mode) setUiMode(val.settings.ui_mode);
        if (val.ai_health) setAiHealth(val.ai_health);
        if (val.health?.integrity) setSentinel(val.health.integrity);
        if (val.logs) {
            const logArr = Object.values(val.logs).sort((a: any, b: any) => 
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            setLogs(logArr);
        }
      } else {
        setHealthData(null);
        setIsBridgeOnline(false);
      }
    });
    return () => unsubscribe();
  }, [isLoggedIn]);

  const accentColor = uiMode === 'night' ? '#00D4FF' : '#39FF14';
  const getStatusColor = (status: string) => status === 'online' ? accentColor : '#FF3131';

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    borderColor: isBridgeOnline ? accentColor : '#FF3131',
  }));

  const floors = [
    { id: 'ground', label: 'GROUND FLOOR', sensors: ['pzem_g', 'lux_g'] },
    { id: 'floor1', label: 'FLOOR 1', sensors: ['pzem_1', 'lux_1'] },
    { id: 'floor2', label: 'FLOOR 2', sensors: ['pzem_2', 'lux_2'] },
    { id: 'floor3', label: 'FLOOR 3', sensors: ['pzem_3', 'lux_3'] },
    { id: 'floor4', label: 'FLOOR 4', sensors: ['pzem_4', 'lux_4'] },
    { id: 'floor5', label: 'FLOOR 5', sensors: ['pzem_5', 'lux_5'] },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.tabTitle}>HEALTH</Text>
      </View>
      {!isBridgeOnline && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons name="wifi-off" size={20} color="#000" />
          <Text style={styles.offlineText}>TERMINAL OFFLINE - HARDWARE DISCONNECTED</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Title style={styles.title}>SYSTEM HEALTH</Title>
          <Subheading style={styles.sub}>Master-Node Diagnostics Terminal</Subheading>
        </View>

        <View style={styles.heroCard}>
          <Animated.View style={[styles.pulseCircle, pulseStyle]} />
          <View style={styles.statusBox}>
            <Text style={styles.statusLab}>TERMINAL HEARTBEAT</Text>
            <Text style={[styles.statusVal, { color: isBridgeOnline ? accentColor : '#FF3131' }]}>{isBridgeOnline ? 'CONNECTED' : 'OFFLINE'}</Text>
          </View>

        <View style={styles.sentinelCard}>
           <View style={styles.sentinelHead}>
              <MaterialCommunityIcons name="shield-check-outline" size={20} color={accentColor} />
              <Text style={[styles.sentinelTitle, { color: accentColor }]}>SENTINEL POWER GUARD</Text>
           </View>
           <View style={styles.sentinelMain}>
              <View style={styles.sMetric}>
                 <Text style={styles.sMLab}>INTEGRITY</Text>
                  <Text style={[styles.sMVal, { color: (sentinel?.score || 0) > 80 ? accentColor : (sentinel?.score > 0 ? '#FFD700' : '#555') }]}>{sentinel?.score || 0}%</Text>
              </View>
              <View style={styles.sMetric}>
                 <Text style={styles.sMLab}>VOLTAGE STAB.</Text>
                  <Text style={[styles.sMVal, { color: sentinel?.voltage_stability > 0 ? '#FFF' : '#555' }]}>{sentinel?.voltage_stability || 0}%</Text>
              </View>
              <View style={styles.sMetric}>
                 <Text style={styles.sMLab}>PF HEALTH</Text>
                  <Text style={[styles.sMVal, { color: sentinel?.pf_health > 0 ? '#FFF' : '#555' }]}>{sentinel?.pf_health || 0}%</Text>
              </View>
           </View>
           <View style={styles.sentinelFooter}>
              <Text style={styles.sFText}>STATUS: <Text style={{ color: (sentinel?.status === 'NORMAL') ? '#555' : '#FF3131' }}>{sentinel?.status || 'NORMAL'}</Text></Text>
              <View style={[styles.lockBadge, { backgroundColor: (sentinel?.status === 'NORMAL') ? 'rgba(57, 255, 20, 0.05)' : 'rgba(255, 49, 49, 0.1)' }]}>
                 <Text style={[styles.lockText, { color: (sentinel?.status === 'NORMAL') ? accentColor : '#FF3131' }]}>
                    {sentinel?.status === 'NORMAL' ? 'INTERLOCK ARMED' : 'SAFETY ENGAGED'}
                 </Text>
              </View>
           </View>
        </View>
        </View>

        <View style={styles.aiCard}>
           <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
             <MaterialCommunityIcons name="brain" size={24} color={accentColor} />
             <Text style={[styles.aiTitle, { color: accentColor }]}>AI OPERATIONAL HUB</Text>
           </View>
           <View style={styles.aiStatusRow}>
              <View>
                <Text style={styles.aiLabel}>MODEL STATUS</Text>
                <Text style={styles.aiVal}>{aiHealth?.status?.toUpperCase() || 'INITIALIZING'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.aiLabel}>LAST DECISION</Text>
                <Text style={styles.aiVal}>{aiHealth?.last_decision === 1 ? 'SHEDDING' : 'OPTIMIZING'}</Text>
              </View>
           </View>
        </View>

        <View style={styles.nodeGrid}>
          <Text style={styles.gridTitle}>Building Infrastructure Map</Text>
          {floors.map((floor) => (
            <View key={floor.id} style={styles.floorGroupCard}>
              <Text style={[styles.fGroupTitle, { color: accentColor }]}>{floor.label}</Text>
              <View style={styles.nodeList}>
                {floor.sensors.map((s) => {
                  const isPzem = s.startsWith('pzem');
                  const isLux  = s.startsWith('lux');
                  let live = false;

                  if (healthData?.sensors?.[s] === 'online') {
                    live = true;
                  } else if (isPzem && (data?.sensorData?.voltage > 0)) {
                    live = true; // Infer from main meter
                  } else if (isLux) {
                    const floorIdx = floor.id === 'ground' ? 0 : parseInt(floor.id.replace('floor',''));
                    const ldrVal = data?.floorData?.[`floor${floorIdx}`]?.ldr;
                    if (ldrVal !== undefined && ldrVal !== null) live = true;
                  }

                  const statusStr = live ? 'online' : 'offline';

                  return (
                    <View key={s} style={styles.nodeCard}>
                      <View style={[styles.nodeIndicator, { backgroundColor: getStatusColor(statusStr) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.nodeName}>{s.toUpperCase().replace('_', ' ')} Master</Text>
                        <Text style={[styles.nodeStatus, { color: getStatusColor(statusStr) }]}>
                          {statusStr.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* Industrial Audit Trail Removed per user request */}
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
  scroll: { padding: 25 },
  header: { marginBottom: 30 },
  title: { color: '#FFF', fontWeight: '900', fontSize: 24 },
  sub: { color: '#555', fontSize: 14 },
  heroCard: { height: 180, backgroundColor: '#111', borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 25, borderWidth: 1, borderColor: '#222' },
  pulseCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, position: 'absolute' },
  statusBox: { alignItems: 'center' },
  statusLab: { color: '#555', fontSize: 10, fontWeight: 'bold' },
  statusVal: { fontSize: 24, fontWeight: '900', marginTop: 10 },
  aiCard: { backgroundColor: '#111', borderRadius: 30, padding: 25, marginBottom: 25, borderWidth: 1, borderColor: '#222' },
  aiTitle: { fontSize: 12, fontWeight: 'bold', marginLeft: 15, letterSpacing: 2 },
  aiStatusRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  aiLabel: { color: '#444', fontSize: 9, fontWeight: 'bold', marginBottom: 5 },
  aiVal: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  sentinelCard: { backgroundColor: '#111', borderRadius: 30, padding: 25, marginBottom: 25, borderWidth: 1, borderColor: '#222' },
  sentinelHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  sentinelTitle: { fontSize: 10, fontWeight: 'bold', marginLeft: 15, letterSpacing: 2 },
  sentinelMain: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  sMetric: { alignItems: 'center' },
  sMLab: { color: '#444', fontSize: 7, fontWeight: 'bold', marginBottom: 8 },
  sMVal: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  sentinelFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingTop: 15 },
  sFText: { color: '#444', fontSize: 8, fontWeight: 'bold' },
  lockBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  lockText: { fontSize: 7, fontWeight: '900' },
  nodeGrid: { marginBottom: 30 },
  gridTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 16, marginBottom: 15 },
  floorGroupCard: { backgroundColor: '#111', borderRadius: 30, padding: 25, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  fGroupTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 15, letterSpacing: 2 },
  nodeList: {},
  nodeCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  nodeIndicator: { width: 8, height: 8, borderRadius: 4, marginRight: 20 },
  nodeName: { color: '#888', fontWeight: 'bold', fontSize: 11, marginBottom: 4 },
  nodeStatus: { fontSize: 9, fontWeight: '900' },
  diagnosticCard: { backgroundColor: '#111', padding: 30, borderRadius: 35, marginBottom: 50, borderWidth: 1, borderColor: '#222' },
  diagTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 14, marginBottom: 20 },
  logLine: { marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start' },
  logTime: { color: '#444', fontSize: 9, fontWeight: 'bold', width: 70, marginTop: 2 },
  logText: { flex: 1, fontSize: 11, lineHeight: 16 }
});
