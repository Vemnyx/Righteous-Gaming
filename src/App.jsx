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
      <div className="flex min-h-screen items-center justify-center bg-[#f3f0f7] bg-[radial-gradient(ellipse_52%_44%_at_50%_40%,rgba(206,188,238,0.55),transparent_68%)] font-sans text-[#6b6080]">
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
