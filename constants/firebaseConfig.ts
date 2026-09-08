import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${name}`);
  }
  return value;
};

const firebaseConfig = {
  apiKey: requiredEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requiredEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  databaseURL: requiredEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL'),
  projectId: requiredEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: requiredEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requiredEnv('EXPO_PUBLIC_FIREBASE_APP_ID')
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

export const auth = getAuth(app);
