import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import InviteUser from "./pages/InviteUser";
import { useCallback, useEffect, useState } from "react";

function splitPath(searchPath) {
  const qIdx = searchPath.indexOf("?");
  if (qIdx < 0) return { pathname: searchPath.startsWith("/") ? searchPath : `/${searchPath}`, search: "" };
  let pathname = searchPath.slice(0, qIdx);
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return { pathname, search: searchPath.slice(qIdx) };
}

function AppGate() {
  const { user, loading, configured } = useAuth();
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((nextPath) => {
    const trimmed = typeof nextPath === "string" ? nextPath.trim() : "";
    const { pathname, search } = splitPath(trimmed);
    const full = pathname + search;
    if (`${window.location.pathname}${window.location.search}` === full) return;
    window.history.pushState({}, "", full);
    setPath(pathname);
  }, []);

  if (!configured) {
    return <Login />;
  }

  if (loading) {
    return (
      <div className="bg-shell-light-fog flex min-h-screen items-center justify-center font-sans text-[#6b6080]">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    if (path === "/register") {
      return (
        <Register
          onSuccess={() => navigate("/announcements")}
          onBackToLogin={() => navigate("/")}
        />
      );
    }
    return <Login />;
  }

  if (path === "/admin/invite-user") {
    return <InviteUser onNavigate={navigate} />;
  }

  return <Dashboard onNavigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}
