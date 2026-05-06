import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "../firebaseClient";
import {
  clearSessionProfile,
  fetchSessionProfileFromApi,
  readSessionProfile,
  writeSessionProfile,
} from "./sessionProfile";

const AuthContext = createContext({
  user: null,
  sessionProfile: null,
  sessionProfileLoading: false,
  loading: true,
  configured: false,
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(configured);
  const [sessionProfile, setSessionProfile] = useState(null);
  const [sessionProfileLoading, setSessionProfileLoading] = useState(false);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return undefined;
    }
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [configured]);

  useEffect(() => {
    if (!configured || !user) {
      if (!user) {
        clearSessionProfile();
        setSessionProfile(null);
      }
      setSessionProfileLoading(false);
      return undefined;
    }

    const cached = readSessionProfile(user.uid);
    setSessionProfile(cached);
    setSessionProfileLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const profile = await fetchSessionProfileFromApi(idToken);
        if (cancelled) return;
        writeSessionProfile(profile);
        setSessionProfile(profile);
      } catch {
        if (cancelled) return;
        clearSessionProfile();
        setSessionProfile(null);
      } finally {
        if (!cancelled) setSessionProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, configured]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    clearSessionProfile();
    setSessionProfile(null);
    await firebaseSignOut(getFirebaseAuth());
  }, [configured]);

  const value = useMemo(
    () => ({
      user,
      sessionProfile,
      sessionProfileLoading,
      loading,
      configured,
      signOut,
    }),
    [user, sessionProfile, sessionProfileLoading, loading, configured, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
