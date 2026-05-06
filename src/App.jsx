import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
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
    return <Login />;
  }

  if (loading) {
    return (
      <div className="bg-shell-auth flex min-h-screen items-center justify-center font-sans text-[#f4f0fa]/85">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    if (path === "/register") {
      return <Register onSuccess={() => navigate("/welcome")} onBackToLogin={() => navigate("/")} />;
    }
    return <Login />;
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}
