import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { CARD_CLASS_NAMES } from "../constants/cardClass";
import { CARD_FORMAT_NAMES } from "../constants/cardFormat";
import { CARD_KEYWORD_NAMES } from "../constants/cardKeyword";
import { CARD_RARITY_NAMES } from "../constants/cardRarity";
import { CARD_TALENT_NAMES } from "../constants/cardTalent";
import { CARD_TYPE_NAMES } from "../constants/cardType";
import { cardTypeName } from "../constants/cardType";
import {
  countActiveAdvancedFilters,
  EMPTY_CATALOG_ADVANCED_FILTERS,
  filterCatalogCard,
} from "../utils/cardCatalogFilter";
import { cardImageUrl, formatCollectorCode } from "../utils/cardPrintings";

const MD_MIN = 768;
const TABLE_PAGE_SIZE = 25;
const PREVIEW_WIDTH = 320;
/** Gap from cursor to preview’s left edge — keeps the card clearly to the right of the pointer. */
const PREVIEW_GAP_X = 36;
/** Small downward nudge so the preview isn’t glued to the cursor; vertical follow stays gentle. */
const PREVIEW_GAP_Y = 10;

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

/** Mobile: 2 / 3 / 4 cols — md+: 5 / 6 / 7 */
function gridColsClass(view) {
  if (view === "grid-sm") return "grid-cols-2 md:grid-cols-5";
  if (view === "grid-md") return "grid-cols-3 md:grid-cols-6";
  if (view === "grid-lg") return "grid-cols-4 md:grid-cols-7";
  return "";
}

/** FAB-style collector number: OMN001, OMN003 (3-digit card index). */
function FilterSlidersIcon() {
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
      <path d="M4 6h16" />
      <path d="M8 12h8" />
      <path d="M10 18h4" />
      <circle cx="7" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="11" cy="18" r="2" />
    </svg>
  );
}

function PitchDot({ pitch }) {
  if (pitch == null || pitch === undefined) return null;
  const p = Number(pitch);
  if (p !== 1 && p !== 2 && p !== 3) return null;
  const cls =
    p === 1
      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
      : p === 2
        ? "bg-amber-400 shadow-[0_0_8px_rgba(250,204,21,0.45)]"
        : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]";
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

