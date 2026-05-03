import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { auth as firebaseuiAuth } from "firebaseui";
import "firebaseui/dist/firebaseui.css";
import { getFirebaseAuth, isFirebaseConfigured } from "../firebaseClient";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isFirebaseConfigured() || !containerRef.current) {
      return undefined;
    }

    const auth = getFirebaseAuth();
    const ui =
      firebaseuiAuth.AuthUI.getInstance() || new firebaseuiAuth.AuthUI(auth);

    const uiConfig = {
      signInFlow: "popup",
      signInOptions: [
        firebase.auth.EmailAuthProvider.PROVIDER_ID,
        firebase.auth.GoogleAuthProvider.PROVIDER_ID,
      ],
      credentialHelper: firebaseuiAuth.CredentialHelper.NONE,
      callbacks: {
        signInSuccessWithAuthResult() {
          navigate("/", { replace: true });
          return false;
        },
      },
    };

    ui.start(containerRef.current, uiConfig);

    return () => {
      try {
        ui.reset();
      } catch {
        /* ignore */
      }
    };
  }, [navigate]);

  if (!isFirebaseConfigured()) {
    return (
      <div className="login-page login-page--missing">
        <h1 className="login-page__title">Firebase not configured</h1>
        <p className="login-page__text">
          Add the <code>VITE_FIREBASE_*</code> variables from your Firebase web app config (see{" "}
          <code>.env.example</code>), then rebuild.
        </p>
        <Link className="login-page__link" to="/">
          Back home
        </Link>
      </div>
    );
  }

  return (
    <div className="login-page">
      <header className="login-page__header">
        <h1 className="login-page__title">Sign in</h1>
        <Link className="login-page__link" to="/">
          Cancel
        </Link>
      </header>
      <div ref={containerRef} id="firebaseui-auth-container" />
    </div>
  );
}
