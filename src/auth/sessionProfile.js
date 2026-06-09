/** Persisted subset of GET /api/session/me between reloads while the Firebase session lasts. */

export const SESSION_PROFILE_STORAGE_KEY = "rg-session-profile";

/** @typedef {{ card_rater_quick_submit?: boolean }} UserSettings */

/** @typedef {{ username?: string | null, first_name?: string | null, last_name?: string | null }} UserProfilePatch */

/** @typedef {{ email?: string, username?: string|null, first_name?: string|null, last_name?: string|null, uid?: string, role?: number|null, created_at?: string, settings?: UserSettings }} SessionProfile */

/**
 * @param {SessionProfile | null | undefined} profile
 * @returns {UserSettings}
 */
export function userSettingsFromProfile(profile) {
  const s = profile?.settings;
  return {
    card_rater_quick_submit: s?.card_rater_quick_submit === true,
  };
}

/**
 * @param {SessionProfile | null | undefined} profile
 * @returns {string}
 */
export function sessionProfileDisplayName(profile) {
  const uname = profile?.username != null ? String(profile.username).trim() : "";
  if (uname) return uname;
  const email = profile?.email != null ? String(profile.email).trim() : "";
  if (email) {
    const local = email.split("@")[0]?.trim();
    return local || email;
  }
  return "Account";
}

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
    return { ...o, settings: userSettingsFromProfile(o) };
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
  const data = await res.json();
  return { ...data, settings: userSettingsFromProfile(data) };
}

/**
 * @param {string} idToken
 * @returns {Promise<UserSettings>}
 */
export async function fetchUserSettingsFromApi(idToken) {
  const res = await fetch("/api/me/settings", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `me/settings GET failed: ${res.status}`);
  }
  const data = await res.json();
  const saved = data?.settings;
  return {
    card_rater_quick_submit: saved?.card_rater_quick_submit === true,
  };
}

/**
 * @param {string} idToken
 * @param {Partial<UserSettings>} patch
 * @returns {Promise<UserSettings>}
 */
export async function saveUserSettingsFromApi(idToken, patch) {
  const res = await fetch("/api/me/settings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `me/settings POST failed: ${res.status}`);
  }
  const data = await res.json();
  const saved = data?.settings;
  return {
    card_rater_quick_submit: saved?.card_rater_quick_submit === true,
  };
}

/**
 * @param {string} idToken
 * @returns {Promise<{ email: string, username?: string | null, first_name?: string | null, last_name?: string | null }>}
 */
export async function fetchUserProfileFromApi(idToken) {
  const res = await fetch("/api/me/profile", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `me/profile GET failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    email: data?.email ?? "",
    username: data?.username ?? null,
    first_name: data?.first_name ?? null,
    last_name: data?.last_name ?? null,
  };
}

/**
 * @param {string} idToken
 * @param {{ username?: string, first_name?: string, last_name?: string }} patch
 * @returns {Promise<{ email: string, username?: string | null, first_name?: string | null, last_name?: string | null }>}
 */
export async function saveUserProfileFromApi(idToken, patch) {
  const res = await fetch("/api/me/profile", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `me/profile PATCH failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    email: data?.email ?? "",
    username: data?.username ?? null,
    first_name: data?.first_name ?? null,
    last_name: data?.last_name ?? null,
  };
}
