import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "../firebaseClient";
import { AuthShell } from "../components/AuthShell";

/** Horizontal mark (lion + wordmark); regenerate with `npm run build:logo`. */
const LOGIN_LOGO_URL = "/righteous-logo-horizontal.png";

const inputClass =
  "mb-1 rounded-lg border border-transparent bg-[#332d3c] px-3 py-2.5 text-base text-[#f4f0fa] outline-none placeholder:text-[#8a7fa0] focus-visible:ring-2 focus-visible:ring-purple-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#423b4e] disabled:opacity-65";

const labelClass =
  "mt-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#c4b8d6]";

const primaryBtnClass =
  "mt-4 cursor-pointer rounded-lg border-none bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] px-4 py-2.5 text-[0.95rem] font-semibold text-white shadow-[0_6px_20px_rgba(60,30,95,0.35)] hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-70";

const ghostBtnClass =
  "mt-2.5 w-full cursor-pointer rounded-lg border border-white/25 bg-transparent px-4 py-2.5 text-[0.92rem] font-semibold text-[#f4f0fa] hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-65";

function mapAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "That email address does not look valid.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export default function Login({ onRegisterWithInvite }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!isFirebaseConfigured()) {
      setError("Firebase is not configured.");
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    } catch (err) {
      setError(mapAuthError(err?.code));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isFirebaseConfigured()) {
    return (
      <AuthShell narrow>
        <h1 className="mb-2 text-[1.35rem] font-[650] tracking-wide text-[#f4f0fa]">Configuration needed</h1>
        <p className="mb-5 text-[0.88rem] leading-relaxed text-[#f4f0fa]/[0.72]">
          Add <code className="rounded bg-[#332d3c] px-1 py-0.5 text-[0.82em] text-[#e8def5]">VITE_FIREBASE_*</code> in{" "}
          <code className="rounded bg-[#332d3c] px-1 py-0.5 text-[0.82em] text-[#e8def5]">.env.local</code> (see{" "}
          <code className="rounded bg-[#332d3c] px-1 py-0.5 text-[0.82em] text-[#e8def5]">.env.example</code>), then
          restart the dev server.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <img
        className="mx-auto mb-3.5 block h-auto w-[min(340px,92%)]"
        src={LOGIN_LOGO_URL}
        alt="Righteous Gaming"
      />
      <h1 className="mb-2 text-[1.35rem] font-[650] tracking-wide text-[#f4f0fa]">Sign in</h1>
      <form className="flex flex-col gap-1" onSubmit={handleSubmit}>
        <label className={labelClass} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className={inputClass}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={submitting}
        />
        <label className={labelClass} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className={inputClass}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={submitting}
        />
        {error ? <p className="mt-1.5 text-[0.85rem] text-[#ffb4b4]">{error}</p> : null}
        <button type="submit" disabled={submitting} className={primaryBtnClass}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {typeof onRegisterWithInvite === "function" ? (
        <button type="button" className={ghostBtnClass} onClick={onRegisterWithInvite}>
          Register with invite link
        </button>
      ) : null}
    </AuthShell>
  );
}
