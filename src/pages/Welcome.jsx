import { useAuth } from "../auth/AuthContext";
import "./Welcome.css";

export default function Welcome() {
  const { user, signOut } = useAuth();

  return (
    <div className="welcome-shell">
      <main className="welcome-card">
        <h1 className="welcome-title">Welcome!</h1>
        {user?.email ? <p className="welcome-email">{user.email}</p> : null}
        <button type="button" className="welcome-signout" onClick={() => void signOut()}>
          Sign out
        </button>
      </main>
    </div>
  );
}
