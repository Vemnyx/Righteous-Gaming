import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import Welcome from "./pages/Welcome";

function AppGate() {
  const { user, loading, configured } = useAuth();

  if (!configured) {
    return <Login />;
  }

  if (loading) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <Welcome />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}
