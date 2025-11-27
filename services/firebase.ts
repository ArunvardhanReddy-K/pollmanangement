import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBIuF2Uo0KF9IBOZsyvH3cTux1pEJ2WGoA",
  authDomain: "elections-2024-470118.firebaseapp.com",
  databaseURL: "https://elections-2024-470118-default-rtdb.firebaseio.com",
  projectId: "elections-2024-470118",
  storageBucket: "gs://elections-2024-470118.firebasestorage.app",
  messagingSenderId: "840142183900",
  appId: "1:840142183900:web:f674c69a71e764d517c319",
  measurementId: "G-V544KE4N3S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
export const storage = getStorage(app);