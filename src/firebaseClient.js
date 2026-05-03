import firebase from "firebase/compat/app";
import "firebase/compat/auth";

function readFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
}

export function isFirebaseConfigured() {
  const c = readFirebaseConfig();
  return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
}

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Set VITE_FIREBASE_* variables (see .env.example)."
    );
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(readFirebaseConfig());
  }
  return firebase.app();
}

export function getFirebaseAuth() {
  return getFirebaseApp().auth();
}