function EyeViewDetailsIcon() {
  return (
    <svg
      className="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
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
 * @typedef {{
 *   id: number,
 *   name: string,
 *   set_code: string,
 *   set_num: number,
 *   set_name?: string,
 *   type: number,
 *   pitch: number | null,
 *   rarity?: number | null,
 *   classes?: number[],
 *   power?: number | null,
 *   block?: number | null,
 *   keywords?: number[],
 *   formats?: number[],
 *   talents?: number[],
 *   printings?: { set_code?: string, image_url?: string | null }[],
 *   card_identifier: string | null
 * }} CatalogCard
 */

/** @typedef {{ id: number, name: string, code: string }} CatalogSetOption
 */

/**
 * @param {{ clientX: number, clientY: number }} pos
 */
function clampPreviewPosition(pos) {
  const w = PREVIEW_WIDTH;
  const maxH = 440;
  const pad = 8;

  // Prefer the preview to the right of the cursor (not tucked under / bottom-right of viewport).
  let x = pos.clientX + PREVIEW_GAP_X;
  if (x + w > window.innerWidth - pad) {
    x = pos.clientX - w - PREVIEW_GAP_X;
  }
  if (x < pad) x = pad;

  // Start just below the cursor; if there isn’t room below, float above the cursor instead of pinning to the screen bottom.
  let y = pos.clientY + PREVIEW_GAP_Y;
  if (y + maxH > window.innerHeight - pad) {
    y = pos.clientY - maxH - PREVIEW_GAP_Y;
  }
  if (y < pad) y = pad;
  if (y + maxH > window.innerHeight - pad) {
    y = window.innerHeight - maxH - pad;
  }
  return { x, y };
}

/**
 * @param {{ isLight: boolean, active: boolean, onOpenCardDetail?: (identifier: string) => void }} props
 */
export function CardsCatalog({ isLight, active, onOpenCardDetail }) {
  const { user } = useAuth();
  const narrow = useMediaNarrow();
  /** @type {['table' | 'grid-sm' | 'grid-md' | 'grid-lg', (v: 'table' | 'grid-sm' | 'grid-md' | 'grid-lg') => void]} */
  const [view, setView] = useState("grid-sm");
  const [gridPage, setGridPage] = useState(1);
  const [tablePage, setTablePage] = useState(1);
  const [cards, setCards] = useState(/** @type {CatalogCard[]} */ ([]));
  const [sets, setSets] = useState(/** @type {CatalogSetOption[]} */ ([]));
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState(EMPTY_CATALOG_ADVANCED_FILTERS);
  const [draftAdvancedFilters, setDraftAdvancedFilters] = useState(EMPTY_CATALOG_ADVANCED_FILTERS);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [keywordToAdd, setKeywordToAdd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** @type {[{ url: string, x: number, y: number } | null, (v: { url: string, x: number, y: number } | null) => void]} */
  const [imagePreview, setImagePreview] = useState(null);
  /** @type {[{ url: string, name: string, card_identifier: string | null } | null, (v: { url: string, name: string, card_identifier: string | null } | null) => void]} */
  const [gridImageModal, setGridImageModal] = useState(null);

  const gridPageSizeVal = useMemo(() => gridPageSize(view, narrow), [view, narrow]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 150);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const filteredCards = useMemo(
    () =>
      cards.filter((c) =>
        filterCatalogCard(c, {
          query: debouncedSearchQuery,
          setCode: setFilter,
          advanced: advancedFilters,
        }),
      ),
    [cards, debouncedSearchQuery, setFilter, advancedFilters],
  );

  const activeAdvancedCount = useMemo(
    () => countActiveAdvancedFilters(advancedFilters),
    [advancedFilters],
  );

  const setOptions = useMemo(() => {
    const next = sets.filter(
      (s) => String(s?.name ?? "").trim().toLowerCase() !== "promos",
    );
    next.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return next;
  }, [sets]);

  const powerOptions = useMemo(() => {
    const values = new Set();
    for (const card of cards) {
      if (card.power != null) values.add(card.power);
    }
    return [...values].sort((a, b) => a - b);
  }, [cards]);

  const blockOptions = useMemo(() => {
    const values = new Set();
    for (const card of cards) {
      if (card.block != null) values.add(card.block);
    }
    return [...values].sort((a, b) => a - b);
  }, [cards]);

  const totalGridPages = useMemo(() => {
    if (view === "table" || gridPageSizeVal <= 0 || !Number.isFinite(gridPageSizeVal)) return 1;
    return Math.max(1, Math.ceil(filteredCards.length / gridPageSizeVal));
  }, [view, gridPageSizeVal, filteredCards.length]);

  const totalTablePages = useMemo(
    () => Math.max(1, Math.ceil(filteredCards.length / TABLE_PAGE_SIZE)),
    [filteredCards.length],
  );

  useEffect(() => {
    setGridPage(1);
    setTablePage(1);
  }, [debouncedSearchQuery, setFilter, advancedFilters]);

  useEffect(() => {
    setGridPage(1);
  }, [view, narrow]);

  useEffect(() => {
    if (view === "table") setTablePage(1);
  }, [view]);

  useEffect(() => {
    if (tablePage > totalTablePages) setTablePage(totalTablePages);
  }, [tablePage, totalTablePages]);

  useEffect(() => {
    if (gridPage > totalGridPages) setGridPage(totalGridPages);
  }, [gridPage, totalGridPages]);

  useEffect(() => {
    if (view === "table") setGridImageModal(null);
  }, [view]);

  useEffect(() => {
    if (!active) setGridImageModal(null);
  }, [active]);

  useEffect(() => {
    if (!filterModalOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setFilterModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [filterModalOpen]);

  useEffect(() => {
    if (!gridImageModal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setGridImageModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [gridImageModal]);

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
      const setsRes = await fetch("/api/sets", { headers });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t?.trim() || res.statusText || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCards(Array.isArray(data) ? data : []);
      if (setsRes.ok) {
        const setsData = await setsRes.json();
        const list = Array.isArray(setsData) ? setsData : [];
        /** @type {CatalogSetOption[]} */
        const next = [];
        for (const s of list) {
          if (!s || typeof s.id !== "number") continue;
          next.push({
            id: s.id,
            name: String(s.name ?? "").trim() || `Set ${s.id}`,
            code: String(s.code ?? "").trim(),
          });
        }
        setSets(next);
      }
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
    if (view === "table" || !Number.isFinite(gridPageSizeVal)) return filteredCards;
    const start = (gridPage - 1) * gridPageSizeVal;
    return filteredCards.slice(start, start + gridPageSizeVal);
  }, [filteredCards, view, gridPage, gridPageSizeVal]);

  const pagedTable = useMemo(() => {
    if (view !== "table") return [];
    const start = (tablePage - 1) * TABLE_PAGE_SIZE;
    return filteredCards.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredCards, view, tablePage]);

  const gridColClass = gridColsClass(view);

  const iconBtn =
    "inline-flex size-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55 disabled:opacity-40";
  const iconIdle = isLight
    ? "border-white/20 bg-black/25 text-[#f4f0fa]/85 hover:border-white/35 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa]/88 hover:border-white/40 hover:bg-black/30";
  const iconActive = isLight
    ? "border-[#b998e8]/55 bg-[#7b4cb8]/35 text-white shadow-inner"
    : "border-purple-400/45 bg-purple-950/50 text-white";

  const paginatorBtn = `rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium ${iconIdle} ${
    isLight ? "border-white/25" : "border-white/[0.28]"
  } disabled:opacity-40`;

  const tableChromeBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/[0.12]" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.06]" : "border-white/[0.12]";
  const gridThumbBorder = isLight ? "border-white/[0.1]" : "border-white/[0.20]";
  const gridCardLift =
    "relative z-0 transition-[transform,box-shadow] duration-200 ease-out will-change-transform " +
    (isLight
      ? "shadow-sm shadow-black/15 hover:z-10 hover:-translate-y-2 hover:shadow-[0_14px_32px_-8px_rgba(0,0,0,0.22)] focus-visible:z-10 focus-visible:-translate-y-2 focus-visible:shadow-[0_14px_32px_-8px_rgba(0,0,0,0.22)]"
      : "shadow-none hover:z-10 hover:-translate-y-2 hover:shadow-[0_18px_44px_-10px_rgba(0,0,0,0.72)] focus-visible:z-10 focus-visible:-translate-y-2 focus-visible:shadow-[0_18px_44px_-10px_rgba(0,0,0,0.72)]");

  const fieldCls = isLight
    ? "min-w-0 rounded-lg border border-white/[0.24] bg-black/25 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/45 focus:border-purple-400/55"
    : "min-w-0 rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55";

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    debouncedSearchQuery.trim() !== "" ||
    setFilter !== "" ||
    activeAdvancedCount > 0;

  const openFilterModal = () => {
    setDraftAdvancedFilters(advancedFilters);
    setKeywordToAdd("");
    setFilterModalOpen(true);
  };

  const applyAdvancedFilters = () => {
    setAdvancedFilters(draftAdvancedFilters);
    setFilterModalOpen(false);
  };

  const clearAdvancedDraft = () => {
    setDraftAdvancedFilters(EMPTY_CATALOG_ADVANCED_FILTERS);
    setKeywordToAdd("");
  };

  const addDraftKeyword = (id) => {
    const idStr = String(id);
    setDraftAdvancedFilters((filters) => {
      const selected = Array.isArray(filters.keywords) ? filters.keywords : [];
      if (selected.includes(idStr)) return filters;
      return { ...filters, keywords: [...selected, idStr] };
    });
  };

  const removeDraftKeyword = (id) => {
    const idStr = String(id);
    setDraftAdvancedFilters((filters) => {
      const selected = Array.isArray(filters.keywords) ? filters.keywords : [];
      if (!selected.includes(idStr)) return filters;
      return { ...filters, keywords: selected.filter((k) => k !== idStr) };
    });
  };

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

      {!loading && !error ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search cards</span>
              <input
                type="search"
                className={`${fieldCls} w-full pr-9`}
                placeholder="Search name, class, talent…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <label className="flex min-w-[10rem] flex-1 items-center gap-2 sm:flex-none">
                <span className="sr-only">Filter by set</span>
                <select
                  className={`${fieldCls} w-full sm:min-w-[12rem]`}
                  value={setFilter}
                  onChange={(e) => setSetFilter(e.target.value)}
                >
                  <option value="">All sets</option>
                  {setOptions.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[0.875rem] font-medium ${iconIdle}`}
                onClick={openFilterModal}
                aria-haspopup="dialog"
              >
                <FilterSlidersIcon />
                <span>Filters</span>
                {activeAdvancedCount > 0 ? (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-purple-500/80 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-white">
                    {activeAdvancedCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
          <p className="m-0 text-[0.8125rem] text-[#f4f0fa]/60">
            {hasActiveFilters
              ? `Showing ${filteredCards.length.toLocaleString()} of ${cards.length.toLocaleString()} cards`
              : `${cards.length.toLocaleString()} cards`}
          </p>
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Could not load cards</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button type="button" className={`mt-3 ${paginatorBtn}`} onClick={load}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/60">Loading…</p>
      ) : null}

      {!loading && view === "table" && !error ? (
        <>
          <div className={`overflow-x-auto rounded-xl border bg-black/20 ${tableChromeBorder}`}>
            <table className="w-full min-w-[36rem] border-collapse text-left text-[0.875rem] text-[#f4f0fa]">
              <thead>
                <tr className={`border-b bg-black/30 ${tableHeadBorder}`}>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="min-w-[10rem] px-4 py-3 font-semibold">Set</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody>
                {pagedTable.map((c) => {
                  const imgUrl = cardImageUrl(c);
                  return (
                  <tr
                    key={c.id}
                    className={`cursor-default border-b transition-colors hover:bg-white/[0.04] ${tableRowBorder}`}
                  >
                    <td
                      className="relative max-w-[min(28rem,50vw)] px-4 py-2.5 font-medium"
                      onMouseEnter={(e) => {
                        if (!imgUrl) return;
                        setImagePreview({
                          url: imgUrl,
                          ...clampPreviewPosition(e),
                        });
                      }}
                      onMouseMove={(e) => {
                        if (!imgUrl) return;
                        setImagePreview({
                          url: imgUrl,
                          ...clampPreviewPosition(e),
                        });
                      }}
                      onMouseLeave={() => setImagePreview(null)}
                    >
                      <div className="flex max-w-full items-center justify-start gap-1.5">
                        <span className="min-w-0 max-w-[calc(100%-1.75rem)] break-words line-clamp-2">
                          {c.card_identifier && onOpenCardDetail ? (
                            <a
                              href={`/resources/cards/${encodeURIComponent(c.card_identifier)}`}
                              className="font-medium text-[#c4a9ef] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55"
                              onClick={(e) => {
                                e.preventDefault();
                                onOpenCardDetail(c.card_identifier);
                              }}
                            >
                              {c.name}
                            </a>
                          ) : (
                            <span className="font-medium">{c.name}</span>
                          )}
                        </span>
                        <span className="shrink-0">
                          <PitchDot pitch={c.pitch} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[#f4f0fa]/90">
                      {c.set_name?.trim() ? c.set_name : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.8125rem] text-[#f4f0fa]/85">
                      {formatCollectorCode(c.set_code, c.set_num)}
                    </td>
                    <td className="px-4 py-2.5 text-[#f4f0fa]/85">
                      {cardTypeName(c.type) ?? c.type}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredCards.length === 0 ? (
              <p className="px-4 py-8 text-center text-[#f4f0fa]/55">
                {cards.length === 0 ? "No cards in the database." : "No cards match your filters."}
              </p>
            ) : null}
          </div>
          {filteredCards.length > TABLE_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                className={paginatorBtn}
                disabled={tablePage <= 1}
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="text-[0.8125rem] text-[#f4f0fa]/70">
                Page {tablePage} / {totalTablePages}
              </span>
              <button
                type="button"
                className={paginatorBtn}
                disabled={tablePage >= totalTablePages}
                onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && view !== "table" && !error ? (
        <>
          <div className={`grid gap-2 ${gridColClass} sm:gap-2 md:gap-3`}>
            {pagedGrid.map((c) => {
              const imgUrl = cardImageUrl(c);
              return (
              <div key={c.id} className="min-w-0 overflow-visible px-0.5 pb-1 pt-0.5">
                {imgUrl ? (
                  <button
                    type="button"
                    className={`flex aspect-[63/88] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-black/30 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55 ${gridThumbBorder} ${gridCardLift}`}
                    aria-label={`Open full image: ${c.name}`}
                    onClick={() =>
                      setGridImageModal({
                        url: imgUrl,
                        name: c.name ?? "",
                        card_identifier: c.card_identifier ?? null,
                      })
                    }
                  >
                    <img
                      src={imgUrl}
                      alt=""
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  </button>
                ) : (
                  <div
                    className={`flex aspect-[63/88] items-center justify-center overflow-hidden rounded-lg border bg-black/30 ${gridThumbBorder}`}
                  >
                    <span className="px-1 text-center text-[0.65rem] leading-tight text-[#f4f0fa]/45">
                      {c.name}
                    </span>
                  </div>
                )}
              </div>
              );
            })}
          </div>
          {filteredCards.length === 0 ? (
            <p className="text-center text-[#f4f0fa]/55">
              {cards.length === 0 ? "No cards in the database." : "No cards match your filters."}
            </p>
          ) : null}
          {filteredCards.length > 0 && totalGridPages > 1 ? (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                className={paginatorBtn}
                disabled={gridPage <= 1}
                onClick={() => setGridPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="text-[0.8125rem] text-[#f4f0fa]/70">
                Page {gridPage} / {totalGridPages}
              </span>
              <button
                type="button"
                className={paginatorBtn}
                disabled={gridPage >= totalGridPages}
                onClick={() => setGridPage((p) => Math.min(totalGridPages, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {imagePreview && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`pointer-events-none fixed z-[10000] overflow-hidden rounded-lg border bg-[#1a1524] shadow-2xl ${
                isLight ? "border-white/25" : "border-white/[0.35]"
              }`}
              style={{
                left: imagePreview.x,
                top: imagePreview.y,
                width: PREVIEW_WIDTH,
                maxWidth: "min(320px, calc(100vw - 16px))",
              }}
            >
              <img src={imagePreview.url} alt="" className="h-auto w-full object-contain" draggable={false} />
            </div>,
            document.body,
          )
        : null}

      {gridImageModal && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[10001] flex cursor-default items-center justify-center bg-black/80 p-3 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label={gridImageModal.name ? `Card: ${gridImageModal.name}` : "Card image"}
              onClick={() => setGridImageModal(null)}
            >
              <div className="flex h-[85vh] w-full max-w-[min(100%,96vw)] flex-col items-center justify-center gap-4">
                <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                  <img
                    src={gridImageModal.url}
                    alt={gridImageModal.name || "Card"}
                    className="max-h-full max-w-full object-contain select-none"
                    draggable={false}
                  />
                </div>
                {gridImageModal.card_identifier && onOpenCardDetail ? (
                  <div className="flex shrink-0 justify-center" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`/resources/cards/${encodeURIComponent(gridImageModal.card_identifier)}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.28] bg-black/40 px-4 py-2.5 text-[0.875rem] font-medium text-[#c4a9ef] shadow-lg transition-colors hover:border-[#c4a9ef]/45 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55"
                      aria-label="Open the card details page"
                      title="Go to the full card details page"
                      onClick={(e) => {
                        e.preventDefault();
                        const id = gridImageModal.card_identifier;
                        setGridImageModal(null);
                        onOpenCardDetail(id);
                      }}
                    >
                      <EyeViewDetailsIcon />
                      View Card Details
                    </a>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {filterModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-6"
              role="presentation"
              onClick={() => setFilterModalOpen(false)}
            >
              <div
                className={`flex max-h-[min(92vh,44rem)] w-full max-w-lg flex-col rounded-xl border bg-[#1a1524] p-4 shadow-2xl sm:p-5 ${
                  isLight ? "border-white/20" : "border-white/[0.28]"
                }`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="catalog-filter-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
                  <div>
                    <h3 id="catalog-filter-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                      Filter cards
                    </h3>
                    <p className="mt-1 text-[0.8125rem] text-[#f4f0fa]/60">
                      Narrow results by stats, keywords, format, talent, and more.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`${iconBtn} ${iconIdle} size-9 shrink-0`}
                    aria-label="Close filters"
                    onClick={() => setFilterModalOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                      Type
                    </span>
                    <select
                      className={fieldCls}
                      value={draftAdvancedFilters.type}
                      onChange={(e) =>
                        setDraftAdvancedFilters((f) => ({ ...f, type: e.target.value }))
                      }
                    >
                      <option value="">Any type</option>
                      {CARD_TYPE_NAMES.map((name, id) => (
                        <option key={id} value={String(id)}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                        Format
                      </span>
                      <select
                        className={fieldCls}
                        value={draftAdvancedFilters.format ?? ""}
                        onChange={(e) =>
                          setDraftAdvancedFilters((f) => ({ ...f, format: e.target.value }))
                        }
                      >
                        <option value="">Any format</option>
                        {CARD_FORMAT_NAMES.map((name, id) => (
                          <option key={id} value={String(id)}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                        Rarity
                      </span>
                      <select
                        className={fieldCls}
                        value={draftAdvancedFilters.rarity}
                        onChange={(e) =>
                          setDraftAdvancedFilters((f) => ({ ...f, rarity: e.target.value }))
                        }
                      >
                        <option value="">Any rarity</option>
                        {CARD_RARITY_NAMES.map((name, id) => (
                          <option key={id} value={String(id)}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                        Class
                      </span>
                      <select
                        className={fieldCls}
                        value={draftAdvancedFilters.cardClass}
                        onChange={(e) =>
                          setDraftAdvancedFilters((f) => ({ ...f, cardClass: e.target.value }))
                        }
                      >
                        <option value="">Any class</option>
                        {CARD_CLASS_NAMES.map((name, id) => (
                          <option key={id} value={String(id)}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                        Talent
                      </span>
                      <select
                        className={fieldCls}
                        value={draftAdvancedFilters.talent ?? ""}
                        onChange={(e) =>
                          setDraftAdvancedFilters((f) => ({ ...f, talent: e.target.value }))
                        }
                      >
                        <option value="">Any talent</option>
                        {CARD_TALENT_NAMES.map((name, id) => (
                          <option key={id} value={String(id)}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                      Pitch
                    </span>
                    <select
                      className={fieldCls}
                      value={draftAdvancedFilters.pitch}
                      onChange={(e) =>
                        setDraftAdvancedFilters((f) => ({ ...f, pitch: e.target.value }))
                      }
                    >
                      <option value="">Any pitch</option>
                      <option value="1">Red (1)</option>
                      <option value="2">Yellow (2)</option>
                      <option value="3">Blue (3)</option>
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                        Power
                      </span>
                      <select
                        className={fieldCls}
                        value={draftAdvancedFilters.power ?? ""}
                        onChange={(e) =>
                          setDraftAdvancedFilters((f) => ({ ...f, power: e.target.value }))
                        }
                      >
                        <option value="">Any power</option>
                        {powerOptions.map((value) => (
                          <option key={value} value={String(value)}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                        Block
                      </span>
                      <select
                        className={fieldCls}
                        value={draftAdvancedFilters.block ?? ""}
                        onChange={(e) =>
                          setDraftAdvancedFilters((f) => ({ ...f, block: e.target.value }))
                        }
                      >
                        <option value="">Any block</option>
                        {blockOptions.map((value) => (
                          <option key={value} value={String(value)}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                    <legend className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/70">
                      Keywords
                    </legend>
                    <select
                      className={fieldCls}
                      value={keywordToAdd}
                      onChange={(e) => {
                        const v = e.target.value;
                        setKeywordToAdd("");
                        if (v) addDraftKeyword(v);
                      }}
                    >
                      <option value="">Add a keyword…</option>
                      {CARD_KEYWORD_NAMES.map((name, id) => {
                        const selected = Array.isArray(draftAdvancedFilters.keywords)
                          ? draftAdvancedFilters.keywords.includes(String(id))
                          : false;
                        if (selected) return null;
                        return (
                          <option key={id} value={String(id)}>
                            {name}
                          </option>
                        );
                      })}
                    </select>

                    {Array.isArray(draftAdvancedFilters.keywords) &&
                    draftAdvancedFilters.keywords.length > 0 ? (
                      <>
                        <div className="flex flex-wrap gap-2 rounded-lg border border-white/[0.16] bg-black/20 p-2">
                          {draftAdvancedFilters.keywords.map((raw) => {
                            const id = Number(raw);
                            const label = CARD_KEYWORD_NAMES[id] ?? `Keyword ${raw}`;
                            return (
                              <span
                                key={raw}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.18] bg-white/[0.06] px-2 py-1 text-[0.8125rem] text-[#f4f0fa]/90"
                              >
                                <span className="truncate">{label}</span>
                                <button
                                  type="button"
                                  className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full text-[#f4f0fa]/70 hover:bg-white/[0.10] hover:text-[#f4f0fa]"
                                  aria-label={`Remove keyword ${label}`}
                                  onClick={() => removeDraftKeyword(raw)}
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                        <p className="m-0 text-[0.75rem] text-[#f4f0fa]/55">
                          {draftAdvancedFilters.keywords.length} selected — cards must have all selected keywords.
                        </p>
                      </>
                    ) : null}
                  </fieldset>
                  </div>
                </div>

                <div className="mt-5 flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button type="button" className={paginatorBtn} onClick={clearAdvancedDraft}>
                    Clear
                  </button>
                  <button type="button" className={paginatorBtn} onClick={() => setFilterModalOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/[0.28] bg-violet-600/90 px-4 py-2 text-[0.875rem] font-semibold text-white hover:bg-violet-600"
                    onClick={applyAdvancedFilters}
                  >
                    Apply filters
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
