import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const PAGE_SIZE = 15;

function roleLabel(role) {
  if (role === 0) return "Admin";
  if (role === 1) return "Member";
  return String(role);
}

/**
 * @param {{ isLight: boolean, active: boolean, onInviteUser?: () => void }} props
 */
export function UsersAdminTable({ isLight, active, onInviteUser }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        const res = await fetch(`/api/admin/users?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t?.trim() || res.statusText || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setRows(Array.isArray(data.users) ? data.users : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, page, reloadSeq]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/20 bg-black/20 text-[#f4f0fa] hover:border-white/35 hover:bg-black/30";

  const inviteBtn =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Users</h2>
        {onInviteUser ? (
          <button type="button" className={`shrink-0 self-start sm:self-auto ${inviteBtn}`} onClick={onInviteUser}>
            Invite user
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Could not load users</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button
            type="button"
            className={`mt-3 ${btnBase} ${btnTheme}`}
            onClick={() => setReloadSeq((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/[0.12] bg-black/20">
        <table className="w-full min-w-[36rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className="border-b border-white/12 text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55">
              <th className="px-3 py-2.5 font-semibold sm:px-4">ID</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Email</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Username</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">UID</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Role</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#f4f0fa]/55">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#f4f0fa]/55">
                  No users found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/[0.08] last:border-0 hover:bg-white/[0.04]"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.75rem] sm:px-4">
                    {row.id}
                  </td>
                  <td className="max-w-[11rem] truncate px-3 py-2.5 sm:max-w-none sm:px-4">{row.email}</td>
                  <td className="max-w-[8rem] truncate px-3 py-2.5 text-[#f4f0fa]/80 sm:px-4">
                    {row.username ?? "—"}
                  </td>
                  <td
                    className="max-w-[10rem] truncate px-3 py-2.5 font-mono text-[0.72rem] text-[#f4f0fa]/75 sm:max-w-[14rem] sm:px-4"
                    title={row.uid}
                  >
                    {row.uid || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sm:px-4">{roleLabel(row.role)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[0.75rem] text-[#f4f0fa]/75 sm:px-4">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[0.8125rem] text-[#f4f0fa]/70">
        <span>
          Page {page} of {totalPages}
          <span className="text-[#f4f0fa]/50"> · </span>
          {total} user{total === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className={`${btnBase} ${btnTheme}`}
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className={`${btnBase} ${btnTheme}`}
            disabled={loading || page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
