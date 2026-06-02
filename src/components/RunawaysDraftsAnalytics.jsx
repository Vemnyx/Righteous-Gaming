import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { cardRarityName } from "../constants/cardRarity";
import { cardTypeName } from "../constants/cardType";

const RUNAWAYS_SOURCE_ID = 3;
const MAINBOARD_SIZE = 30;
const PICK_LIMIT = 12;
const PREVIEW_WIDTH = 320;
const PREVIEW_GAP_X = 36;
const PREVIEW_GAP_Y = 10;

/** @typedef {'distribution' | 'top-picks' | 'bottom-picks'} CategoryTab */

/** @param {unknown} v */
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} v @param {number} [digits] */
function fmtNum(v, digits = 1) {
  const n = numOrNull(v);
  if (n == null) return "—";
  return n.toFixed(digits);
}

/** @param {number} rate */
function fmtPct(rate) {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/** @param {string | undefined | null} errText */
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

/** @param {Record<string, unknown>} card */
function cardPickRate(card) {
  const pick = typeof card.pick_rate === "number" ? card.pick_rate : Number(card.pick_rate);
  return Number.isFinite(pick) ? pick : 0;
}

/** @param {Record<string, unknown>} card */
function cardTotalCopies(card) {
  return typeof card.total_copies === "number" ? card.total_copies : 0;
}

/** @param {Record<string, unknown>} card */
function cardRarityFilterKey(card) {
  if (card.rarity == null || card.rarity === "") return "none";
  return String(card.rarity);
}

/**
 * @param {unknown[]} cards
 * @param {boolean} desc
 */
function sortCardsByPick(cards, desc) {
  return [...cards].sort((a, b) => {
    const ca = /** @type {Record<string, unknown>} */ (a);
    const cb = /** @type {Record<string, unknown>} */ (b);
    const pickA = cardPickRate(ca);
    const pickB = cardPickRate(cb);
    if (pickA !== pickB) return desc ? pickB - pickA : pickA - pickB;
    const copiesA = cardTotalCopies(ca);
    const copiesB = cardTotalCopies(cb);
    if (copiesA !== copiesB) return desc ? copiesB - copiesA : copiesA - copiesB;
    return String(ca.name ?? "").localeCompare(String(cb.name ?? ""));
  });
}

/**
 * @param {{ clientX: number, clientY: number }} pos
 */
function clampPreviewPosition(pos) {
  const w = PREVIEW_WIDTH;
  const maxH = 440;
  const pad = 8;

  let x = pos.clientX + PREVIEW_GAP_X;
  if (x + w > window.innerWidth - pad) {
    x = pos.clientX - w - PREVIEW_GAP_X;
  }
  if (x < pad) x = pad;

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
 * @param {{ label: string, count: number, total: number, colorClass?: string }} props
 */
function BreakdownBar({ label, count, total, colorClass = "bg-violet-500/70" }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[0.78rem]">
        <span className="truncate text-[#f4f0fa]/82">{label}</span>
        <span className="shrink-0 tabular-nums text-[#f4f0fa]/55">
          {count} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/35">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

/**
 * @param {{ label: string, avgCount: number, total: number, colorClass?: string }} props
 */
function AvgBreakdownBar({ label, avgCount, total, colorClass = "bg-violet-500/70" }) {
  const pct = total > 0 ? (avgCount / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[0.78rem]">
        <span className="truncate text-[#f4f0fa]/82">{label}</span>
        <span className="shrink-0 tabular-nums text-[#f4f0fa]/55">
          {avgCount.toFixed(1)} / {total} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/35">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${Math.max(pct, avgCount > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * @param {{ title: string, value: string, hint?: string }} props
 */
function StatTile({ title, value, hint }) {
  return (
    <div className="rounded-xl border border-white/[0.12] bg-black/25 px-3 py-2.5">
      <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50">{title}</p>
      <p className="m-0 mt-1 text-[1.15rem] font-semibold tabular-nums text-[#f4f0fa]">{value}</p>
      {hint ? <p className="m-0 mt-0.5 text-[0.72rem] text-[#f4f0fa]/50">{hint}</p> : null}
    </div>
  );
}

/**
 * @param {{
 *   name: string,
 *   imageUrl: string,
 *   onPreview: (preview: { url: string, x: number, y: number } | null) => void,
 * }} props
 */
function CardNameWithPreview({ name, imageUrl, onPreview }) {
  const hasImage = imageUrl.trim() !== "";

  return (
    <span
      className={`truncate ${hasImage ? "cursor-default underline decoration-dotted decoration-[#f4f0fa]/35 underline-offset-2" : ""}`}
      onMouseEnter={(e) => {
        if (!hasImage) return;
        onPreview({ url: imageUrl, ...clampPreviewPosition(e) });
      }}
      onMouseMove={(e) => {
        if (!hasImage) return;
        onPreview({ url: imageUrl, ...clampPreviewPosition(e) });
      }}
      onMouseLeave={() => onPreview(null)}
    >
      {name}
    </span>
  );
}

/**
 * @param {{
 *   cards: unknown[],
 *   deckCount: number,
 *   title: string,
 *   isLight: boolean,
 *   onPreview: (preview: { url: string, x: number, y: number } | null) => void,
 *   filterRarity: string,
 *   onFilterRarityChange: (value: string) => void,
 *   rarityOptions: { value: string, label: string }[],
 *   selectCls: string,
 * }} props
 */
function CardPickTable({
  cards,
  deckCount,
  title,
  isLight,
  onPreview,
  filterRarity,
  onFilterRarityChange,
  rarityOptions,
  selectCls,
}) {
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  if (!cards.length) {
    return (
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">{title}</h3>
          <label className="flex flex-col gap-1">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50">Rarity</span>
            <select className={selectCls} value={filterRarity} onChange={(e) => onFilterRarityChange(e.target.value)}>
              <option value="">All rarities</option>
              {rarityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[0.82rem] text-[#f4f0fa]/55">No cards match the selected rarity.</p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">{title}</h3>
        <label className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50">Rarity</span>
          <select className={selectCls} value={filterRarity} onChange={(e) => onFilterRarityChange(e.target.value)}>
            <option value="">All rarities</option>
            {rarityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 overflow-x-auto rounded-xl border border-white/[0.12] bg-black/20">
        <table className="w-full min-w-[28rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="w-8 px-3 py-2.5 font-semibold sm:px-4">#</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Card</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Pick rate</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Decks</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Copies</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((raw, index) => {
              const c = /** @type {Record<string, unknown>} */ (raw);
              const name = String(c.name ?? "Card");
              const img = c.image_url != null ? String(c.image_url) : "";
              const pick = typeof c.pick_rate === "number" ? c.pick_rate : Number(c.pick_rate);
              const decksWith = typeof c.decks_with_card === "number" ? c.decks_with_card : 0;
              const copies = typeof c.total_copies === "number" ? c.total_copies : 0;
              const pitch = numOrNull(c.pitch);
              const cost = numOrNull(c.cost);
              const rarity = numOrNull(c.rarity);

              return (
                <tr key={String(c.card_id)} className={`border-b ${tableRowBorder} last:border-b-0`}>
                  <td className="px-3 py-2 tabular-nums text-[#f4f0fa]/45 sm:px-4">{index + 1}</td>
                  <td className="max-w-[16rem] px-3 py-2 sm:px-4">
                    <div className="min-w-0">
                      <CardNameWithPreview name={name} imageUrl={img} onPreview={onPreview} />
                      <p className="m-0 mt-0.5 text-[0.72rem] text-[#f4f0fa]/50">
                        {rarity != null ? (cardRarityName(rarity) ?? `Rarity ${rarity}`) : "Unknown rarity"}
                        {pitch != null ? ` · Pitch ${pitch}` : ""}
                        {cost != null ? ` · Cost ${cost}` : ""}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums sm:px-4">{fmtPct(pick)}</td>
                  <td className="px-3 py-2 tabular-nums sm:px-4">
                    {decksWith}/{deckCount}
                  </td>
                  <td className="px-3 py-2 tabular-nums sm:px-4">{copies}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const CATEGORY_TABS = /** @type {{ id: CategoryTab, label: string }[]} */ ([
  { id: "distribution", label: "Distribution" },
  { id: "top-picks", label: "Top picks" },
  { id: "bottom-picks", label: "Bottom picks" },
]);

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function RunawaysDraftsAnalytics({ isLight, active }) {
  const { user } = useAuth();
  const [sets, setSets] = useState(/** @type {{ set_id: number, set_name: string, deck_count: number }[]} */ ([]));
  const [heroes, setHeroes] = useState(/** @type {{ hero_id: number, hero_name: string, deck_count: number }[]} */ ([]));
  const [selectedSetId, setSelectedSetId] = useState(/** @type {number | null} */ (null));
  const [selectedHeroId, setSelectedHeroId] = useState(/** @type {number | null} */ (null));
  const [analytics, setAnalytics] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [categoryTab, setCategoryTab] = useState(/** @type {CategoryTab} */ ("distribution"));
  const [pickRarityFilter, setPickRarityFilter] = useState("");
  const [imagePreview, setImagePreview] = useState(/** @type {{ url: string, x: number, y: number } | null} */ (null));

  const panelBorder = isLight ? "border-white/[0.14]" : "border-white/[0.2]";
  const selectCls = isLight
    ? "rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55"
    : "rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55";

  const loadMeta = useCallback(async () => {
    if (!user) return;
    setLoadingMeta(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/data/runaways-drafts/meta?deck_source_id=${RUNAWAYS_SOURCE_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.sets) ? data.sets : [];
      /** @type {{ set_id: number, set_name: string, deck_count: number }[]} */
      const next = [];
      for (const s of list) {
        if (!s || typeof s.set_id !== "number") continue;
        next.push({
          set_id: s.set_id,
          set_name: String(s.set_name ?? `Set ${s.set_id}`).trim(),
          deck_count: typeof s.deck_count === "number" ? s.deck_count : 0,
        });
      }
      setSets(next);
      setSelectedSetId((prev) => {
        if (prev != null && next.some((s) => s.set_id === prev)) return prev;
        return next.length > 0 ? next[0].set_id : null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sets");
      setSets([]);
      setSelectedSetId(null);
    } finally {
      setLoadingMeta(false);
    }
  }, [user]);

  const loadHeroes = useCallback(async () => {
    if (!user || selectedSetId == null) {
      setHeroes([]);
      setSelectedHeroId(null);
      return;
    }
    setLoadingMeta(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/data/runaways-drafts/meta?deck_source_id=${RUNAWAYS_SOURCE_ID}&set_id=${selectedSetId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.heroes) ? data.heroes : [];
      /** @type {{ hero_id: number, hero_name: string, deck_count: number }[]} */
      const next = [];
      for (const h of list) {
        if (!h || typeof h.hero_id !== "number") continue;
        next.push({
          hero_id: h.hero_id,
          hero_name: String(h.hero_name ?? `Hero ${h.hero_id}`).trim(),
          deck_count: typeof h.deck_count === "number" ? h.deck_count : 0,
        });
      }
      setHeroes(next);
      setSelectedHeroId((prev) => {
        if (prev != null && next.some((h) => h.hero_id === prev)) return prev;
        return next.length > 0 ? next[0].hero_id : null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load heroes");
      setHeroes([]);
      setSelectedHeroId(null);
    } finally {
      setLoadingMeta(false);
    }
  }, [user, selectedSetId]);

  const loadAnalytics = useCallback(async () => {
    if (!user || selectedSetId == null || selectedHeroId == null) {
      setAnalytics(null);
      return;
    }
    setLoadingAnalytics(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({
        deck_source_id: String(RUNAWAYS_SOURCE_ID),
        set_id: String(selectedSetId),
        hero_id: String(selectedHeroId),
      });
      const res = await fetch(`/api/data/runaways-drafts/analytics?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setAnalytics(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [user, selectedSetId, selectedHeroId]);

  useEffect(() => {
    if (!active || !user) return undefined;
    void loadMeta();
    return undefined;
  }, [active, user, loadMeta]);

  useEffect(() => {
    if (!active || !user) return undefined;
    void loadHeroes();
    return undefined;
  }, [active, user, loadHeroes]);

  useEffect(() => {
    if (!active || !user) return undefined;
    void loadAnalytics();
    return undefined;
  }, [active, user, loadAnalytics]);

  useEffect(() => {
    setImagePreview(null);
  }, [categoryTab, selectedSetId, selectedHeroId]);

  useEffect(() => {
    setPickRarityFilter("");
  }, [selectedSetId, selectedHeroId]);

  const deckCount = typeof analytics?.deck_count === "number" ? analytics.deck_count : 0;

  const allCards = useMemo(
    () => (Array.isArray(analytics?.cards) ? analytics.cards : []),
    [analytics],
  );

  const pickRarityOptions = useMemo(() => {
    /** @type {Map<string, string>} */
    const seen = new Map();
    for (const raw of allCards) {
      const c = /** @type {Record<string, unknown>} */ (raw);
      const key = cardRarityFilterKey(c);
      if (seen.has(key)) continue;
      if (key === "none") {
        seen.set(key, "Unknown rarity");
      } else {
        const id = Number(key);
        seen.set(key, cardRarityName(id) ?? `Rarity ${key}`);
      }
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allCards]);

  const cardsForPicks = useMemo(() => {
    if (pickRarityFilter === "") return allCards;
    return allCards.filter((raw) => {
      const c = /** @type {Record<string, unknown>} */ (raw);
      return cardRarityFilterKey(c) === pickRarityFilter;
    });
  }, [allCards, pickRarityFilter]);

  const mostPickedCards = useMemo(
    () => sortCardsByPick(cardsForPicks, true).slice(0, PICK_LIMIT),
    [cardsForPicks],
  );

  const leastPickedCards = useMemo(
    () => sortCardsByPick(cardsForPicks, false).slice(0, PICK_LIMIT),
    [cardsForPicks],
  );

  const avgDeckPitchBreakdown = useMemo(
    () => (Array.isArray(analytics?.avg_deck_pitch_breakdown) ? analytics.avg_deck_pitch_breakdown : []),
    [analytics],
  );
  const avgDeckCostBreakdown = useMemo(
    () => (Array.isArray(analytics?.avg_deck_cost_breakdown) ? analytics.avg_deck_cost_breakdown : []),
    [analytics],
  );
  const typeBreakdown = useMemo(
    () => (Array.isArray(analytics?.type_breakdown) ? analytics.type_breakdown : []),
    [analytics],
  );
  const totalCopies = typeof analytics?.total_copies === "number" ? analytics.total_copies : 0;

  const pitchColors = {
    1: "bg-red-500/75",
    2: "bg-yellow-400/80",
    3: "bg-sky-500/75",
    none: "bg-[#f4f0fa]/30",
  };

  const selectedSet = sets.find((s) => s.set_id === selectedSetId);
  const selectedHero = heroes.find((h) => h.hero_id === selectedHeroId);

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[14rem] flex-col gap-1">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Set</span>
          <select
            className={selectCls}
            value={selectedSetId ?? ""}
            disabled={loadingMeta || sets.length === 0}
            onChange={(e) => setSelectedSetId(Number.parseInt(e.target.value, 10) || null)}
          >
            {sets.map((s) => (
              <option key={s.set_id} value={s.set_id}>
                {s.set_name} ({s.deck_count})
              </option>
            ))}
          </select>
        </label>
      </div>

      {heroes.length > 0 ? (
        <div
          className="flex flex-wrap gap-1.5 border-b border-white/[0.08] pb-2"
          role="tablist"
          aria-label="Hero"
        >
          {heroes.map((h) => {
            const activeTab = selectedHeroId === h.hero_id;
            return (
              <button
                key={h.hero_id}
                type="button"
                role="tab"
                aria-selected={activeTab}
                className={`rounded-lg border px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors ${
                  activeTab
                    ? "border-purple-400/55 bg-purple-900/35 text-purple-100"
                    : "border-white/[0.14] bg-black/20 text-[#f4f0fa]/75 hover:border-white/25 hover:text-[#f4f0fa]"
                }`}
                onClick={() => setSelectedHeroId(h.hero_id)}
              >
                {h.hero_name}
                <span className="ml-1.5 font-normal text-[#f4f0fa]/50">({h.deck_count})</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {loadingAnalytics || loadingMeta ? (
        <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">Loading analytics…</p>
      ) : null}

      {!loadingAnalytics && analytics && deckCount === 0 ? (
        <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">
          No decks for {selectedSet?.set_name ?? "this set"} / {selectedHero?.hero_name ?? "this hero"}.
        </p>
      ) : null}

      {!loadingAnalytics && analytics && deckCount > 0 ? (
        <div className="flex flex-col gap-4">
          <div
            className="flex flex-wrap gap-1.5 border-b border-white/[0.08] pb-2"
            role="tablist"
            aria-label="Analytics category"
          >
            {CATEGORY_TABS.map((tab) => {
              const activeCategory = categoryTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory}
                  className={`rounded-lg border px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors ${
                    activeCategory
                      ? "border-violet-400/55 bg-violet-900/30 text-violet-100"
                      : "border-white/[0.14] bg-black/20 text-[#f4f0fa]/75 hover:border-white/25 hover:text-[#f4f0fa]"
                  }`}
                  onClick={() => setCategoryTab(tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {categoryTab === "distribution" ? (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <StatTile title="Decks" value={String(deckCount)} />
                <StatTile title="Total copies" value={String(totalCopies)} hint="Mainboard" />
                <StatTile title="Avg cards / deck" value={fmtNum(analytics.avg_copies_per_deck)} hint={`Target ${MAINBOARD_SIZE}`} />
                <StatTile title="Avg cost" value={fmtNum(analytics.avg_cost)} hint="Weighted by copies" />
                <StatTile title="Avg pitch" value={fmtNum(analytics.avg_pitch)} hint="Weighted by copies" />
                <StatTile
                  title="Avg power / def"
                  value={`${fmtNum(analytics.avg_power)} / ${fmtNum(analytics.avg_defense)}`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
                  <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Pitch / color</h3>
                  <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">
                    Average mainboard split across {deckCount} deck{deckCount === 1 ? "" : "s"} ({MAINBOARD_SIZE} cards
                    each).
                  </p>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {avgDeckPitchBreakdown.length === 0 ? (
                      <p className="m-0 text-[0.82rem] text-[#f4f0fa]/55">No pitch data.</p>
                    ) : (
                      avgDeckPitchBreakdown.map((raw) => {
                        const b = /** @type {Record<string, unknown>} */ (raw);
                        const key = String(b.key ?? "");
                        const label = String(b.label ?? key);
                        const avgCount = numOrNull(b.avg_count) ?? 0;
                        const color = /** @type {Record<string, string>} */ (pitchColors)[key] ?? "bg-violet-500/70";
                        return (
                          <AvgBreakdownBar
                            key={key}
                            label={label}
                            avgCount={avgCount}
                            total={MAINBOARD_SIZE}
                            colorClass={color}
                          />
                        );
                      })
                    )}
                  </div>
                </div>

                <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
                  <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Cost</h3>
                  <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">
                    Average mainboard cost split across {deckCount} deck{deckCount === 1 ? "" : "s"} ({MAINBOARD_SIZE}{" "}
                    cards each).
                  </p>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {avgDeckCostBreakdown.length === 0 ? (
                      <p className="m-0 text-[0.82rem] text-[#f4f0fa]/55">No cost data.</p>
                    ) : (
                      avgDeckCostBreakdown.map((raw) => {
                        const b = /** @type {Record<string, unknown>} */ (raw);
                        const key = String(b.key ?? "");
                        const label = String(b.label ?? key);
                        const avgCount = numOrNull(b.avg_count) ?? 0;
                        return (
                          <AvgBreakdownBar key={key} label={label} avgCount={avgCount} total={MAINBOARD_SIZE} />
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4 lg:max-w-xl`}>
                <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Card type</h3>
                <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">Total copies across all mainboards.</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  {typeBreakdown.map((raw) => {
                    const b = /** @type {Record<string, unknown>} */ (raw);
                    const id = typeof b.id === "number" ? b.id : Number(b.id);
                    const count = typeof b.count === "number" ? b.count : 0;
                    return (
                      <BreakdownBar
                        key={id}
                        label={cardTypeName(id) ?? `Type ${id}`}
                        count={count}
                        total={totalCopies}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {categoryTab === "top-picks" ? (
            <CardPickTable
              title="Most picked"
              cards={mostPickedCards}
              deckCount={deckCount}
              isLight={isLight}
              onPreview={setImagePreview}
              filterRarity={pickRarityFilter}
              onFilterRarityChange={setPickRarityFilter}
              rarityOptions={pickRarityOptions}
              selectCls={selectCls}
            />
          ) : null}

          {categoryTab === "bottom-picks" ? (
            <CardPickTable
              title="Least picked"
              cards={leastPickedCards}
              deckCount={deckCount}
              isLight={isLight}
              onPreview={setImagePreview}
              filterRarity={pickRarityFilter}
              onFilterRarityChange={setPickRarityFilter}
              rarityOptions={pickRarityOptions}
              selectCls={selectCls}
            />
          ) : null}
        </div>
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
    </div>
  );
}
