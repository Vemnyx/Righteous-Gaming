import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { cardTypeName } from "../constants/cardType";

const MD_MIN = 768;

/** @returns {boolean} */
function useMediaNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < MD_MIN
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MD_MIN - 1}px)`);
    const fn = () => setNarrow(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return narrow;
}

/**
 * Desktop: 5×10, 6×10, 7×10 — mobile: 2×10, 3×10, 4×10
 */
function gridPageSize(view, narrow) {
  const rows = 10;
  if (view === "grid-sm")
    return narrow ? 2 * rows : 5 * rows;
  if (view === "grid-md")
    return narrow ? 3 * rows : 6 * rows;
  if (view === "grid-lg")
    return narrow ? 4 * rows : 7 * rows;
  return Infinity;
}

/** Mobile: 2 / 3 / 4 cols — md+: 5 / 6 / 7 (matches page sizes 2×10 … 7×10) */
function gridColsClass(view) {
  if (view === "grid-sm") return "grid-cols-2 md:grid-cols-5";
  if (view === "grid-md") return "grid-cols-3 md:grid-cols-6";
  if (view === "grid-lg") return "grid-cols-4 md:grid-cols-7";
  return "";
}

function PitchDot({ pitch }) {
  if (pitch == null || pitch === undefined)
    return (
      <span className="text-[#f4f0fa]/35" aria-hidden>
        —
      </span>
    );
  const p = Number(pitch);
  const cls =
    p === 1
      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
      : p === 2
        ? "bg-amber-400 shadow-[0_0_8px_rgba(250,204,21,0.45)]"
        : p === 3
          ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
          : "bg-white/35";
  return (
    <span
      className={`inline-block size-3.5 shrink-0 rounded-full ${cls}`}
      title={`Pitch ${p}`}
      aria-label={`Pitch ${p}`}
    />
  );
}

function TableIcon() {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

function GridDensityIcon({ level }) {
  const n = level === "sm" ? 2 : level === "md" ? 3 : 4;
  const cells = [];
  for (let i = 0; i < n * n; i++) cells.push(i);
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
      {cells.map((i) => {
        const col = i % n;
        const row = Math.floor(i / n);
        const pad = 3;
        const w = (24 - pad * 2) / n;
        const x = pad + col * w;
        const y = pad + row * w;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w - 1}
            height={w - 1}
            rx="1"
            className="fill-current"
          />
        );
      })}
    </svg>
  );
}

/**
 * @typedef {{ id: number, name: string, set_code: string, set_num: number, type: number, pitch: number | null, image_url: string | null }} CatalogCard
 */

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CardsCatalog({ isLight, active }) {
  const { user } = useAuth();
  const narrow = useMediaNarrow();
  /** @type {['table' | 'grid-sm' | 'grid-md' | 'grid-lg', (v: 'table' | 'grid-sm' | 'grid-md' | 'grid-lg') => void]} */
  const [view, setView] = useState("table");
  const [page, setPage] = useState(1);
  const [cards, setCards] = useState(/** @type {CatalogCard[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** @type {[{ url: string, left: number, top: number } | null, (v: { url: string, left: number, top: number } | null) => void]} */
  const [imagePreview, setImagePreview] = useState(null);

  const pageSize = useMemo(() => gridPageSize(view, narrow), [view, narrow]);
  const totalGridPages = useMemo(() => {
    if (view === "table" || pageSize <= 0 || !Number.isFinite(pageSize)) return 1;
    return Math.max(1, Math.ceil(cards.length / pageSize));
  }, [view, pageSize, cards.length]);

  useEffect(() => {
    setPage(1);
  }, [view, narrow]);

  useEffect(() => {
    if (page > totalGridPages) setPage(totalGridPages);
  }, [page, totalGridPages]);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const headers = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/cards", { headers });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t?.trim() || res.statusText || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCards(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [active, user]);

  useEffect(() => {
    if (!active) return undefined;
    load();
    return undefined;
  }, [active, load]);

  const pagedGrid = useMemo(() => {
    if (view === "table" || !Number.isFinite(pageSize)) return cards;
    const start = (page - 1) * pageSize;
    return cards.slice(start, start + pageSize);
  }, [cards, view, page, pageSize]);

  const gridColClass = gridColsClass(view);

  const iconBtn =
    "inline-flex size-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55 disabled:opacity-40";
  const iconIdle = isLight
    ? "border-white/20 bg-black/25 text-[#f4f0fa]/85 hover:border-white/35 hover:bg-black/35"
    : "border-white/15 bg-black/20 text-[#f4f0fa]/88 hover:border-white/30 hover:bg-black/30";
  const iconActive = isLight
    ? "border-[#b998e8]/55 bg-[#7b4cb8]/35 text-white shadow-inner"
    : "border-purple-400/45 bg-purple-950/50 text-white";

  return (
    <div className="relative flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Cards</h2>
        <div className="flex items-center gap-1.5 self-end sm:self-auto" role="toolbar" aria-label="View layout">
          <button
            type="button"
            className={`${iconBtn} ${view === "table" ? iconActive : iconIdle}`}
            aria-pressed={view === "table"}
            title="Table"
            onClick={() => setView("table")}
          >
            <span className="sr-only">Table view</span>
            <TableIcon />
          </button>
          <button
            type="button"
            className={`${iconBtn} ${view === "grid-sm" ? iconActive : iconIdle}`}
            aria-pressed={view === "grid-sm"}
            title={narrow ? "Grid 2×10" : "Grid 5×10"}
            onClick={() => setView("grid-sm")}
          >
            <span className="sr-only">Grid compact</span>
            <GridDensityIcon level="sm" />
          </button>
          <button
            type="button"
            className={`${iconBtn} ${view === "grid-md" ? iconActive : iconIdle}`}
            aria-pressed={view === "grid-md"}
            title={narrow ? "Grid 3×10" : "Grid 6×10"}
            onClick={() => setView("grid-md")}
          >
            <span className="sr-only">Grid medium</span>
            <GridDensityIcon level="md" />
          </button>
          <button
            type="button"
            className={`${iconBtn} ${view === "grid-lg" ? iconActive : iconIdle}`}
            aria-pressed={view === "grid-lg"}
            title={narrow ? "Grid 4×10" : "Grid 7×10"}
            onClick={() => setView("grid-lg")}
          >
            <span className="sr-only">Grid large</span>
            <GridDensityIcon level="lg" />
          </button>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Could not load cards</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button
            type="button"
            className={`mt-3 rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium ${iconIdle} border-white/25`}
            onClick={load}
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/60">Loading…</p>
      ) : null}

      {!loading && view === "table" && !error ? (
        <div className="overflow-x-auto rounded-xl border border-white/[0.12] bg-black/20">
          <table className="w-full min-w-[28rem] border-collapse text-left text-[0.875rem] text-[#f4f0fa]">
            <thead>
              <tr className="border-b border-white/[0.12] bg-black/30">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Set</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Pitch</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-default border-b border-white/[0.06] transition-colors hover:bg-white/[0.04]"
                >
                  <td
                    className="relative max-w-[min(28rem,50vw)] px-4 py-2.5 font-medium"
                    onMouseEnter={(e) => {
                      if (!c.image_url) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const w = 200;
                      let left = r.right + 12;
                      if (left + w > window.innerWidth - 8) left = r.left - w - 12;
                      setImagePreview({
                        url: c.image_url,
                        left: Math.max(8, left),
                        top: Math.max(8, Math.min(r.top, window.innerHeight - 360)),
                      });
                    }}
                    onMouseLeave={() => setImagePreview(null)}
                  >
                    <span className="line-clamp-2">{c.name}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[#f4f0fa]/90">
                    {c.set_code} {c.set_num}
                  </td>
                  <td className="px-4 py-2.5 text-[#f4f0fa]/85">{cardTypeName(c.type) ?? c.type}</td>
                  <td className="px-4 py-2.5">
                    <PitchDot pitch={c.pitch} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cards.length === 0 ? (
            <p className="px-4 py-8 text-center text-[#f4f0fa]/55">No cards in the database.</p>
          ) : null}
        </div>
      ) : null}

      {!loading && view !== "table" && !error ? (
        <>
          <div className={`grid gap-2 ${gridColClass} sm:gap-2 md:gap-3`}>
            {pagedGrid.map((c) => (
              <div
                key={c.id}
                className="flex aspect-[63/88] items-center justify-center overflow-hidden rounded-lg border border-white/[0.1] bg-black/30"
              >
                {c.image_url ? (
                  <img
                    src={c.image_url}
                    alt=""
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <span className="px-1 text-center text-[0.65rem] leading-tight text-[#f4f0fa]/45">
                    {c.name}
                  </span>
                )}
              </div>
            ))}
          </div>
          {cards.length === 0 ? (
            <p className="text-center text-[#f4f0fa]/55">No cards in the database.</p>
          ) : null}
          {cards.length > 0 && totalGridPages > 1 ? (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium ${iconIdle} border-white/25 disabled:opacity-40`}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="text-[0.8125rem] text-[#f4f0fa]/70">
                Page {page} / {totalGridPages}
              </span>
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium ${iconIdle} border-white/25 disabled:opacity-40`}
                disabled={page >= totalGridPages}
                onClick={() => setPage((p) => Math.min(totalGridPages, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {imagePreview ? (
        <div
          className="pointer-events-none fixed z-[200] w-[200px] max-w-[min(200px,calc(100vw-24px))] overflow-hidden rounded-lg border border-white/25 bg-[#1a1524] shadow-2xl"
          style={{ left: imagePreview.left, top: imagePreview.top }}
        >
          <img src={imagePreview.url} alt="" className="h-auto w-full object-contain" />
        </div>
      ) : null}
    </div>
  );
}
