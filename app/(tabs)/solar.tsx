import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Title, Subheading, ProgressBar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ref, onValue } from 'firebase/database';
import { database } from '@/constants/firebaseConfig';
import { AuthContext } from './_layout';
import { useRouter } from 'expo-router';

// --- Global Online Detection State (Bulletproof against Fast Refresh) ---
let g_bridgeLastTs = 0;
let g_deviceLastTs = 0;
let g_lastActivity = Date.now();

export default function SolarScreen() {
  const { isLoggedIn } = useContext(AuthContext);
  const router = useRouter();
  const [solarData, setSolarData] = useState<any>(null);
  const [isBridgeOnline, setIsBridgeOnline] = useState(false);
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
  const solarOutput = solarData?.sensorData?.solarOutput || 0;
  const pf = solarData?.sensorData?.powerFactor || 1.0;
  const savingsWh = solarData?.sensorData?.totalLoad ? Math.max(0, solarOutput - solarData.sensorData.totalLoad) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.tabTitle}>SOLAR PV</Text>
      </View>
      {!isBridgeOnline && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons name="wifi-off" size={20} color="#000" />
          <Text style={styles.offlineText}>TERMINAL OFFLINE - WAITING FOR HARDWARE</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Title style={styles.title}>SOLAR PV POWER</Title>
          <Subheading style={styles.sub}>Master Potentiometer & Grid Interface</Subheading>
        </View>

        <View style={[styles.mainHero, { borderColor: solarOutput > 0 ? accentColor : '#222' }]}>
          <View style={styles.heroTop}>
            <View style={[styles.iconBox, { backgroundColor: solarOutput > 0 ? `${accentColor}1A` : 'rgba(255, 49, 49, 0.1)' }]}>
              <MaterialCommunityIcons name={solarOutput > 0 ? "solar-power-variant" : "link-off"} size={32} color={solarOutput > 0 ? accentColor : "#FF3131"} />
            </View>
            <Text style={[styles.heroLab, { color: solarOutput > 0 ? '#555' : '#FF3131' }]}>{solarOutput > 0 ? 'PHYSICAL GENERATION' : 'LINK DISCONNECTED'}</Text>
          </View>
          <Text style={[styles.heroVal, solarOutput === 0 && { color: '#333' }]}>{solarOutput.toFixed(1)} <Text style={[styles.heroUnit, { color: solarOutput > 0 ? accentColor : '#333' }]}>kW</Text></Text>
          <View style={[styles.avgBox, { backgroundColor: solarOutput > 0 ? `${accentColor}0D` : 'rgba(255, 49, 49, 0.05)' }]}>
             <Text style={[styles.avgLab, { color: solarOutput > 0 ? accentColor : '#FF3131' }]}>
                {solarOutput > 0 ? `Direct Potentiometer Telemetry: ${((solarOutput/100)*100).toFixed(0)}% Capacity` : 'Safe Mode: Suppressing Analog Noise Floor'}
             </Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
            <View style={styles.statCard}>
                <MaterialCommunityIcons name="sine-wave" size={20} color={accentColor} />
                <Text style={styles.statLab}>POWER FACTOR</Text>
                <Text style={styles.statVal}>{pf.toFixed(2)}</Text>
            </View>
            <View style={styles.statCard}>
                <MaterialCommunityIcons name="transmission-tower" size={20} color={accentColor} />
                <Text style={styles.statLab}>GRID SAVINGS</Text>
                <Text style={[styles.statVal, { color: savingsWh > 0 ? accentColor : '#FFF' }]}>
                    {Math.max(0, savingsWh).toFixed(1)} kW
                </Text>
            </View>
        </View>

        <View style={styles.efficiencyBox}>
           <Text style={styles.effTitle}>GENERATION EFFICIENCY</Text>
           <ProgressBar progress={Math.min(solarOutput/100, 1)} color={accentColor} style={styles.effProgress} />
           <View style={styles.effFooter}>
                <Text style={styles.effText}>LOW</Text>
                <Text style={styles.effText}>OPTIMAL</Text>
                <Text style={styles.effText}>PEAK</Text>
           </View>
        </View>

        <View style={styles.disclaimer}>
            <View style={styles.discRow}>
                <MaterialCommunityIcons name="chip" size={12} color="#555" />
                <Text style={styles.discText}>Hardware Signal Debug: {solarData?.solarVoltage?.toFixed(1) || '0.0'} (Raw) | Suppression Active: {solarData?.solarVoltage >= 100 ? 'YES' : 'NO'}</Text>
            </View>
            <View style={[styles.discRow, { marginTop: 10 }]}>
                <MaterialCommunityIcons name="information-outline" size={12} color="#555" />
                <Text style={styles.discText}>This terminal reflects the raw physical potentiometer values representing the building's current Solar Photovoltaic performance.</Text>
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
  mainHero: { backgroundColor: '#111', padding: 40, borderRadius: 35, borderWidth: 1, alignItems: 'center', marginBottom: 25 },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  iconBox: { padding: 12, borderRadius: 20, marginRight: 15 },
  heroLab: { color: '#555', fontWeight: 'bold', fontSize: 12, letterSpacing: 2 },
  heroVal: { color: '#FFF', fontSize: 48, fontWeight: '900' },
  heroUnit: { fontSize: 24 },
  avgBox: { marginTop: 15, paddingHorizontal: 15, paddingVertical: 6, borderRadius: 15 },
  avgLab: { fontSize: 10, fontWeight: 'bold' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  statCard: { backgroundColor: '#111', width: '48%', padding: 20, borderRadius: 25, borderWidth: 1, borderColor: '#222' },
  statLab: { color: '#444', fontSize: 8, fontWeight: 'bold', marginVertical: 8, letterSpacing: 1 },
  statVal: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  efficiencyBox: { backgroundColor: '#111', padding: 25, borderRadius: 30, borderWidth: 1, borderColor: '#222' },
  effTitle: { color: '#888', fontWeight: 'bold', fontSize: 10, marginBottom: 15, letterSpacing: 1 },
  effProgress: { height: 10, borderRadius: 5, backgroundColor: '#222' },
  effFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  effText: { color: '#444', fontSize: 8, fontWeight: 'bold' },
  disclaimer: { backgroundColor: '#0a0a0a', padding: 25, borderRadius: 30, marginBottom: 50 },
  discRow: { flexDirection: 'row', alignItems: 'center' },
  discText: { color: '#555', fontSize: 9, marginLeft: 15, lineHeight: 14 }
});
