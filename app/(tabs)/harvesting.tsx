import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Title, Subheading, ProgressBar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ref, onValue, update } from 'firebase/database';
import { database } from '@/constants/firebaseConfig';
import { AuthContext } from './_layout';
import { useRouter } from 'expo-router';

// --- Global Online Detection State (Bulletproof against Fast Refresh) ---
let g_bridgeLastTs = 0;
let g_deviceLastTs = 0;
let g_lastActivity = Date.now();

export default function HarvestingScreen() {
  const { isLoggedIn } = useContext(AuthContext);
  const router = useRouter();
  const [solarData, setSolarData] = useState<any>(null);
  const [isBridgeOnline, setIsBridgeOnline] = useState(false);
  const [sensorStatuses, setSensorStatuses] = useState<any>({});
  const [uiMode, setUiMode] = useState('day');

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

        setSolarData(val); // Store full object
        if (val.settings?.ui_mode) setUiMode(val.settings.ui_mode);
      } else {
        setSolarData(null);
        setIsBridgeOnline(false);
      }
    });
    return () => unsubscribe();
  }, [isLoggedIn]);

  const accentColor = uiMode === 'night' ? '#00D4FF' : '#39FF14';

  const possibleLabs = ['ground', 'floor1', 'floor2', 'floor3', 'floor4', 'floor5'];
  const floors = possibleLabs.map((f, i) => {
    const sid = i === 0 ? 'g' : i.toString();
    const floorData = solarData?.floorData?.[`floor${i}`];
    const isOnline = isBridgeOnline && (floorData !== undefined);
    const luxVal = floorData?.ldr || 0;
    return {
      id: f,
      sid,
      label: f.toUpperCase(),
      lux: luxVal,
      isOnline
    }
  });

  const avgLux = floors.length > 0 ? (floors.reduce((acc, f) => acc + f.lux, 0) / floors.length) : 0;
  const mainLux = solarData?.sensorData?.ldr_lx ?? avgLux;
  const isHarvestAuto = solarData?.sensorData?.harvest_enabled ?? true;

  const toggleHarvestAuto = () => {
    const dbRef = ref(database, 'spms/sensorData');
    update(dbRef, { harvest_enabled: !isHarvestAuto });
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.tabTitle}>HARVESTING</Text>
      </View>
      {!isBridgeOnline && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons name="wifi-off" size={20} color="#000" />
          <Text style={styles.offlineText}>TERMINAL OFFLINE - WAITING FOR HARDWARE</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Title style={styles.title}>DAY LIGHT HARVESTING</Title>
              <Subheading style={styles.sub}>Precision Irradiance Map & Human Visibility</Subheading>
            </View>
            <View style={[styles.autoBtn, { borderColor: isHarvestAuto ? accentColor : '#333' }]} onTouchEnd={toggleHarvestAuto}>
               <MaterialCommunityIcons name={isHarvestAuto ? "robot" : "hand-back-right"} size={20} color={isHarvestAuto ? accentColor : '#555'} />
               <Text style={[styles.autoText, { color: isHarvestAuto ? accentColor : '#555' }]}>{isHarvestAuto ? 'AUTO' : 'MANUAL'}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.mainHero, { borderColor: accentColor }]}>
          <View style={styles.heroTop}>
            <View style={[styles.iconBox, { backgroundColor: `${accentColor}1A` }]}>
              <MaterialCommunityIcons name="brightness-7" size={32} color={accentColor} />
            </View>
            <Text style={styles.heroLab}>BUILDING IRRADIANCE</Text>
          </View>
          <Text style={styles.heroVal}>{mainLux.toFixed(0)} <Text style={[styles.heroUnit, { color: accentColor }]}>Lux</Text></Text>
          <View style={[styles.avgBox, { backgroundColor: `${accentColor}0D` }]}>
             <Text style={[styles.avgLab, { color: accentColor }]}>
                {mainLux > 500 ? 'Artificial Lighting Suspended' : 'Optimizing Luminance'}
             </Text>
          </View>
        </View>

        <View style={styles.floorMap}>
          <Text style={styles.mapTitle}>Live Irradiance Distribution</Text>
          {floors.map((floor) => (
            <View key={floor.id} style={[styles.luxCard, !floor.isOnline && { opacity: 0.4 }]}>
              <View style={styles.lHeader}>
                <View>
                  <Text style={styles.lTitle}>{floor.label}</Text>
                  <Text style={[styles.nodeBadge, { color: floor.isOnline ? accentColor : '#555' }]}>
                    {floor.isOnline ? 'PHYSICAL LDR PROBE' : 'LINK OFFLINE'}
                  </Text>
                </View>
                <View style={styles.lStatus}>
                  <MaterialCommunityIcons name={floor.isOnline ? "white-balance-sunny" : "link-off"} size={14} color={floor.isOnline && floor.lux > 500 ? accentColor : "#555"} />
                  <Text style={[styles.lStatusText, { color: floor.isOnline && floor.lux > 500 ? accentColor : "#555" }]}>
                      {floor.isOnline ? (floor.lux > 500 ? 'NATURAL LIGHT SUFFICIENT' : 'SHADOW DETECTED') : 'OFFLINE'}
                  </Text>
                </View>
              </View>
              <View style={styles.lBody}>
                <Text style={[styles.luxVal, !floor.isOnline && { color: '#333' }]}>{floor.isOnline ? floor.lux.toFixed(0) : '0'} <Text style={[styles.luxUnit, { color: floor.isOnline ? accentColor : '#333' }]}>lx</Text></Text>
                <ProgressBar progress={floor.isOnline ? Math.min(floor.lux/1000, 1) : 0} color={floor.isOnline && floor.lux > 500 ? accentColor : "#333"} style={styles.lProgress} />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.infoHub}>
            <View style={styles.infoItem}>
                <MaterialCommunityIcons name="eye-outline" size={16} color={accentColor} />
                <Text style={styles.infoText}>Visual Comfort Threshold: 400 Lux</Text>
            </View>
            <View style={styles.infoItem}>
                <MaterialCommunityIcons name="cog-outline" size={16} color={accentColor} />
                <Text style={styles.infoText}>Auto-Discovery Enabled: {floors.length} Active Nodes</Text>
            </View>
        </View>
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
  autoBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1, backgroundColor: '#111' },
  autoText: { fontSize: 10, fontWeight: '900', marginLeft: 8, letterSpacing: 1 },
  mainHero: { backgroundColor: '#111', padding: 40, borderRadius: 35, borderWidth: 1, alignItems: 'center', marginBottom: 25 },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  iconBox: { padding: 12, borderRadius: 20, marginRight: 15 },
  heroLab: { color: '#555', fontWeight: 'bold', fontSize: 12, letterSpacing: 2 },
  heroVal: { color: '#FFF', fontSize: 48, fontWeight: '900' },
  heroUnit: { fontSize: 24 },
  avgBox: { marginTop: 15, paddingHorizontal: 15, paddingVertical: 6, borderRadius: 15 },
  avgLab: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  floorMap: { marginBottom: 30 },
  mapTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 16, marginBottom: 15 },
  luxCard: { backgroundColor: '#111', padding: 25, borderRadius: 25, marginBottom: 15, borderWidth: 1, borderColor: '#222' },
  lHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  lTitle: { color: '#888', fontWeight: 'bold', fontSize: 12 },
  lStatus: { flexDirection: 'row', alignItems: 'center' },
  lStatusText: { fontSize: 8, fontWeight: 'bold', marginLeft: 6 },
  nodeBadge: { fontSize: 7, fontWeight: '900', marginTop: 4, letterSpacing: 0.5 },
  lBody: { marginTop: 5 },
  luxVal: { color: '#FFF', fontSize: 32, fontWeight: '900', marginBottom: 10 },
  luxUnit: { fontSize: 14 },
  lProgress: { height: 4, borderRadius: 2, backgroundColor: '#222' },
  emptyBox: { padding: 40, alignItems: 'center', backgroundColor: '#111', borderRadius: 30, borderWidth: 1, borderColor: '#222', borderStyle: 'dotted' },
  emptyText: { color: '#444', fontWeight: 'bold', fontSize: 12 },
  infoHub: { backgroundColor: '#0a0a0a', padding: 25, borderRadius: 30, marginBottom: 50 },
  infoItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  infoText: { color: '#888', fontSize: 10, fontWeight: 'bold', marginLeft: 15 }
});
