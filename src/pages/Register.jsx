import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "../firebaseClient";
import "./Login.css";

const LOGIN_LOGO_URL = "https://storage.googleapis.com/righteous-assets/450x450xTransparent.png";

export default function Register({ onSuccess, onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
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
      const res = await fetch("/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim() || null,
          password,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Registration failed.");
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
        <img className="auth-logo" src={LOGIN_LOGO_URL} alt="Righteous Gaming" />
        <h1 className="auth-title">Create account</h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label" htmlFor="register-email">
            Email
          </label>
          <input
            id="register-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
          />

          <label className="auth-label" htmlFor="register-username">
            Username
          </label>
          <input
            id="register-username"
            className="auth-input"
            type="text"
            autoComplete="nickname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
          />

          <label className="auth-label" htmlFor="register-password">
            Password
          </label>
          <input
            id="register-password"
            className="auth-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            disabled={submitting}
          />

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
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
