import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

/**
 * Resolves `/resources/card-rater`: if there is an active session, calls `onActiveSession`
 * so the parent can show the ranker at this URL. Otherwise calls `onLatestCompletedSession`
 * with the most recently completed session (latest `completed_at`, then highest `id`).
 *
 * @param {{ active: boolean, onActiveSession: () => void, onLatestCompletedSession: (id: number) => void }} props
 */
export function CardRaterRedirect({ active, onActiveSession, onLatestCompletedSession }) {
  const { user } = useAuth();
  const [msg, setMsg] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/card-raters", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const list = Array.isArray(data.raters) ? data.raters : [];
        /** @type {{ id: number, completed_at?: string | null }[]} */
        const raters = [];
        for (const r of list) {
          if (r && typeof r.id === "number") {
            raters.push({
              id: r.id,
              completed_at: r.completed_at != null ? String(r.completed_at) : null,
            });
          }
        }
        const activeRow = raters.find((r) => r.completed_at == null || r.completed_at === "");
        if (activeRow) {
          if (!cancelled) onActiveSession();
          return;
        }
        const completed = raters.filter((r) => r.completed_at != null && r.completed_at !== "");
        completed.sort((a, b) => {
          const ta = new Date(a.completed_at).getTime();
          const tb = new Date(b.completed_at).getTime();
          if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
          return b.id - a.id;
        });
        if (completed.length > 0) {
          if (!cancelled) onLatestCompletedSession(completed[0].id);
          return;
        }
        if (!cancelled) {
          setMsg("No card rater sessions yet. Create one from Admin → Card Rater.");
        }
      } catch (e) {
        if (!cancelled) setMsg(e instanceof Error ? e.message : "Failed to load sessions");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, onActiveSession, onLatestCompletedSession]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      {msg ? (
        <p className="m-0 max-w-md text-[0.9rem] text-[#f4f0fa]/80">{msg}</p>
      ) : (
        <p className="m-0 text-[0.9rem] text-[#f4f0fa]/65">Resolving card rater…</p>
      )}
    </div>
  );
}
