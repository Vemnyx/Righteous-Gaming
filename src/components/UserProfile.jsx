import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { fetchUserProfileFromApi, saveUserProfileFromApi } from "../auth/sessionProfile";

/**
 * @param {string | undefined | null} errText
 * @returns {string}
 */
function parseApiError(errText) {
  const raw = (errText ?? "").trim();
  if (raw === "") return "Request failed";
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.message === "string" && j.message.trim() !== "") return j.message.trim();
    if (j && typeof j.field === "string" && j.field === "username" && typeof j.message === "string") {
      return j.message.trim();
    }
  } catch {
    /* use raw */
  }
  return raw;
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function UserProfile({ isLight, active }) {
  const { user, sessionProfile, sessionProfileLoading, updateSessionProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [usernameError, setUsernameError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!active || !user || sessionProfileLoading) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setUsernameError(null);
      try {
        const token = await user.getIdToken();
        const profile = await fetchUserProfileFromApi(token);
        if (!cancelled) {
          setEmail(profile.email ?? "");
          setUsername(profile.username != null ? String(profile.username) : "");
          setFirstName(profile.first_name != null ? String(profile.first_name) : "");
          setLastName(profile.last_name != null ? String(profile.last_name) : "");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load profile");
          setEmail(sessionProfile?.email != null ? String(sessionProfile.email) : "");
          setUsername(sessionProfile?.username != null ? String(sessionProfile.username) : "");
          setFirstName(sessionProfile?.first_name != null ? String(sessionProfile.first_name) : "");
          setLastName(sessionProfile?.last_name != null ? String(sessionProfile.last_name) : "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    active,
    user,
    sessionProfileLoading,
    sessionProfile?.email,
    sessionProfile?.username,
    sessionProfile?.first_name,
    sessionProfile?.last_name,
  ]);

  const onSave = useCallback(async () => {
    if (!user || saving || loading) return;
    setError(null);
    setUsernameError(null);
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const saved = await saveUserProfileFromApi(token, {
        username: username.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      updateSessionProfile({
        username: saved.username ?? null,
        first_name: saved.first_name ?? null,
        last_name: saved.last_name ?? null,
      });
      setUsername(saved.username != null ? String(saved.username) : "");
      setFirstName(saved.first_name != null ? String(saved.first_name) : "");
      setLastName(saved.last_name != null ? String(saved.last_name) : "");
    } catch (e) {
      const msg = e instanceof Error ? parseApiError(e.message) : "Failed to save profile";
      if (msg.toLowerCase().includes("username")) {
        setUsernameError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }, [user, saving, loading, username, firstName, lastName, updateSessionProfile]);

  const sectionCls = isLight
    ? "rounded-xl border border-white/[0.18] bg-black/25 p-5 shadow-sm"
    : "rounded-xl border border-white/[0.14] bg-black/35 p-5 shadow-sm";
  const inputCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55 disabled:opacity-60"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/35 focus:border-purple-400/55 disabled:opacity-60";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";

  if (!active) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-left">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-tight text-[#f4f0fa]">Profile</h1>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-[#f4f0fa]/70">
          Update how you appear across Righteous Gaming.
        </p>
      </div>

      <section className={sectionCls}>
        {loading ? (
          <p className="m-0 text-[0.88rem] text-[#f4f0fa]/70">Loading profile…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Email</span>
              <input type="email" className={inputCls} value={email} disabled readOnly />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Username</span>
              <input
                type="text"
                className={`${inputCls}${usernameError ? " border-red-400/55" : ""}`}
                value={username}
                autoComplete="nickname"
                disabled={saving || !user}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError(null);
                }}
              />
              {usernameError ? <span className="text-[0.82rem] text-red-200/90">{usernameError}</span> : null}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">First name</span>
              <input
                type="text"
                className={inputCls}
                value={firstName}
                autoComplete="given-name"
                disabled={saving || !user}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Last name</span>
              <input
                type="text"
                className={inputCls}
                value={lastName}
                autoComplete="family-name"
                disabled={saving || !user}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
            <div>
              <button type="button" className={btnPrimary} disabled={saving || !user} onClick={() => void onSave()}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </div>
        )}
      </section>

      {error ? (
        <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
