import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "../firebaseClient";
import "./Login.css";

const SIGN_UP_LOGO_URL = "https://storage.googleapis.com/righteous-assets/NameTransparent.png";

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

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code || !code.trim()) {
      onBackToLogin();
    }
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

    setSubmitting(true);
    try {
      const res = await fetch("/api/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
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

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <img className="auth-logo" src={SIGN_UP_LOGO_URL} alt="Righteous Gaming" />
        <h1 className="auth-title">Sign Up</h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label" htmlFor="register-email">
            Email
          </label>
          <input
            id="register-email"
            className={`auth-input ${emailError ? "auth-input--error" : ""}`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            required
            disabled={submitting}
          />
          {emailError ? <p className="auth-error auth-error--field">{emailError}</p> : null}

          <label className="auth-label" htmlFor="register-username">
            Username
          </label>
          <input
            id="register-username"
            className={`auth-input ${usernameError ? "auth-input--error" : ""}`}
            type="text"
            autoComplete="nickname"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameError(null);
            }}
            disabled={submitting}
          />
          {usernameError ? <p className="auth-error auth-error--field">{usernameError}</p> : null}

          <label className="auth-label" htmlFor="register-password">
            Password
          </label>
          <input
            id="register-password"
            className="auth-input"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={64}
            disabled={submitting}
          />

          <label className="auth-label" htmlFor="register-confirm-password">
            Confirm password
          </label>
          <input
            id="register-confirm-password"
            className="auth-input"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            maxLength={64}
            disabled={submitting}
          />

          <label className="auth-checkbox-row" htmlFor="register-show-passwords">
            <input
              id="register-show-passwords"
              type="checkbox"
              checked={showPasswords}
              onChange={(e) => setShowPasswords(e.target.checked)}
              disabled={submitting}
            />
            Show passwords
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Signing up..." : "Sign Up"}
          </button>
          <button
            className="auth-secondary"
            type="button"
            onClick={onBackToLogin}
            disabled={submitting}
          >
            Back to sign in
          </button>
        </form>
      </div>
    </div>
  );
}
