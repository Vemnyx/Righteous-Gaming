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
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#ffffff_0%,#f4f4f5_50%,#e4e4e7_100%)] bg-[radial-gradient(ellipse_70%_50%_at_50%_25%,rgb(255_255_255/0.92),transparent_55%)] font-sans text-zinc-600">
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
