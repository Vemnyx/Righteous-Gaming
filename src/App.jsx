import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CreateUser from "./pages/CreateUser";
import ChangePassword from "./pages/ChangePassword";
import { CompleteProfileModal } from "./components/CompleteProfileModal";
import { useCallback, useEffect, useState } from "react";

function splitPath(searchPath) {
  const qIdx = searchPath.indexOf("?");
  if (qIdx < 0) return { pathname: searchPath.startsWith("/") ? searchPath : `/${searchPath}`, search: "" };
  let pathname = searchPath.slice(0, qIdx);
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return { pathname, search: searchPath.slice(qIdx) };
}

function AppGate() {
  const { user, loading, configured, sessionProfile, sessionProfileLoading } = useAuth();
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
    return <Login />;
  }

  if (sessionProfileLoading && !sessionProfile) {
    return (
      <div className="bg-shell-light-fog flex min-h-screen items-center justify-center font-sans text-[#6b6080]">
        <p>Loading…</p>
      </div>
    );
  }

  if (sessionProfile && sessionProfile.default_password_changed === false) {
    return <ChangePassword />;
  }

  if (path === "/admin/create-user" || path === "/admin/invite-user") {
    return <CreateUser onNavigate={navigate} />;
  }

  return (
    <>
      <Dashboard onNavigate={navigate} />
      <CompleteProfileModal />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}
