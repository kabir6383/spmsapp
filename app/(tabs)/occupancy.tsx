import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated as RNAnimated, Dimensions, TouchableOpacity } from 'react-native';
import { Title, Subheading, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ref, onValue, set } from 'firebase/database';
import { database } from '@/constants/firebaseConfig';
import { AuthContext } from './_layout';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, interpolate } from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';

// --- Global Online Detection State (Bulletproof against Fast Refresh) ---
let g_bridgeLastTs = 0;
let g_deviceLastTs = 0;
let g_lastActivity = Date.now();

const { width } = Dimensions.get('window');

export default function OccupancyScreen() {
  const { isLoggedIn } = useContext(AuthContext);
  const router = useRouter();
  const [motion, setMotion] = useState(0);
  const [isBridgeOnline, setIsBridgeOnline] = useState(false);
  const [securityMode, setSecurityMode] = useState(false);
  const [uiMode, setUiMode] = useState('day');
  
  const scanAnim = useSharedValue(0);

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

        setMotion(val.sensorData?.occupancyPct > 0 ? 1 : 0);
        if (val.settings?.security_mode) setSecurityMode(val.settings.security_mode);
        if (val.settings?.ui_mode) setUiMode(val.settings.ui_mode);
      }
    });

    scanAnim.value = withRepeat(
        withTiming(1, { duration: 2000 }),
        -1, false
    );

    return () => unsubscribe();
  }, [isLoggedIn]);

  const accentColor = uiMode === 'night' ? '#00D4FF' : '#39FF14';

  const scanStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scanAnim.value, [0, 0.5, 1], [0, 1, 0]),
    transform: [{ scale: interpolate(scanAnim.value, [0, 1], [0.8, 1.5]) }]
  }));

  const RadarCircle = () => (
    <View style={styles.radarContainer}>
        <Svg height="250" width="250" viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="45" stroke="#111" strokeWidth="0.5" fill="none" />
            <Circle cx="50" cy="50" r="30" stroke="#111" strokeWidth="0.5" fill="none" />
            <Circle cx="50" cy="50" r="15" stroke="#111" strokeWidth="0.5" fill="none" />
            <Path d="M 50 5 L 50 95 M 5 50 L 95 50" stroke="#111" strokeWidth="0.5" />
        </Svg>
        <Animated.View style={[styles.scanOverlay, scanStyle, { borderColor: accentColor }]} />
        {motion === 1 && (
            <View style={[styles.motionDot, { backgroundColor: accentColor }]} />
        )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.tabTitle}>OCCUPANCY</Text>
      </View>
      {!isBridgeOnline && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons name="security-network" size={20} color="#000" />
          <Text style={styles.offlineText}>INTRUSION PROTOCOL OFFLINE - CHECK LINK</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Title style={styles.title}>OCCUPANCY CENTER</Title>
          <Subheading style={styles.sub}>Zonal Presence & Motion Analytics</Subheading>
        </View>

        <View style={styles.radarBox}>
            <RadarCircle />
            <View style={styles.statusRow}>
                <View style={[styles.statusBadge, { backgroundColor: motion ? `${accentColor}22` : '#111' }]}>
                    <View style={[styles.dot, { backgroundColor: motion ? accentColor : '#555' }]} />
                    <Text style={[styles.statusText, { color: motion ? accentColor : '#888' }]}>
                        {motion ? 'MOTION DETECTED' : 'AREA SECURE'}
                    </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isBridgeOnline ? `${accentColor}11` : '#111' }]}>
                    <Text style={styles.subStatusText}>{isBridgeOnline ? 'LIVE FEED ACTIVE' : 'NO FEED'}</Text>
                </View>
            </View>
        </View>

        <View style={styles.featureGrid}>
            <View style={styles.infoCard}>
                <View style={styles.cardHeader}>
                    <MaterialCommunityIcons name="shield-check" size={20} color={accentColor} />
                    <Text style={styles.cardTitle}>SECURITY PROTOCOL</Text>
                    <Switch 
                        value={securityMode} 
                        onValueChange={(val) => {
                            setSecurityMode(val);
                            set(ref(database, 'spms/settings/security_mode'), val);
                        }}
                        trackColor={{ false: '#222', true: accentColor }}
                        thumbColor="#FFF"
                    />
                </View>
                <Text style={styles.cardDesc}>
                    {securityMode ? 'Armed: High-alert notification engaged.' : 'Disarmed: Passive occupancy tracking only.'}
                </Text>
            </View>

            <View style={styles.infoCard}>
                <View style={styles.cardHeader}>
                    <MaterialCommunityIcons name="broadcast" size={20} color={accentColor} />
                    <Text style={styles.cardTitle}>PIR NODE HEALTH</Text>
                </View>
                <View style={styles.healthRow}>
                    <Text style={styles.healthLab}>Node ID: PIR_HW_27</Text>
                    <Text style={[styles.healthStat, { color: accentColor }]}>PRIMARY</Text>
                </View>
                <View style={styles.healthRow}>
                    <Text style={styles.healthLab}>Latency</Text>
                    <Text style={styles.healthStat}>14ms</Text>
                </View>
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
  radarBox: { backgroundColor: '#050505', borderRadius: 35, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#111', marginBottom: 25 },
  radarContainer: { width: 250, height: 250, justifyContent: 'center', alignItems: 'center' },
  scanOverlay: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1 },
  motionDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, top: 100, left: 140, shadowColor: '#FFF', shadowRadius: 10, shadowOpacity: 0.5 },
  statusRow: { flexDirection: 'row', marginTop: 30, width: '100%', justifyContent: 'center', gap: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 10 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  subStatusText: { color: '#555', fontSize: 8, fontWeight: 'bold' },
  featureGrid: { gap: 20 },
  infoCard: { backgroundColor: '#0A0A0A', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#111' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  cardTitle: { color: '#FFF', fontSize: 12, fontWeight: '900', flex: 1, marginLeft: 15, letterSpacing: 1 },
  cardDesc: { color: '#555', fontSize: 10, lineHeight: 16 },
  healthRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  healthLab: { color: '#444', fontSize: 10, fontWeight: 'bold' },
  healthStat: { color: '#888', fontSize: 10, fontWeight: '900' }
});
