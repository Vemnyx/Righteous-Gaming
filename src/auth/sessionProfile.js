/** Persisted subset of GET /api/session/me between reloads while the Firebase session lasts. */

export const SESSION_PROFILE_STORAGE_KEY = "rg-session-profile";

/** @typedef {{ id?: number, email?: string, username?: string|null, uid?: string, role?: number|null, created_at?: string }} SessionProfile */

/**
 * Loads cached profile only if `uid` matches the signed-in Firebase user.
 * @param {string} expectedUid
 * @returns {SessionProfile | null}
 */
export function readSessionProfile(expectedUid) {
  try {
    const raw = localStorage.getItem(SESSION_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || o.uid !== expectedUid) return null;
    return o;
  } catch {
    return null;
  }
}

/** @param {SessionProfile} profile */
export function writeSessionProfile(profile) {
  try {
    localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* quota / private mode */
  }
}

export function clearSessionProfile() {
  try {
    localStorage.removeItem(SESSION_PROFILE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} idToken
 * @returns {Promise<SessionProfile>}
 */
export async function fetchSessionProfileFromApi(idToken) {
  const res = await fetch("/api/session/me", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `session/me failed: ${res.status}`);
  }
  return res.json();
}
