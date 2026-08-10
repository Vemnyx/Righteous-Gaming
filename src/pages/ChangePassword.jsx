import { useState } from "react";
import { AuthShell } from "../components/AuthShell";
import { useAuth } from "../auth/AuthContext";

const THEME_STORAGE_KEY = "rg-dashboard-theme";

const labelClass =
  "mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#c4b8d6]";

const inputClass =
  "w-full rounded-lg border border-transparent bg-[#332d3c] px-3 py-2.5 text-base text-[#f4f0fa] outline-none placeholder:text-[#8a7fa0] focus-visible:ring-2 focus-visible:ring-purple-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#423b4e] disabled:opacity-65";

const primaryBtn =
  "mt-6 w-full cursor-pointer rounded-lg border border-white/[0.18] bg-gradient-to-br from-[#8b5abf] to-[#5c2f91] px-4 py-3 text-[0.9rem] font-semibold text-white shadow-[0_4px_20px_rgba(90,47,143,0.35)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:cursor-not-allowed disabled:opacity-55";

export default function ChangePassword() {
  const { user, updateSessionProfile, signOut } = useAuth();
  const [theme] = useState(() => {
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      return v === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const shellVariant = theme === "dark" ? "dark" : "light";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    const next = password.trim();
    if (next.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (next !== confirm.trim()) {
      setError("Passwords do not match.");
      return;
    }
    if (next === "password123+") {
      setError("Choose a password different from the temporary default.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/me/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: next }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text?.trim() || res.statusText || `Request failed (${res.status})`);
      }
      updateSessionProfile({ default_password_changed: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell variant={shellVariant} narrow>
      <h1 className="m-0 text-xl font-bold text-[#f4f0fa]">Set a new password</h1>
      <p className="mt-2 text-[0.85rem] leading-relaxed text-[#f4f0fa]/70">
        Your account still uses the temporary password. Choose a new one before continuing.
      </p>

      {error ? (
        <p
          className="mt-5 rounded-lg border border-red-400/35 bg-red-950/35 px-3 py-2.5 text-[0.875rem] text-red-100/95"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <form className="mt-6 flex flex-col" onSubmit={(e) => void handleSubmit(e)}>
        <label className={labelClass} htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={submitting}
        />

        <label className={`${labelClass} mt-5`} htmlFor="confirm-password">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          disabled={submitting}
        />

        <button type="submit" className={primaryBtn} disabled={submitting}>
          {submitting ? "Saving…" : "Save password"}
        </button>
      </form>

      <button
        type="button"
        className="mt-4 w-full rounded-lg border border-white/20 bg-black/25 py-3 text-[0.9rem] font-semibold text-[#f4f0fa] hover:bg-black/35"
        onClick={() => void signOut()}
        disabled={submitting}
      >
        Sign out
      </button>
    </AuthShell>
  );
}
