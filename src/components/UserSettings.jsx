import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { patchUserSettingsFromApi, userSettingsFromProfile } from "../auth/sessionProfile";

/**
 * @param {{ enabled: boolean, disabled?: boolean, onChange: (next: boolean) => void, isLight: boolean, label: string, description?: string }} props
 */
function SettingsToggle({ enabled, disabled, onChange, isLight, label, description }) {
  const trackCls = enabled
    ? "bg-violet-600/90 border-violet-400/55"
    : isLight
      ? "bg-[#4a4658]/95 border-white/20"
      : "bg-black/45 border-white/[0.22]";
  const knobCls = enabled ? "translate-x-5" : "translate-x-0.5";

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
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${trackCls}`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform ${knobCls}`}
        />
      </button>
    </label>
  );
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function UserSettings({ isLight, active }) {
  const { user, sessionProfile, updateSessionProfileSettings } = useAuth();
  const quickSubmit = userSettingsFromProfile(sessionProfile).card_rater_quick_submit;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const onQuickSubmitChange = useCallback(
    async (next) => {
      if (!user || saving) return;
      const prev = quickSubmit;
      updateSessionProfileSettings({ card_rater_quick_submit: next });
      setError(null);
      setSaving(true);
      try {
        const token = await user.getIdToken();
        const saved = await patchUserSettingsFromApi(token, { card_rater_quick_submit: next });
        updateSessionProfileSettings(saved);
      } catch (e) {
        updateSessionProfileSettings({ card_rater_quick_submit: prev });
        setError(e instanceof Error ? e.message : "Failed to save setting");
      } finally {
        setSaving(false);
      }
    },
    [user, saving, quickSubmit, updateSessionProfileSettings],
  );

  const sectionCls = isLight
    ? "rounded-xl border border-white/[0.18] bg-black/25 p-5 shadow-sm"
    : "rounded-xl border border-white/[0.14] bg-black/35 p-5 shadow-sm";

  if (!active) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-left">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-tight text-[#f4f0fa]">Settings</h1>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-[#f4f0fa]/70">
          Manage your personal preferences for Righteous Gaming.
        </p>
      </div>

      <section className={sectionCls} aria-labelledby="user-settings-card-rater-heading">
        <h2 id="user-settings-card-rater-heading" className="m-0 text-[1.05rem] font-semibold text-[#f4f0fa]">
          Card Rater
        </h2>
        <div className="mt-4 border-t border-white/[0.1] pt-4">
          <SettingsToggle
            isLight={isLight}
            enabled={quickSubmit}
            disabled={saving || !user}
            label="Quick submit"
            description="Automatically submit your star rating when you swipe to the next card."
            onChange={(next) => void onQuickSubmitChange(next)}
          />
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
