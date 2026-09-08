import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyB5WFy4-O-AczKBNKpMRdc_kVPGFJgpL84",
  authDomain: "spms-69e9e.firebaseapp.com",
  databaseURL: "https://spms-69e9e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "spms-69e9e",
  storageBucket: "spms-69e9e.firebasestorage.app",
  messagingSenderId: "31822915944",
  appId: "1:31822915944:web:68aa54e65575b4b6f38edd"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

// Use conditional initialization to support both Web and Native
export const auth = Platform.OS === 'web' 
  ? getAuth(app) 
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
