import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../constants/roles";

const PAGE_SIZE = 15;

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/**
 * @param {string | undefined | null} errText
 * @returns {string}
 */
function parseApiError(errText) {
  const raw = (errText ?? "").trim();
  if (raw === "") return "Request failed";
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.message === "string" && j.message.trim() !== "") return j.message.trim();
  } catch {
    /* use raw */
  }
  return raw;
}

/**
 * @param {{ isLight: boolean, active: boolean, onCreateUser?: () => void }} props
 */
export function UsersAdminTable({ isLight, active, onCreateUser }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /** @type {[null | { id: number, email: string, first_name?: string | null, last_name?: string | null, username?: string | null }, Function]} */
  const [editingUser, setEditingUser] = useState(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editDiscordName, setEditDiscordName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(/** @type {string | null} */ (null));
  const [editDiscordError, setEditDiscordError] = useState(/** @type {string | null} */ (null));
  const editTitleId = useId();

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

  useEffect(() => {
    if (!editingUser) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !editSaving) setEditingUser(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingUser, editSaving]);

  const openEdit = (row) => {
    setEditingUser(row);
    setEditFirstName(row.first_name != null ? String(row.first_name) : "");
    setEditLastName(row.last_name != null ? String(row.last_name) : "");
    setEditDiscordName(row.username != null ? String(row.username) : "");
    setEditError(null);
    setEditDiscordError(null);
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditingUser(null);
    setEditError(null);
    setEditDiscordError(null);
  };

  const saveEdit = async () => {
    if (!user || !editingUser || editSaving) return;
    setEditError(null);
    setEditDiscordError(null);
    setEditSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: editDiscordName.trim(),
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t?.trim() || res.statusText || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setRows((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? {
                ...r,
                username: updated.username ?? null,
                first_name: updated.first_name ?? null,
                last_name: updated.last_name ?? null,
              }
            : r
        )
      );
      setEditingUser(null);
    } catch (e) {
      const msg = e instanceof Error ? parseApiError(e.message) : "Failed to save profile";
      const lower = msg.toLowerCase();
      if (lower.includes("username") || lower.includes("discord")) {
        setEditDiscordError(msg);
      } else {
        setEditError(msg);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";

  const tableChromeBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  const createBtn =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55";

  const panel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";
  const inputCls =
    "w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55 disabled:opacity-60";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Users</h2>
        {onCreateUser ? (
          <button type="button" className={`shrink-0 self-start sm:self-auto ${createBtn}`} onClick={onCreateUser}>
            Create user
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

      <div className={`overflow-x-auto rounded-xl border bg-black/20 ${tableChromeBorder}`}>
        <table className="w-full min-w-[42rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">ID</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Email</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">First name</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Last name</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Discord name</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">UID</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Role</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Created At</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Registered At</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Password</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-[#f4f0fa]/55">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-[#f4f0fa]/55">
                  No users found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className={`cursor-pointer border-b last:border-0 hover:bg-white/[0.06] focus-visible:bg-white/[0.08] focus-visible:outline-none ${tableRowBorder}`}
                  onClick={() => openEdit(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEdit(row);
                    }
                  }}
                  title="Edit profile"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.75rem] sm:px-4">
                    {row.id}
                  </td>
                  <td className="max-w-[11rem] truncate px-3 py-2.5 sm:max-w-none sm:px-4">{row.email}</td>
                  <td className="max-w-[8rem] truncate px-3 py-2.5 text-[#f4f0fa]/80 sm:px-4">
                    {row.first_name ?? "—"}
                  </td>
                  <td className="max-w-[8rem] truncate px-3 py-2.5 text-[#f4f0fa]/80 sm:px-4">
                    {row.last_name ?? "—"}
                  </td>
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
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[0.75rem] text-[#f4f0fa]/75 sm:px-4">
                    {formatDateTime(row.registered_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[0.75rem] text-[#f4f0fa]/75 sm:px-4">
                    {row.default_password_changed ? "Updated" : "Temporary"}
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

      {editingUser
        ? createPortal(
            <div
              className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby={editTitleId}
              onClick={closeEdit}
            >
              <div
                className={`w-full max-w-md rounded-2xl p-5 sm:p-6 ${panel}`}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id={editTitleId} className="m-0 text-[1.05rem] font-semibold text-[#f4f0fa]">
                  Edit user profile
                </h3>
                <p className="mt-2 text-[0.85rem] text-[#f4f0fa]/70">
                  Update name fields for this account. Email cannot be changed here.
                </p>
                <div className="mt-4 flex flex-col gap-3.5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Email
                    </span>
                    <input type="email" className={inputCls} value={editingUser.email ?? ""} disabled readOnly />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      First name
                    </span>
                    <input
                      type="text"
                      className={inputCls}
                      value={editFirstName}
                      autoComplete="given-name"
                      disabled={editSaving}
                      onChange={(e) => setEditFirstName(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Last name
                    </span>
                    <input
                      type="text"
                      className={inputCls}
                      value={editLastName}
                      autoComplete="family-name"
                      disabled={editSaving}
                      onChange={(e) => setEditLastName(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Discord name
                    </span>
                    <input
                      type="text"
                      className={inputCls}
                      value={editDiscordName}
                      autoComplete="off"
                      disabled={editSaving}
                      onChange={(e) => {
                        setEditDiscordName(e.target.value);
                        setEditDiscordError(null);
                      }}
                    />
                    {editDiscordError ? (
                      <span className="text-[0.8rem] text-red-200/90">{editDiscordError}</span>
                    ) : null}
                  </label>
                </div>
                {editError ? <p className="mt-3 text-[0.85rem] text-red-200/90">{editError}</p> : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    disabled={editSaving}
                    onClick={closeEdit}
                  >
                    Cancel
                  </button>
                  <button type="button" className={btnPrimary} disabled={editSaving} onClick={() => void saveEdit()}>
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
