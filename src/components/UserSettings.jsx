import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchUserSettingsFromApi,
  saveUserSettingsFromApi,
  userSettingsFromProfile,
} from "../auth/sessionProfile";

/**
 * @param {{ enabled: boolean, disabled?: boolean, onChange: (next: boolean) => void, isLight: boolean, label: string, description?: string }} props
 */
function SettingsToggle({ enabled, disabled, onChange, isLight, label, description }) {
  const trackCls = enabled
    ? "bg-violet-600/90 border-violet-400/55"
    : isLight
      ? "bg-[#4a4658]/95 border-white/20"
      : "bg-black/45 border-white/[0.22]";
  const knobCls = enabled ? "translate-x-5" : "translate-x-0";

  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0 flex-1">
        <span className="block text-[0.95rem] font-semibold text-[#f4f0fa]">{label}</span>
        {description ? (
          <span className="mt-1 block text-[0.85rem] leading-snug text-[#f4f0fa]/70">{description}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${trackCls}`}
      >
        <span
          aria-hidden
          className={`block size-6 rounded-full bg-white shadow transition-transform ${knobCls}`}
        />
      </button>
    </label>
  );
}

/**
 * @param {{ theme: string, onChange: (next: "light" | "dark") => void, className?: string }} props
 */
function ThemeToggle({ theme, onChange, className = "" }) {
  const lightMode = theme === "light";
  return (
    <div
      className={`flex min-h-11 min-w-0 items-stretch gap-0 overflow-hidden rounded-lg border p-0.5 text-[0.74rem] font-semibold leading-none sm:min-h-12 sm:text-[0.8rem] ${
        lightMode
          ? "border-white/15 bg-[rgba(42,37,54,0.82)] backdrop-blur-sm"
          : "border-white/[0.28] bg-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      } ${className}`}
      role="group"
      aria-label="Color mode"
    >
      <button
        type="button"
        aria-pressed={lightMode}
        onClick={() => onChange("light")}
        className={`flex flex-1 items-center justify-center rounded-md px-3 py-2.5 sm:px-3.5 ${
          lightMode
            ? "bg-white/18 text-white shadow-inner"
            : "text-[#f4f0fa]/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={!lightMode}
        onClick={() => onChange("dark")}
        className={`flex flex-1 items-center justify-center rounded-md px-3 py-2.5 sm:px-3.5 ${
          !lightMode
            ? "bg-white/15 text-white shadow-inner"
            : "text-[#f4f0fa]/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        Dark
      </button>
    </div>
  );
}

/**
 * @param {{ isLight: boolean, active: boolean, theme: string, onThemeChange: (next: "light" | "dark") => void }} props
 */
export function UserSettings({ isLight, active, theme, onThemeChange }) {
  const { user, sessionProfile, sessionProfileLoading, updateSessionProfileSettings } = useAuth();
  const profileSettings = userSettingsFromProfile(sessionProfile);
  const quickSubmit = profileSettings.card_rater_quick_submit;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!active || !user || sessionProfileLoading) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const settings = await fetchUserSettingsFromApi(token);
        if (!cancelled) {
          updateSessionProfileSettings(settings);
          setFirstName(settings.first_name != null ? String(settings.first_name) : "");
          setLastName(settings.last_name != null ? String(settings.last_name) : "");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load settings");
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
  }, [active, user, sessionProfileLoading, updateSessionProfileSettings, sessionProfile?.first_name, sessionProfile?.last_name]);

  const onQuickSubmitChange = useCallback(
    async (next) => {
      if (!user || saving || loading) return;
      const prev = quickSubmit;
      updateSessionProfileSettings({ card_rater_quick_submit: next });
      setError(null);
      setSaving(true);
      try {
        const token = await user.getIdToken();
        const saved = await saveUserSettingsFromApi(token, { card_rater_quick_submit: next });
        updateSessionProfileSettings(saved);
      } catch (e) {
        updateSessionProfileSettings({ card_rater_quick_submit: prev });
        setError(e instanceof Error ? e.message : "Failed to save setting");
      } finally {
        setSaving(false);
      }
    },
    [user, saving, loading, quickSubmit, updateSessionProfileSettings],
  );

  const onSaveProfile = useCallback(async () => {
    if (!user || savingProfile || loading) return;
    setError(null);
    setSavingProfile(true);
    try {
      const token = await user.getIdToken();
      const saved = await saveUserSettingsFromApi(token, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      updateSessionProfileSettings(saved);
      setFirstName(saved.first_name != null ? String(saved.first_name) : "");
      setLastName(saved.last_name != null ? String(saved.last_name) : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  }, [user, savingProfile, loading, firstName, lastName, updateSessionProfileSettings]);

  const sectionCls = isLight
    ? "rounded-xl border border-white/[0.18] bg-black/25 p-5 shadow-sm"
    : "rounded-xl border border-white/[0.14] bg-black/35 p-5 shadow-sm";
  const inputCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/35 focus:border-purple-400/55";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";

  if (!active) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-left">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-tight text-[#f4f0fa]">Settings</h1>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-[#f4f0fa]/70">
          Manage your personal preferences for Righteous Gaming.
        </p>
      </div>

      <section className={sectionCls} aria-labelledby="user-settings-profile-heading">
        <h2 id="user-settings-profile-heading" className="m-0 text-[1.05rem] font-semibold text-[#f4f0fa]">
          Profile
        </h2>
        <div className="mt-4 border-t border-white/[0.1] pt-4">
          {loading ? (
            <p className="m-0 text-[0.88rem] text-[#f4f0fa]/70">Loading settings…</p>
          ) : (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                  First name
                </span>
                <input
                  type="text"
                  className={inputCls}
                  value={firstName}
                  autoComplete="given-name"
                  disabled={savingProfile || !user}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                  Last name
                </span>
                <input
                  type="text"
                  className={inputCls}
                  value={lastName}
                  autoComplete="family-name"
                  disabled={savingProfile || !user}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
              <div>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={savingProfile || !user}
                  onClick={() => void onSaveProfile()}
                >
                  {savingProfile ? "Saving…" : "Save profile"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={sectionCls} aria-labelledby="user-settings-appearance-heading">
        <h2 id="user-settings-appearance-heading" className="m-0 text-[1.05rem] font-semibold text-[#f4f0fa]">
          Appearance
        </h2>
        <div className="mt-4 border-t border-white/[0.1] pt-4">
          <div className="flex flex-col gap-3">
            <div>
              <span className="block text-[0.95rem] font-semibold text-[#f4f0fa]">Color mode</span>
              <span className="mt-1 block text-[0.85rem] leading-snug text-[#f4f0fa]/70">
                Choose light or dark styling for the dashboard.
              </span>
            </div>
            <ThemeToggle theme={theme} onChange={onThemeChange} className="max-w-xs" />
          </div>
        </div>
      </section>

      <section className={sectionCls} aria-labelledby="user-settings-card-rater-heading">
        <h2 id="user-settings-card-rater-heading" className="m-0 text-[1.05rem] font-semibold text-[#f4f0fa]">
          Card Rater
        </h2>
        <div className="mt-4 border-t border-white/[0.1] pt-4">
          {loading ? (
            <p className="m-0 text-[0.88rem] text-[#f4f0fa]/70">Loading settings…</p>
          ) : (
            <SettingsToggle
              isLight={isLight}
              enabled={quickSubmit}
              disabled={saving || !user}
              label="Quick submit"
              description="Automatically submit your star rating and go to the next card when you pick a star count."
              onChange={(next) => void onQuickSubmitChange(next)}
            />
          )}
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
