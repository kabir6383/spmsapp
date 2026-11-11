import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const requiredEnv = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${name}`);
  }
  return value;
};

// Firebase's Realtime Database SDK only accepts URLs shaped like
// https://<db>.firebaseio.com or https://<db>.<region>.firebasedatabase.app.
// Normalise common input mistakes (whitespace, quotes, missing scheme, extra
// path) and fall back to the project's default database URL otherwise.
const normalizeDatabaseUrl = (raw: string, projectId: string): string => {
  let value = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  if (value && !/^[a-z]+:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const { protocol, host } = new URL(value);
    if (/^[a-z0-9-]+\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/i.test(host)) {
      return `${protocol === 'http:' ? 'http' : 'https'}://${host.toLowerCase()}`;
    }
  } catch {
    // fall through to default
  }
  const fallback = `https://${projectId.toLowerCase().replace(/[^a-z0-9-]/g, "")}-default-rtdb.firebaseio.com`;
  console.warn(
    `EXPO_PUBLIC_FIREBASE_DATABASE_URL is not a valid Realtime Database URL; using ${fallback}`
  );
  return fallback;
};

const projectId = requiredEnv(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, 'EXPO_PUBLIC_FIREBASE_PROJECT_ID').trim();

const firebaseConfig = {
  apiKey: requiredEnv(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, 'EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requiredEnv(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  databaseURL: normalizeDatabaseUrl(
    requiredEnv(process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL, 'EXPO_PUBLIC_FIREBASE_DATABASE_URL'),
    projectId
  ),
  projectId,
  storageBucket: requiredEnv(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requiredEnv(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, 'EXPO_PUBLIC_FIREBASE_APP_ID')
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const database = getDatabase(app);

export const auth = getAuth(app);

