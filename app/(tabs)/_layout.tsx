import { router, useSegments } from 'expo-router';
import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Text, Animated, ScrollView, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import Screens as Components
import AppIndex from './index';
import SheddingScreen from './shedding';
import SolarScreen from './solar';
import HarvestingScreen from './harvesting';
import HealthScreen from './health';
import ProfileScreen from './profile';
import OccupancyScreen from './occupancy';

export const AuthContext = createContext<any>(null);

const { width, height } = Dimensions.get('window');
const TABS = [
  { id: 'index', name: 'Dashboard', icon: 'view-dashboard' },
  { id: 'shedding', name: 'Shedding', icon: 'lightning-bolt' },
  { id: 'solar', name: 'Solar PV', icon: 'solar-power' },
  { id: 'harvesting', name: 'Harvesting', icon: 'white-balance-sunny' },
  { id: 'occupancy', name: 'Occupancy', icon: 'radar' },
  { id: 'health', name: 'Health', icon: 'pulse' },
  { id: 'profile', name: 'Profile', icon: 'account-circle' }
];

export default function TabLayout() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const isManualScroll = useRef(false);

  const authValue = React.useMemo(() => ({ isLoggedIn, setIsLoggedIn, userData, setUserData }), [isLoggedIn, userData]);

  // Session Restoration
  useEffect(() => {
    const restoreSession = async () => {
      try {
        if (Platform.OS === 'web') {
          const savedUser = localStorage.getItem('spms_engineer');
          if (savedUser) {
            setUserData(JSON.parse(savedUser));
            setIsLoggedIn(true);
          }
        } else {
          const savedUser = await AsyncStorage.getItem('spms_engineer');
          if (savedUser) {
            setUserData(JSON.parse(savedUser));
            setIsLoggedIn(true);
          }
        }
      } catch (e) {
        console.error("Session Restoration Error", e);
      }
    };
    restoreSession();
  }, []);

  const handleTabPress = (index: number) => {
    isManualScroll.current = true;
    setActiveIndex(index);
    scrollViewRef.current?.scrollTo({ x: index * width, animated: true });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Release the manual lock after animation completes
    setTimeout(() => {
      isManualScroll.current = false;
    }, 500);
  };

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
        if (isManualScroll.current) return;
        
        const index = Math.round(event.nativeEvent.contentOffset.x / width);
        if (index !== activeIndex && index >= 0 && index < TABS.length) {
          setActiveIndex(index);
        }
      }
    }
  );

  if (!isLoggedIn) {
    return (
      <AuthContext.Provider value={authValue}>
        <AppIndex />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={authValue}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={styles.container}>
          <Animated.ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            directionalLockEnabled={true}
            nestedScrollEnabled={true}
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            bounces={true}
            decelerationRate="fast"
            contentContainerStyle={{ flexGrow: 1 }}
            style={styles.pager}
          >
            <View style={styles.screenWrapper}><AppIndex /></View>
            <View style={styles.screenWrapper}><SheddingScreen /></View>
            <View style={styles.screenWrapper}><SolarScreen /></View>
            <View style={styles.screenWrapper}><HarvestingScreen /></View>
            <View style={styles.screenWrapper}><OccupancyScreen /></View>
            <View style={styles.screenWrapper}><HealthScreen /></View>
            <View style={styles.screenWrapper}><ProfileScreen /></View>
          </Animated.ScrollView>

          {/* Custom Bottom Terminal Bar */}
          <View style={styles.tabBar}>
            {TABS.map((tab, index) => {
              const isActive = activeIndex === index;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.tabItem}
                  onPress={() => handleTabPress(index)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons 
                    name={tab.icon as any} 
                    size={24} 
                    color={isActive ? '#39FF14' : '#555'} 
                  />
                  <Text style={[styles.tabLabel, { color: isActive ? '#39FF14' : '#555' }]}>
                    {tab.name}
                  </Text>
                  {isActive && <View style={styles.activeDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </GestureHandlerRootView>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  pager: { flex: 1 },
  screenWrapper: { width, height: '100%' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#000',
    height: 75,
    paddingBottom: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#111',
    justifyContent: 'space-around',
    alignItems: 'center'
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
    letterSpacing: 0.5
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#39FF14',
    marginTop: 4
  }
});
