import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { profileNeedsCompletion, saveUserProfileFromApi } from "../auth/sessionProfile";

const THEME_STORAGE_KEY = "rg-dashboard-theme";

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
  } catch {
    /* use raw */
  }
  return raw;
}

/**
 * Blocking modal when the signed-in user is missing first name, last name, or Discord username.
 */
export function CompleteProfileModal() {
  const { user, sessionProfile, sessionProfileLoading, updateSessionProfile } = useAuth();
  const titleId = useId();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [discordName, setDiscordName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [discordError, setDiscordError] = useState(/** @type {string | null} */ (null));
  const [isLight, setIsLight] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) !== "dark";
    } catch {
      return true;
    }
  });

  const needsCompletion =
    Boolean(user) && !sessionProfileLoading && profileNeedsCompletion(sessionProfile);

  useEffect(() => {
    if (!needsCompletion || !sessionProfile) return;
    setFirstName(sessionProfile.first_name != null ? String(sessionProfile.first_name) : "");
    setLastName(sessionProfile.last_name != null ? String(sessionProfile.last_name) : "");
    setDiscordName(sessionProfile.username != null ? String(sessionProfile.username) : "");
    setError(null);
    setDiscordError(null);
  }, [needsCompletion, sessionProfile]);

  useEffect(() => {
    if (!needsCompletion) return undefined;
    const onStorage = (e) => {
      if (e.key === THEME_STORAGE_KEY) {
        setIsLight(e.newValue !== "dark");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [needsCompletion]);

  if (!needsCompletion) return null;

  const panel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";
  const inputCls =
    "w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55 disabled:opacity-60";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";

  const missing = [];
  if (!(sessionProfile?.first_name != null && String(sessionProfile.first_name).trim())) {
    missing.push("first name");
  }
  if (!(sessionProfile?.last_name != null && String(sessionProfile.last_name).trim())) {
    missing.push("last name");
  }
  if (!(sessionProfile?.username != null && String(sessionProfile.username).trim())) {
    missing.push("Discord name");
  }

  const missingLabel =
    missing.length === 0
      ? "your profile details"
      : missing.length === 1
        ? `your ${missing[0]}`
        : missing.length === 2
          ? `your ${missing[0]} and ${missing[1]}`
          : `your ${missing[0]}, ${missing[1]}, and ${missing[2]}`;

  const onSave = async () => {
    if (!user || saving) return;
    const nextFirst = firstName.trim();
    const nextLast = lastName.trim();
    const nextDiscord = discordName.trim();
    setError(null);
    setDiscordError(null);
    if (!nextFirst || !nextLast || !nextDiscord) {
      setError("First name, last name, and Discord name are all required.");
      return;
    }
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const saved = await saveUserProfileFromApi(token, {
        username: nextDiscord,
        first_name: nextFirst,
        last_name: nextLast,
      });
      updateSessionProfile({
        username: saved.username ?? null,
        first_name: saved.first_name ?? null,
        last_name: saved.last_name ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? parseApiError(e.message) : "Failed to save profile";
      const lower = msg.toLowerCase();
      if (lower.includes("username") || lower.includes("discord")) {
        setDiscordError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[700] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className={`w-full max-w-md rounded-2xl p-5 sm:p-6 ${panel}`}>
        <h2 id={titleId} className="m-0 text-[1.1rem] font-semibold text-[#f4f0fa]">
          Complete your profile
        </h2>
        <p className="mt-2 m-0 text-[0.875rem] leading-relaxed text-[#f4f0fa]/70">
          Please add {missingLabel} so teammates can recognize you across the app.
        </p>
        <form
          className="mt-4 flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
              First name
            </span>
            <input
              type="text"
              className={inputCls}
              value={firstName}
              autoComplete="given-name"
              autoFocus
              required
              disabled={saving}
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
              required
              disabled={saving}
              onChange={(e) => setLastName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
              Discord name
            </span>
            <input
              type="text"
              className={`${inputCls}${discordError ? " border-red-400/55" : ""}`}
              value={discordName}
              autoComplete="nickname"
              required
              disabled={saving}
              onChange={(e) => {
                setDiscordName(e.target.value);
                setDiscordError(null);
              }}
            />
            <span className="text-[0.8rem] text-[#f4f0fa]/55">
              Shown on decks, recordings, and other member-attributed content.
            </span>
            {discordError ? <span className="text-[0.82rem] text-red-200/90">{discordError}</span> : null}
          </label>
          {error ? (
            <p className="m-0 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">
              {error}
            </p>
          ) : null}
          <button type="submit" className={`mt-1 self-end ${btnPrimary}`} disabled={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
