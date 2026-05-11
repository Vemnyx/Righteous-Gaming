import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

/**
 * Resolves `/resources/card-rater` to a concrete session: active session if any, otherwise
 * the most recently completed session.
 *
 * @param {{ isLight: boolean, active: boolean, onResolvedTarget: (id: number) => void }} props
 */
export function CardRaterRedirect({ active, onResolvedTarget }) {
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
          if (!cancelled) onResolvedTarget(activeRow.id);
          return;
        }
        let best = /** @type {{ id: number, completed_at: string } | null} */ (null);
        let bestTs = -1;
        for (const r of raters) {
          if (r.completed_at == null || r.completed_at === "") continue;
          const t = new Date(r.completed_at).getTime();
          if (Number.isFinite(t) && t >= bestTs) {
            bestTs = t;
            best = { id: r.id, completed_at: r.completed_at };
          }
        }
        if (best) {
          if (!cancelled) onResolvedTarget(best.id);
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
  }, [active, user, onResolvedTarget]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      {msg ? (
        <p className="m-0 max-w-md text-[0.9rem] text-[#f4f0fa]/80">{msg}</p>
      ) : (
        <p className="m-0 text-[0.9rem] text-[#f4f0fa]/65">Opening the latest results…</p>
      )}
    </div>
  );
}
