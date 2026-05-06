import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Welcome from "./pages/Welcome";
import { useCallback, useEffect, useState } from "react";

function AppGate() {
  const { user, loading, configured } = useAuth();
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((nextPath) => {
    if (window.location.pathname === nextPath) return;
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }, []);

  if (!configured) {
    return <Login onRegister={() => navigate("/register")} />;
  }

  if (loading) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    if (path === "/register") {
      return <Register onSuccess={() => navigate("/welcome")} onBackToLogin={() => navigate("/")} />;
    }
    return <Login onRegister={() => navigate("/register")} />;
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
