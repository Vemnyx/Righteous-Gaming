import { useState } from "react";
import { AuthShell } from "../components/AuthShell";
import { useAuth } from "../auth/AuthContext";

/** Matches backend/domain: RoleAdmin = 0, RoleMember = 1 */
const ROLE_ADMIN = 0;

/** Must match Dashboard `SESSION_INVITE_RETURN_KEY` */
const SESSION_INVITE_RETURN_KEY = "rg-dashboard-return-url";

const THEME_STORAGE_KEY = "rg-dashboard-theme";

/** @param {{ onNavigate: (path: string) => void }} p */
function navigateBackToDashboard(onNavigate, fallbackPath = "/welcome") {
  try {
    const saved = sessionStorage.getItem(SESSION_INVITE_RETURN_KEY);
    sessionStorage.removeItem(SESSION_INVITE_RETURN_KEY);
    if (typeof saved === "string" && saved.startsWith("/")) {
      onNavigate(saved);
      return;
    }
  } catch {
    /* ignore */
  }
  onNavigate(fallbackPath);
}

const labelClass =
  "mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#c4b8d6]";

const inputClass =
  "w-full rounded-lg border border-transparent bg-[#332d3c] px-3 py-2.5 text-base text-[#f4f0fa] outline-none placeholder:text-[#8a7fa0] focus-visible:ring-2 focus-visible:ring-purple-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#423b4e] disabled:opacity-65";

const selectClass = `${inputClass} cursor-pointer`;

const primaryBtn =
  "mt-6 w-full cursor-pointer rounded-lg border border-white/[0.18] bg-gradient-to-br from-[#8b5abf] to-[#5c2f91] px-4 py-3 text-[0.9rem] font-semibold text-white shadow-[0_4px_20px_rgba(90,47,143,0.35)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:cursor-not-allowed disabled:opacity-55";

/** @param {{ onNavigate: (path: string) => void }} props */
export default function InviteUser({ onNavigate }) {
  const { user, sessionProfile, sessionProfileLoading } = useAuth();
  const [theme] = useState(() => {
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      return v === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const shellVariant = theme === "dark" ? "dark" : "light";
  const isAdmin = Number(sessionProfile?.role) === ROLE_ADMIN;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter an email address.");
      return;
    }
    const roleNum = Number(role);
    if (roleNum !== 0 && roleNum !== 1) {
      setError("Invalid role.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/user/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: trimmed, role: roleNum }),
      });

      if (res.status === 204) {
        setDone(true);
        setEmail("");
        setRole("1");
        return;
      }

      const text = await res.text();
      throw new Error(text?.trim() || res.statusText || `Request failed (${res.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionProfileLoading) {
    return (
      <div className="bg-shell-light-fog flex min-h-screen items-center justify-center font-sans text-[#6b6080]">
        <p>Loading…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <AuthShell variant={shellVariant} narrow>
        <h1 className="m-0 text-xl font-bold text-[#f4f0fa]">Admin only</h1>
        <p className="mt-3 text-[0.9rem] leading-relaxed text-[#f4f0fa]/75">
          You do not have access to invite users.
        </p>
        <button
          type="button"
          className="mt-8 w-full rounded-lg border border-white/20 bg-black/25 py-3 text-[0.9rem] font-semibold text-[#f4f0fa] hover:bg-black/35"
          onClick={() => navigateBackToDashboard(onNavigate)}
        >
          Back to dashboard
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell variant={shellVariant} narrow>
      <button
        type="button"
        className="mb-6 -ml-0.5 text-left text-[0.8125rem] font-semibold text-[#c4b8d6] underline-offset-2 hover:text-white hover:underline"
        onClick={() => navigateBackToDashboard(onNavigate)}
      >
        ← Back to dashboard
      </button>

      <h1 className="m-0 text-xl font-bold text-[#f4f0fa]">Invite user</h1>
      <p className="mt-2 text-[0.85rem] leading-relaxed text-[#f4f0fa]/70">
        Sends a registration email with a link to complete sign-up.
      </p>

      {done ? (
        <p
          className="mt-5 rounded-lg border border-emerald-500/35 bg-emerald-950/35 px-3 py-2.5 text-[0.875rem] text-emerald-100/95"
          role="status"
        >
          Invitation email sent.
        </p>
      ) : null}

      {error ? (
        <p
          className="mt-5 rounded-lg border border-red-400/35 bg-red-950/35 px-3 py-2.5 text-[0.875rem] text-red-100/95"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <form className="mt-6 flex flex-col" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <label className={labelClass} htmlFor="invite-email">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          autoComplete="email"
          className={inputClass}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setDone(false);
          }}
          placeholder="name@gmail.com"
          disabled={submitting}
        />

        <label className={`${labelClass} mt-5`} htmlFor="invite-role">
          Role
        </label>
        <select
          id="invite-role"
          className={selectClass}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setDone(false);
          }}
          disabled={submitting}
        >
          <option value="1">Member</option>
          <option value="0">Admin</option>
        </select>

        <button type="submit" className={primaryBtn} disabled={submitting}>
          {submitting ? "Sending…" : "Send invitation"}
        </button>
      </form>
    </AuthShell>
  );
}
