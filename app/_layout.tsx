import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions, Platform } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width, height } = Dimensions.get('window');

// Keep the native splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [appReady, setAppReady] = useState(false);
  const [animationFinished, setAnimationFinished] = useState(false);
  
  const zoomAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load any assets if needed here
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    if (appReady) {
      // Step 1: Hide the native splash and show our JS animated version
      SplashScreen.hideAsync();
      
      // Step 2: Perform the 'Fade Off' Animation
      Animated.sequence([
        Animated.delay(1500), // Hold the logo for clarity
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setAnimationFinished(true);
      });
    }
  }, [appReady]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>

        {!animationFinished && (
          <Animated.View 
            style={[
              styles.splashOverlay, 
              { opacity: fadeAnim }
            ]}
            pointerEvents="none"
          >
            <Animated.Image 
              source={require('../assets/images/SPMS.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        )}
      </View>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  logo: {
    width: width * 0.7,
    height: width * 0.7,
  }
});
