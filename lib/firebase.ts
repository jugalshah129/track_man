import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

if (!apiKey) throw new Error('missing firebase env var: NEXT_PUBLIC_FIREBASE_API_KEY');
if (!authDomain) throw new Error('missing firebase env var: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
if (!projectId) throw new Error('missing firebase env var: NEXT_PUBLIC_FIREBASE_PROJECT_ID');
if (!storageBucket) throw new Error('missing firebase env var: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
if (!messagingSenderId) throw new Error('missing firebase env var: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
if (!appId) throw new Error('missing firebase env var: NEXT_PUBLIC_FIREBASE_APP_ID');

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
