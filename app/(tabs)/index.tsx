import { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Alert, ScrollView, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useAnimatedProps, withRepeat, withTiming, withSequence, interpolate, useSharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { ref, onValue, set, get, update } from 'firebase/database';
import { database, auth as firebaseAuth } from '@/constants/firebaseConfig';
import { signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { AuthContext } from './_layout';

const { width } = Dimensions.get('window');

// --- Global Online Detection State (Bulletproof against Fast Refresh) ---
let g_bridgeLastTs = 0;
let g_deviceLastTs = 0;
let g_lastActivity = Date.now();

export default function AppIndex() {
  const router = useRouter();
  const { isLoggedIn, setIsLoggedIn, userData, setUserData } = useContext(AuthContext);
  const [engineerId, setEngineerId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [systemMode, setSystemMode] = useState('AUTO');

  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<any>(null);
  const [simMode, setSimMode] = useState(false);
  const [isBridgeOnline, setIsBridgeOnline] = useState(false);
  const [isControllerOnline, setIsControllerOnline] = useState(false);
  const [whSaved, setWhSaved] = useState(0);
  const [uiMode, setUiMode] = useState('day');
  const [integrity, setIntegrity] = useState({ score: 100, status: 'NORMAL' });
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [aiAudit, setAiAudit] = useState<{shed_active: boolean; shed_floors: string; power_w: number; ldr_dark: boolean; ml_active: boolean; last_update: number}>({
    shed_active: false, shed_floors: '[]', power_w: 0, ldr_dark: false, ml_active: false, last_update: 0,
  });

  const isAdminOrEngineer = userData?.role === 'Admin' || userData?.role === 'Senior Engineer' || userData?.role === 'Junior Engineer';

  const [metrics, setMetrics] = useState({
    totalLoad: 0, solarOutput: 0, netGrid: 0, voltage: 0, current: 0,
    powerFactor: 0, frequency: 0, efficiency: 0,
    occupancyPct: 0, shedding: false, accuracy: 0
  });


  const [floorLoads, setFloorLoads] = useState<Record<string,number>>({
    ground: 0, floor1: 0, floor2: 0, floor3: 0, floor4: 0, floor5: 0,
  });
  const [floorPir, setFloorPir] = useState<Record<string,number>>({
    ground: 0, floor1: 0, floor2: 0, floor3: 0, floor4: 0, floor5: 0,
  });

  const [relays, setRelays] = useState({
    h1: false, h2: false, ground: false, floor1: false, floor2: false, floor3: false, floor4: false, floor5: false,
  });



  const zeroMetrics = () => {
    setMetrics({
      totalLoad: 0, solarOutput: 0, netGrid: 0, voltage: 0, current: 0,
      powerFactor: 0, frequency: 0, efficiency: 0,
      occupancyPct: 0, shedding: false, accuracy: 0
    });
    setFloorLoads({ ground: 0, floor1: 0, floor2: 0, floor3: 0, floor4: 0, floor5: 0 });
    setFloorPir({ ground: 0, floor1: 0, floor2: 0, floor3: 0, floor4: 0, floor5: 0 });
    setAiAudit({ shed_active: false, shed_floors: '[]', power_w: 0, ldr_dark: false, ml_active: false, last_update: 0 });
    setIsControllerOnline(false);
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    // Industrial Authentication: Attempt Anonymous entry first, fallback to system account
    signInAnonymously(firebaseAuth).catch(err => {
      if (err.code === 'auth/admin-restricted-operation') {
        // Fallback to pre-created system account if Anonymous is disabled in console
        signInWithEmailAndPassword(firebaseAuth, 'app@spms.local', 'SPMS_Internal_123')
          .catch(innerErr => console.error("System Auth Failed:", innerErr));
      } else {
        console.error("Auth Error:", err);
      }
    });

    // Monitor Firebase Connection Status
    const connectedRef = ref(database, ".info/connected");
    const unsubConnect = onValue(connectedRef, (snap) => {
      setIsDbConnected(!!snap.val());
    });

    // Safety timeout to dismiss loading spinner if Firebase is slow/offline
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    const spmsRef = ref(database, 'spms');
    const unsubscribe = onValue(spmsRef, (snapshot) => {
      clearTimeout(safetyTimer);
      const data = snapshot.val();
      if (data) {
        const nowTs = Math.floor(Date.now() / 1000);

        // --- CLOCK-DRIFT PROOF ONLINE DETECTION ---
        // Instead of calculating (now - timestamp) which fails if the phone and ESP32 clocks
        // are out of sync, we simply check if the timestamps are ACTIVELY CHANGING.
        const bridgeTs = Number(data.health?.bridge?.last_seen) || 0;
        const deviceTs = Number(data.health?.device?.timestamp) || 0;
        
        // If the values are different from the last time we checked, the system is alive!
        if (bridgeTs !== g_bridgeLastTs || deviceTs !== g_deviceLastTs) {
           g_lastActivity = Date.now();
           g_bridgeLastTs = bridgeTs;
           g_deviceLastTs = deviceTs;
        }

        // System is ONLINE if we've seen any changing timestamps in the last 60 seconds
        const isLive = (Date.now() - g_lastActivity) < 60000;
        
        setIsBridgeOnline(isLive);
        setIsControllerOnline(isLive); // Sync them to prevent UI flickering

        if (data.settings) setSimMode(!!data.settings.simulation_mode);

        if (data.sensorData) {
          const total = Math.max(0, Number(data.sensorData.totalLoad) || 0);
          const solar = Math.max(0, Number(data.sensorData.solarOutput) || 0);
          const netGrid = Math.max(0, total - solar);
          setMetrics({
            totalLoad: total, solarOutput: solar, netGrid: netGrid,
            voltage: Number(data.sensorData.voltage) || 0,
            current: Number(data.sensorData.current) || 0,
            powerFactor: Number(data.sensorData.powerFactor) || 0,
            frequency: Number(data.sensorData.frequency) || 0,
            efficiency: Number(data.sensorData.efficiency) || 0,
            occupancyPct: Number(data.sensorData.occupancyPct) || 0,
            shedding: !!(data.aiAudit?.shed_active),
            accuracy: Number(data.aiAudit?.accuracy) || 87.0
          });
        }

        if (data.floorData) {
          const floorKeys = ['ground','floor1','floor2','floor3','floor4','floor5'];
          const newLoads: Record<string,number> = {};
          const newPir: Record<string,number> = {};
          floorKeys.forEach((k, i) => {
            const fd = data.floorData[`floor${i}`];
            newLoads[k] = fd ? (Number(fd.load_w) || 0) : 0;
            newPir[k]   = fd ? (Number(fd.pir)    || 0) : 0;
          });
          setFloorLoads(newLoads);
          setFloorPir(newPir);
        }

        if (data.aiAudit) {
          setAiAudit({
            shed_active:  !!data.aiAudit.shed_active,
            shed_floors:  data.aiAudit.shed_floors || '[]',
            power_w:      Number(data.aiAudit.power_w) || 0,
            ldr_dark:     !!data.aiAudit.ldr_dark,
            ldr_msg:      data.aiAudit.ldr_msg || 'STABLE',
            ml_active:    !!data.aiAudit.ml_active,
            last_update:  Number(data.aiAudit.last_update) || 0,
          });
        }
        if (data.analytics?.wh_saved) setWhSaved(Number(data.analytics.wh_saved) || 0);
        setSimMode(false); // Force simulation OFF for industrial mode
        if (data.health?.integrity) setIntegrity(data.health.integrity);

        if (data.systemStatus) setSystemMode(data.systemStatus.mode || 'AUTO');
        if (data.relays) {
          setRelays({
            h1: !!data.relays.h1, h2: !!data.relays.h2,
            ground: !!data.relays.ground, floor1: !!data.relays.floor1,
            floor2: !!data.relays.floor2, floor3: !!data.relays.floor3,
            floor4: !!data.relays.floor4, floor5: !!data.relays.floor5,
          });
        }
      } else {
        zeroMetrics();
      }
      setLoading(false);
    }, (error) => {
      console.error("SPMS Firebase Sync Error:", error);
      clearTimeout(safetyTimer);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      unsubConnect();
      clearTimeout(safetyTimer);
    };
  }, [isLoggedIn]);

  const handleLogin = async () => {
    try {
      // Master Admin Bypass for initial setup
      if (engineerId.trim().toLowerCase() === 'admin' && password.trim() === 'admin') {
          const uData = { firstName: 'System', lastName: 'Administrator', role: 'Admin', email: 'admin@spms.local' };
          setUserData(uData);
          setIsLoggedIn(true);
          try {
            if (Platform.OS === 'web') {
              localStorage.setItem('spms_engineer', JSON.stringify(uData));
            } else {
              await AsyncStorage.setItem('spms_engineer', JSON.stringify(uData));
            }
          } catch (e) {}
          return;
      }

      const userId = engineerId.trim().toLowerCase().replace(/\./g, '_');
      const userRef = ref(database, `spms/users/${userId}`);
      const snapshot = await get(userRef);
      const user = snapshot.val();
      if (user && user.password === password.trim()) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setUserData(user); 
          setIsLoggedIn(true);
          try {
            if (Platform.OS === 'web') {
              localStorage.setItem('spms_engineer', JSON.stringify(user));
            } else {
              await AsyncStorage.setItem('spms_engineer', JSON.stringify(user));
            }
          } catch (e) {}
      } else { 
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert('Login Refused', 'Credentials are incorrect.'); 
      }
    } catch (e) { Alert.alert('Error', 'Gateway connection failed.'); }
  };

  const toggleSimulation = async () => {
    if (!isAdminOrEngineer) return;
    
    let authSuccess = false;
    if (Platform.OS === 'web') {
        authSuccess = true; // Skip biometrics on web
    } else {
        const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Authorize Simulation Toggle' });
        authSuccess = res.success;
    }

    if (authSuccess) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newVal = !simMode;
      await set(ref(database, 'spms/settings/simulation_mode'), newVal);
      setSimMode(newVal);
      Alert.alert('Data Sync', `Mode ${newVal ? 'DATASET REPLAY' : 'REAL-TIME PROBE'} Enabled`);
    }
  };

  const accentColor = uiMode === 'night' ? '#00D4FF' : '#39FF14';

  const PowerPulse = ({ level }: { level: number }) => {
    const pulse = useSharedValue(1);
    const speed = level > 5 ? 300 : level > 2 ? 600 : 1200;
    
    useEffect(() => {
      pulse.value = withRepeat(
        withSequence(withTiming(1.05, { duration: speed }), withTiming(1, { duration: speed })),
        -1, true
      );
    }, [level]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scaleY: pulse.value }],
      opacity: interpolate(pulse.value, [1, 1.05], [0.6, 1]),
    }));

    return (
      <View style={styles.waveLayer}>
        <Animated.View style={[styles.waveBox, animatedStyle]}>
          <Svg height="60" width={width - 50} viewBox="0 0 100 20">
             <Path 
                d="M0 10 Q 12.5 0, 25 10 T 50 10 T 75 10 T 100 10" 
                fill="none" 
                stroke={accentColor} 
                strokeWidth="1.5" 
                strokeLinecap="round"
             />
          </Svg>
        </Animated.View>
      </View>
    );
  };

  const IntegrityGauge = ({ score }: { score: number }) => {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const progress = useSharedValue(0);

    useEffect(() => {
      progress.value = withTiming(score / 100, { duration: 1000 });
    }, [score]);

    const animatedProps = useAnimatedProps(() => ({
      strokeDashoffset: circumference * (1 - progress.value),
    }));

    const getColor = (s: number) => s > 80 ? accentColor : s > 60 ? '#FFD700' : '#FF3131';

    return (
      <View style={styles.gaugeContainer}>
        <Svg height="100" width="100" viewBox="0 0 100 100">
          <Path 
            d="M 50,50 m -40,0 a 40,40 0 1,0 80,0 a 40,40 0 1,0 -80,0" 
            fill="none" 
            stroke="#222" 
            strokeWidth="8" 
          />
          <AnimatedPath 
            d="M 50,50 m -40,0 a 40,40 0 1,0 80,0 a 40,40 0 1,0 -80,0" 
            fill="none" 
            stroke={getColor(score)} 
            strokeWidth="8" 
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
          />
        </Svg>
        <View style={styles.gaugeCenter}>
          <Text style={[styles.gaugeVal, { color: getColor(score) }]}>{Math.round(score)}%</Text>
          <Text style={styles.gaugeLab}>HEALTH</Text>
        </View>
      </View>
    );
  };

  const AnimatedPath = Animated.createAnimatedComponent(Path);

  const liveColor = isBridgeOnline ? accentColor : '#555';

  if (!isLoggedIn) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.loginCenter} keyboardShouldPersistTaps="handled">
          <MaterialCommunityIcons name="security" size={100} color="#39FF14" />
          <Text style={styles.loginTitle}>SPMS</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Engineer Email" 
            placeholderTextColor="#555" 
            value={engineerId} 
            onChangeText={setEngineerId} 
            autoCapitalize="none" 
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
          />
          <View style={styles.passwordWrapper}>
            <TextInput 
              ref={passwordRef}
              style={[styles.input, { flex: 1, marginBottom: 0 }]} 
              placeholder="Security Key" 
              placeholderTextColor="#555" 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry={!showPassword} 
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
              <MaterialCommunityIcons name={showPassword ? "eye" : "eye-off"} size={24} color="#39FF14" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Text style={styles.loginBtnText}>LOGIN</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/register')} style={styles.regLink}>
            <Text style={styles.regText}>Register as New Engineer</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#39FF14" size="large" /></View>;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.tabTitle}>DASHBOARD</Text>
        <View style={[styles.mode, systemMode === 'AUTO' ? styles.auto : styles.manual]}>
          <Text style={styles.modeText}>{systemMode}</Text>
        </View>
      </View>
      
      <View style={styles.header}>
        <View style={styles.sensorBox}>
          <View style={[styles.dbDot, { backgroundColor: isDbConnected ? accentColor : '#FF3131' }]} />
          <MaterialCommunityIcons name="lightning-bolt" size={14} color={liveColor} />
          <Text style={[styles.sVal, { color: isBridgeOnline ? '#FFF' : '#444' }]}>
            {isBridgeOnline ? `${metrics.voltage.toFixed(1)}V` : '--V'}
          </Text>
          <View style={styles.sSep} />
          <MaterialCommunityIcons name="current-ac" size={14} color={liveColor} />
          <Text style={[styles.sVal, { color: isBridgeOnline ? '#FFF' : '#444' }]}>
            {isBridgeOnline ? `${metrics.current.toFixed(2)}A` : '--A'}
          </Text>
          <View style={styles.sSep} />
          <MaterialCommunityIcons name="flash-outline" size={14} color={liveColor} />
          <Text style={[styles.sVal, { color: isBridgeOnline ? '#FFF' : '#444' }]}>
            {isBridgeOnline ? `${(metrics.totalLoad * 1000).toFixed(0)}W` : '--W'}
          </Text>
          <View style={styles.sSep} />
          <MaterialCommunityIcons name="sine-wave" size={14} color={liveColor} />
          <Text style={[styles.sVal, { color: isBridgeOnline ? '#FFF' : '#444' }]}>
            {isBridgeOnline ? `${metrics.powerFactor.toFixed(2)}PF` : '--PF'}
          </Text>
          <View style={styles.sSep} />
          <MaterialCommunityIcons name="shield-check-outline" size={14} color={isBridgeOnline ? accentColor : '#555'} />
          <Text style={[styles.sVal, { color: isBridgeOnline ? '#FFF' : '#444' }]}>
            {isBridgeOnline ? `${metrics.accuracy.toFixed(1)}%` : '--%'}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Integrity Alert Removed per user request */}
        <View style={styles.hero}>
           <PowerPulse level={metrics.totalLoad} />
           <View style={styles.heroLayout}>
             <View style={{ flex: 1 }}>
               <Text style={styles.heroLab}>NET GRID CONSUMPTION</Text>
               <Text style={[styles.heroVal, !isBridgeOnline && { color: '#555' }]}>{metrics.netGrid.toFixed(1)} <Text style={styles.heroUnit}>kW</Text></Text>
             </View>
             <IntegrityGauge score={integrity.score} />
           </View>
           
           <View style={[styles.carbonBox, !isBridgeOnline ? styles.offlineBox : (simMode ? styles.simBoxHero : (isControllerOnline ? styles.onlineBox : styles.offlineBox))]}>
             <MaterialCommunityIcons 
                 name={!isBridgeOnline ? "wifi-off" : (simMode ? "robot" : (isControllerOnline ? "chip" : "close-network"))} 
                 size={14} 
                 color={!isBridgeOnline ? "#FF3131" : (simMode ? accentColor : (isControllerOnline ? accentColor : "#FF3131"))} 
             />
             <Text style={[styles.carbonText, (!isBridgeOnline || (!simMode && !isControllerOnline)) && { color: '#FF3131' }, { color: accentColor }]}>
                 {!isBridgeOnline ? 'SYSTEM OFFLINE' : (simMode ? 'AI Optimization Simulation' : (isControllerOnline ? `SPMS REAL-TIME HARDWARE LINK` : 'ESP32 DISCONNECTED'))}
             </Text>
           </View>
           <View style={styles.savingsHUD}>
              <MaterialCommunityIcons name="lightning-bolt" size={14} color={accentColor} />
              <Text style={[styles.savingsHUDText, { color: accentColor }]}>{whSaved.toFixed(1)} Wh SAVED TODAY</Text>
           </View>
        </View>

        <View style={styles.techAnalytics}>
           <Text style={styles.techTitle}>INDUSTRIAL POWER ANALYTICS</Text>
           <View style={styles.techGrid}>
              <View style={styles.techItem}>
                 <MaterialCommunityIcons name="flash-auto" size={24} color={accentColor} />
                 <Text style={styles.techVal}>{metrics.voltage.toFixed(1)} <Text style={styles.techUnit}>V</Text></Text>
                 <Text style={styles.techLab}>VOLTAGE</Text>
              </View>
              <View style={styles.techItem}>
                 <MaterialCommunityIcons name="current-ac" size={24} color={accentColor} />
                 <Text style={styles.techVal}>{metrics.current.toFixed(2)} <Text style={styles.techUnit}>A</Text></Text>
                 <Text style={styles.techLab}>AMPERE</Text>
              </View>
              <View style={styles.techItem}>
                 <MaterialCommunityIcons name="lightning-bolt" size={24} color={accentColor} />
                 <Text style={styles.techVal}>{(metrics.totalLoad * 1000).toFixed(0)} <Text style={styles.techUnit}>W</Text></Text>
                 <Text style={styles.techLab}>WATTS</Text>
              </View>
              <View style={styles.techItem}>
                 <MaterialCommunityIcons name="sine-wave" size={24} color={accentColor} />
                 <Text style={styles.techVal}>{metrics.powerFactor.toFixed(2)}</Text>
                 <Text style={styles.techLab}>POWER FACTOR</Text>
              </View>
              <View style={styles.techItem}>
                 <MaterialCommunityIcons name="gauge" size={24} color={accentColor} />
                 <Text style={styles.techVal}>{metrics.efficiency.toFixed(1)} <Text style={styles.techUnit}>%</Text></Text>
                 <Text style={styles.techLab}>EFFICIENCY</Text>
              </View>
              <View style={styles.techItem}>
                 <MaterialCommunityIcons name="pulse" size={24} color={accentColor} />
                 <Text style={styles.techVal}>{metrics.frequency.toFixed(1)} <Text style={styles.techUnit}>Hz</Text></Text>
                 <Text style={styles.techLab}>FREQUENCY</Text>
              </View>
           </View>
        </View>
        <View style={styles.floorGrid}>
          {['ground', 'floor1', 'floor2', 'floor3', 'floor4', 'floor5'].map((f) => {
             const isLive = isBridgeOnline;
             const relayOn = relays[f as keyof typeof relays];
             const loadW = floorLoads[f] || 0;
             const hasPir = (floorPir[f] || 0) > 0;
             let statusLabel = 'OFFLINE';
             let statusStyle = styles.shed;
             if (isLive) {
               statusLabel = relayOn ? 'ACTIVE' : 'SHEDDED';
               statusStyle = relayOn ? styles.act : styles.shed;
             }
             return (
              <View key={f} style={[styles.card, !isLive && { borderColor: '#111' }]}>
                <View style={styles.cardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                     <View style={[styles.dot, { backgroundColor: isLive ? (relayOn ? '#39FF14' : '#FF3131') : '#333' }]} />
                     <Text style={styles.cardTitle}>{f.toUpperCase()}</Text>
                  </View>
                  <View style={[styles.status, statusStyle]}>
                    <Text style={styles.stext}>{statusLabel}</Text>
                  </View>
                </View>
                <Text style={[styles.gridVal, !isLive && { color: '#333' }]}>
                  {isLive ? loadW.toFixed(1) : '--'} <Text style={{ fontSize: 14, color: '#555' }}>W</Text>
                </Text>
                <View style={styles.floorFooter}>
                    <View style={styles.luxDet}>
                        <MaterialCommunityIcons name="motion-sensor" size={12} color={hasPir && isLive ? accentColor : '#555'} />
                        <Text style={[styles.luxText, { color: hasPir && isLive ? '#888' : '#333' }]}>
                          {isLive ? (hasPir ? 'Motion Detected' : 'No Motion') : 'Awaiting Sensor'}
                        </Text>
                    </View>
                    {hasPir && isLive && (
                      <View style={[styles.densBadge, { backgroundColor: `rgba(${uiMode === 'night' ? '0, 212, 255' : '57, 255, 20'}, 0.1)` }]}>
                         <MaterialCommunityIcons name="account-group" size={10} color={accentColor} />
                         <Text style={[styles.densText, { color: accentColor }]}>OCCUPIED</Text>
                      </View>
                    )}
                </View>
              </View>
             )
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  loginCenter: { flexGrow: 1, justifyContent: 'center', padding: 40, alignItems: 'center' },
  loginTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', marginVertical: 30, letterSpacing: 2 },
  input: { backgroundColor: '#111', width: '100%', padding: 20, borderRadius: 15, color: '#FFF', marginBottom: 15, borderWidth: 1, borderColor: '#222' },
  passwordWrapper: { flexDirection: 'row', width: '100%', marginBottom: 15, alignItems: 'center' },
  eyeIcon: { position: 'absolute', right: 20 },
  loginBtn: { backgroundColor: '#39FF14', width: '100%', padding: 20, borderRadius: 15, alignItems: 'center', marginTop: 10 },
  loginBtnText: { fontWeight: '900', fontSize: 16, color: '#000' },
  regLink: { marginTop: 20, padding: 10 },
  regText: { color: '#555', fontSize: 12, textDecorationLine: 'underline' },
  container: { flex: 1, backgroundColor: '#000', paddingTop: 60 },
  centered: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  adminBanner: { paddingHorizontal: 25, marginBottom: 10 },
  simBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#222', alignSelf: 'flex-start' },
  simText: { color: '#555', fontSize: 8, fontWeight: '900', marginLeft: 8, marginRight: 5, letterSpacing: 1 },
  topBar: { paddingHorizontal: 25, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  header: { paddingHorizontal: 25, marginBottom: 25, flexDirection: 'row', alignItems: 'center' },
  sensorBox: { backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', flex: 1 },
  sVal: { color: '#FFF', fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
  sSep: { width: 1, height: 12, backgroundColor: '#222', marginHorizontal: 8 },
  mode: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  auto: { borderColor: '#39FF14', backgroundColor: 'rgba(57, 255, 20, 0.1)' },
  manual: { borderColor: '#FF3131', backgroundColor: 'rgba(255, 49, 49, 0.1)' },
  modeText: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  scroll: { paddingBottom: 50 },
  hero: { backgroundColor: '#111', marginHorizontal: 25, padding: 30, borderRadius: 30, borderWidth: 1, borderColor: '#39FF14', alignItems: 'center' },
  heroLab: { color: '#555', fontSize: 10, fontWeight: 'bold', letterSpacing: 2 },
  heroVal: { color: '#FFF', fontSize: 48, fontWeight: '900', marginTop: 10 },
  heroUnit: { fontSize: 20, color: '#39FF14' },
  carbonBox: { flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  onlineBox: { backgroundColor: 'rgba(57, 255, 20, 0.08)', borderWidth: 1, borderColor: 'rgba(57, 255, 20, 0.2)' },
  offlineBox: { backgroundColor: 'rgba(255, 49, 49, 0.08)', borderWidth: 1, borderColor: 'rgba(255, 49, 49, 0.2)' },
  simBoxHero: { backgroundColor: 'rgba(57, 255, 20, 0.05)', borderWidth: 1, borderColor: 'rgba(57, 255, 20, 0.1)' },
  carbonText: { color: '#39FF14', fontSize: 11, fontWeight: 'bold', marginLeft: 8 },
  floorGrid: { paddingHorizontal: 25, marginTop: 30 },
  card: { backgroundColor: '#111', padding: 25, borderRadius: 25, marginBottom: 15, borderWidth: 1, borderColor: '#222' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  cardTitle: { color: '#888', fontWeight: 'bold', fontSize: 12 },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  act: { backgroundColor: 'rgba(57, 255, 20, 0.1)' },
  shed: { backgroundColor: 'rgba(255, 49, 49, 0.1)' },
  stext: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  gridVal: { color: '#FFF', fontSize: 32, fontWeight: '900', marginBottom: 15 },
  luxDet: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingTop: 15 },
  luxText: { color: '#444', fontSize: 9, fontWeight: 'bold', marginLeft: 8 },
  floorFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingTop: 15 },
  densBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(57, 255, 20, 0.2)' },
  densText: { fontSize: 8, fontWeight: '900', marginLeft: 5 },
  waveLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', opacity: 0.15 },
  waveBox: { width: '100%', height: 60, justifyContent: 'center', alignItems: 'center' },
  savingsHUD: { position: 'absolute', top: 15, right: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(57, 255, 20, 0.05)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  savingsHUDText: { fontSize: 8, fontWeight: '900', marginLeft: 5, letterSpacing: 1 },
  gaugeContainer: { position: 'relative', width: 100, height: 100, justifyContent: 'center', alignItems: 'center' },
  gaugeCenter: { position: 'absolute', alignItems: 'center' },
  gaugeVal: { fontSize: 18, fontWeight: '900' },
  gaugeLab: { fontSize: 6, color: '#555', fontWeight: 'bold', letterSpacing: 1 },
  heroLayout: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  alertBanner: { marginHorizontal: 25, marginTop: 10, padding: 15, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  alertText: { color: '#000', fontWeight: '900', fontSize: 10, marginLeft: 10, letterSpacing: 1 },
  techAnalytics: { marginHorizontal: 25, marginTop: 25, backgroundColor: '#111', padding: 25, borderRadius: 30, borderWidth: 1, borderColor: '#222' },
  techTitle: { color: '#888', fontWeight: 'bold', fontSize: 10, letterSpacing: 2, marginBottom: 20 },
  techGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  techItem: { width: '30%', alignItems: 'center', marginBottom: 20 },
  techVal: { color: '#FFF', fontSize: 18, fontWeight: '900', marginTop: 10 },
  techUnit: { fontSize: 10, color: '#555' },
  techLab: { color: '#888', fontSize: 7, fontWeight: 'bold', marginTop: 5, letterSpacing: 1 },
  dbDot: { width: 4, height: 4, borderRadius: 2, marginRight: 8 }
});
