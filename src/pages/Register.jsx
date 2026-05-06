import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "../firebaseClient";
import { AuthShell } from "../components/AuthShell";

const SIGN_UP_LOGO_URL = "/righteous-logo-horizontal.png";

const labelClass =
  "mt-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#c4b8d6]";

const baseInput =
  "mb-1 rounded-lg border border-transparent bg-[#332d3c] px-3 py-2.5 text-base text-[#f4f0fa] outline-none focus-visible:ring-2 focus-visible:ring-purple-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#423b4e] disabled:opacity-65";

const inputErrorRing =
  "border border-red-400/45 shadow-[0_0_0_1px_rgba(255,140,140,0.2)] focus-visible:ring-red-400/40";

const primaryBtnClass =
  "mt-4 cursor-pointer rounded-lg border-none bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] px-4 py-2.5 text-[0.95rem] font-semibold text-white shadow-[0_6px_20px_rgba(60,30,95,0.35)] hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-70";

const ghostBtnClass =
  "mt-2.5 w-full cursor-pointer rounded-lg border border-white/25 bg-transparent px-4 py-2.5 text-[0.92rem] font-semibold text-[#f4f0fa] hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-65";

export default function Register({ onSuccess, onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [usernameError, setUsernameError] = useState(null);
  const [error, setError] = useState(null);
  const [loadingRegistration, setLoadingRegistration] = useState(true);
  const [registrationExpired, setRegistrationExpired] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code || !code.trim()) {
      onBackToLogin();
      return;
    }
    setInviteCode(code.trim());
    const controller = new AbortController();
    const fetchRegistration = async () => {
      try {
        const res = await fetch(`/api/registration?code=${encodeURIComponent(code)}`, {
          method: "GET",
          signal: controller.signal,
        });
        if (!res.ok) {
          onBackToLogin();
          return;
        }
        const data = await res.json();
        const inviteEmail = typeof data?.email === "string" ? data.email.trim() : "";
        const expireAt = new Date(data?.expire_at);
        if (!inviteEmail || Number.isNaN(expireAt.getTime())) {
          onBackToLogin();
          return;
        }
        setEmail(inviteEmail);
        setRegistrationExpired(new Date() > expireAt);
      } catch {
        onBackToLogin();
      } finally {
        setLoadingRegistration(false);
      }
    };
    fetchRegistration();
    return () => controller.abort();
  }, [onBackToLogin]);

  async function handleSubmit(e) {
    e.preventDefault();
    setEmailError(null);
    setUsernameError(null);
    setError(null);
    if (!isFirebaseConfigured()) {
      setError("Firebase is not configured.");
      return;
    }
    if (password.length < 8 || password.length > 64) {
      setError("Password must be between 8 and 64 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!inviteCode.trim()) {
      setError("Registration code is missing. Please open the link from your invitation email.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: inviteCode.trim(),
          username: username.trim() || null,
          password,
        }),
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const body = await res.json();
          if (body?.field === "email") {
            setEmailError(body?.message || "Email is already registered.");
            return;
          }
          if (body?.field === "username") {
            setUsernameError(body?.message || "Username is not available.");
            return;
          }
          if (typeof body?.message === "string" && body.message.trim()) {
            setError(body.message.trim());
            return;
          }
          setError("Error registering user");
          return;
        }
        setError("Error registering user");
        return;
      }
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err?.message || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingRegistration) {
    return (
      <AuthShell narrow>
        <h1 className="mb-2 text-[1.35rem] font-[650] tracking-wide text-[#f4f0fa]">Checking invitation...</h1>
      </AuthShell>
    );
  }

  if (registrationExpired) {
    return (
      <AuthShell narrow>
        <h1 className="mb-2 text-[1.35rem] font-[650] tracking-wide text-[#f4f0fa]">Registration expired</h1>
        <p className="mb-5 text-[0.88rem] leading-relaxed text-[#f4f0fa]/[0.72]">
          This registration link has expired. Please contact your admin to send a new invite.
        </p>
        <button
          type="button"
          className={ghostBtnClass}
          onClick={onBackToLogin}
        >
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <img
        className="mx-auto mb-3.5 block h-auto w-[min(340px,92%)]"
        src={SIGN_UP_LOGO_URL}
        alt="Righteous Gaming"
      />
      <h1 className="mb-2 text-[1.35rem] font-[650] tracking-wide text-[#f4f0fa]">Sign Up</h1>
      <form className="flex flex-col gap-1" onSubmit={handleSubmit}>
        <label className={labelClass} htmlFor="register-email">
          Email
        </label>
        <input
          id="register-email"
          className={`${baseInput} ${emailError ? inputErrorRing : ""}`}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(null);
          }}
          required
          disabled
        />
        {emailError ? (
          <p className="-mt-0.5 mb-0.5 text-[0.85rem] text-[#ffb4b4]">{emailError}</p>
        ) : null}

        <label className={labelClass} htmlFor="register-username">
          Username
        </label>
        <input
          id="register-username"
          className={`${baseInput} ${usernameError ? inputErrorRing : ""}`}
          type="text"
          autoComplete="nickname"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setUsernameError(null);
          }}
          disabled={submitting}
        />
        {usernameError ? (
          <p className="-mt-0.5 mb-0.5 text-[0.85rem] text-[#ffb4b4]">{usernameError}</p>
        ) : null}

        <label className={labelClass} htmlFor="register-password">
          Password
        </label>
        <input
          id="register-password"
          className={baseInput}
          type={showPasswords ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          maxLength={64}
          disabled={submitting}
        />

        <label className={labelClass} htmlFor="register-confirm-password">
          Confirm password
        </label>
        <input
          id="register-confirm-password"
          className={baseInput}
          type={showPasswords ? "text" : "password"}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          maxLength={64}
          disabled={submitting}
        />

        <label
          className="mt-1 inline-flex cursor-pointer items-center gap-2 text-[0.88rem] text-[#f4f0fa]/85"
          htmlFor="register-show-passwords"
        >
          <input
            id="register-show-passwords"
            type="checkbox"
            className="size-4 shrink-0 rounded border border-white/25 bg-[#332d3c] text-purple-400 accent-[#a78bfa]"
            checked={showPasswords}
            onChange={(e) => setShowPasswords(e.target.checked)}
            disabled={submitting}
          />
          Show passwords
        </label>

        {error ? <p className="mt-1.5 text-[0.85rem] text-[#ffb4b4]">{error}</p> : null}

        <button type="submit" disabled={submitting} className={primaryBtnClass}>
          {submitting ? "Signing up..." : "Sign Up"}
        </button>
        <button
          type="button"
          className={ghostBtnClass}
          disabled={submitting}
          onClick={onBackToLogin}
        >
          Back to sign in
        </button>
      </form>
    </AuthShell>
  );
}
