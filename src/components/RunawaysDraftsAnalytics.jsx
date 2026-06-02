import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { cardClassName } from "../constants/cardClass";
import { cardTalentName } from "../constants/cardTalent";
import { cardTypeName } from "../constants/cardType";

const RUNAWAYS_SOURCE_ID = 3;

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
 * @param {{ cards: unknown[], deckCount: number, title: string, isLight: boolean }} props
 */
function CardPickList({ cards, deckCount, title, isLight }) {
  if (!cards.length) {
    return (
      <section>
        <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">{title}</h3>
        <p className="mt-2 text-[0.82rem] text-[#f4f0fa]/55">No data.</p>
      </section>
    );
  }

  const border = isLight ? "border-white/[0.12]" : "border-white/[0.18]";

  return (
    <section>
      <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">{title}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {cards.map((raw) => {
          const c = /** @type {Record<string, unknown>} */ (raw);
          const name = String(c.name ?? "Card");
          const img = c.image_url != null ? String(c.image_url) : "";
          const pick = typeof c.pick_rate === "number" ? c.pick_rate : Number(c.pick_rate);
          const decksWith = typeof c.decks_with_card === "number" ? c.decks_with_card : 0;
          const copies = typeof c.total_copies === "number" ? c.total_copies : 0;
          const pitch = numOrNull(c.pitch);
          const cost = numOrNull(c.cost);

          return (
            <li
              key={String(c.card_id)}
              className={`flex items-center gap-3 rounded-lg border ${border} bg-black/20 px-2.5 py-2`}
            >
              <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-black/40">
                {img ? (
                  <img src={img} alt="" className="h-full w-full object-cover object-top" draggable={false} />
                ) : (
                  <div className="flex h-full items-center justify-center text-[0.55rem] text-[#f4f0fa]/35">?</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[0.84rem] font-medium text-[#f4f0fa]">{name}</p>
                <p className="m-0 text-[0.72rem] text-[#f4f0fa]/55">
                  {fmtPct(pick)} pick rate · {decksWith}/{deckCount} decks · {copies} copies
                  {pitch != null ? ` · pitch ${pitch}` : ""}
                  {cost != null ? ` · cost ${cost}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

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

  const [filterType, setFilterType] = useState("");
  const [filterPitch, setFilterPitch] = useState("");
  const [filterCost, setFilterCost] = useState("");

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
    setFilterType("");
    setFilterPitch("");
    setFilterCost("");
  }, [selectedSetId, selectedHeroId]);

  const deckCount = typeof analytics?.deck_count === "number" ? analytics.deck_count : 0;
  const totalCopies = typeof analytics?.total_copies === "number" ? analytics.total_copies : 0;

  const pitchBreakdown = useMemo(
    () => (Array.isArray(analytics?.pitch_breakdown) ? analytics.pitch_breakdown : []),
    [analytics],
  );
  const costBreakdown = useMemo(
    () => (Array.isArray(analytics?.cost_breakdown) ? analytics.cost_breakdown : []),
    [analytics],
  );
  const typeBreakdown = useMemo(
    () => (Array.isArray(analytics?.type_breakdown) ? analytics.type_breakdown : []),
    [analytics],
  );
  const classBreakdown = useMemo(
    () => (Array.isArray(analytics?.class_breakdown) ? analytics.class_breakdown : []),
    [analytics],
  );
  const talentBreakdown = useMemo(
    () => (Array.isArray(analytics?.talent_breakdown) ? analytics.talent_breakdown : []),
    [analytics],
  );

  const allCards = useMemo(
    () => (Array.isArray(analytics?.cards) ? analytics.cards : []),
    [analytics],
  );

  const filteredCards = useMemo(() => {
    return allCards.filter((raw) => {
      const c = /** @type {Record<string, unknown>} */ (raw);
      if (filterType !== "" && String(c.type) !== filterType) return false;
      if (filterPitch === "none") {
        if (c.pitch != null && c.pitch !== "") return false;
      } else if (filterPitch !== "" && String(c.pitch) !== filterPitch) {
        return false;
      }
      if (filterCost === "none") {
        if (c.cost != null && c.cost !== "") return false;
      } else if (filterCost !== "" && String(c.cost) !== filterCost) {
        return false;
      }
      return true;
    });
  }, [allCards, filterType, filterPitch, filterCost]);

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
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile title="Decks" value={String(deckCount)} />
            <StatTile title="Total copies" value={String(totalCopies)} hint="Mainboard" />
            <StatTile title="Avg cards / deck" value={fmtNum(analytics.avg_copies_per_deck)} />
            <StatTile title="Avg cost" value={fmtNum(analytics.avg_cost)} />
            <StatTile title="Avg pitch" value={fmtNum(analytics.avg_pitch)} hint="Weighted by copies" />
            <StatTile title="Avg power / def" value={`${fmtNum(analytics.avg_power)} / ${fmtNum(analytics.avg_defense)}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
              <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Pitch / color</h3>
              <div className="mt-3 flex flex-col gap-2.5">
                {pitchBreakdown.map((raw) => {
                  const b = /** @type {Record<string, unknown>} */ (raw);
                  const key = String(b.key ?? "");
                  const label = String(b.label ?? key);
                  const count = typeof b.count === "number" ? b.count : 0;
                  const color = /** @type {Record<string, string>} */ (pitchColors)[key] ?? "bg-violet-500/70";
                  return (
                    <BreakdownBar key={key} label={label} count={count} total={totalCopies} colorClass={color} />
                  );
                })}
              </div>
            </div>

            <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
              <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Cost</h3>
              <div className="mt-3 flex flex-col gap-2.5">
                {costBreakdown.map((raw) => {
                  const b = /** @type {Record<string, unknown>} */ (raw);
                  const key = String(b.key ?? "");
                  const label = String(b.label ?? key);
                  const count = typeof b.count === "number" ? b.count : 0;
                  return <BreakdownBar key={key} label={label} count={count} total={totalCopies} />;
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
              <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Card type</h3>
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

            <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
              <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Class</h3>
              <div className="mt-3 flex flex-col gap-2.5">
                {classBreakdown.length === 0 ? (
                  <p className="m-0 text-[0.82rem] text-[#f4f0fa]/55">No class tags on cards in pool.</p>
                ) : (
                  classBreakdown.map((raw) => {
                    const b = /** @type {Record<string, unknown>} */ (raw);
                    const id = typeof b.id === "number" ? b.id : Number(b.id);
                    const count = typeof b.count === "number" ? b.count : 0;
                    return (
                      <BreakdownBar
                        key={id}
                        label={cardClassName(id) ?? `Class ${id}`}
                        count={count}
                        total={totalCopies}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
              <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Talent</h3>
              <div className="mt-3 flex flex-col gap-2.5">
                {talentBreakdown.length === 0 ? (
                  <p className="m-0 text-[0.82rem] text-[#f4f0fa]/55">No talent tags on cards in pool.</p>
                ) : (
                  talentBreakdown.map((raw) => {
                    const b = /** @type {Record<string, unknown>} */ (raw);
                    const id = typeof b.id === "number" ? b.id : Number(b.id);
                    const count = typeof b.count === "number" ? b.count : 0;
                    return (
                      <BreakdownBar
                        key={id}
                        label={cardTalentName(id) ?? `Talent ${id}`}
                        count={count}
                        total={totalCopies}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <CardPickList
              title="Most picked"
              cards={Array.isArray(analytics.most_picked) ? analytics.most_picked : []}
              deckCount={deckCount}
              isLight={isLight}
            />
            <CardPickList
              title="Least picked"
              cards={Array.isArray(analytics.least_picked) ? analytics.least_picked : []}
              deckCount={deckCount}
              isLight={isLight}
            />
          </div>

          <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">All cards in pool</h3>
              <div className="flex flex-wrap gap-2">
                <select className={selectCls} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">All types</option>
                  {typeBreakdown.map((raw) => {
                    const b = /** @type {Record<string, unknown>} */ (raw);
                    const id = typeof b.id === "number" ? b.id : Number(b.id);
                    return (
                      <option key={id} value={String(id)}>
                        {cardTypeName(id) ?? `Type ${id}`}
                      </option>
                    );
                  })}
                </select>
                <select className={selectCls} value={filterPitch} onChange={(e) => setFilterPitch(e.target.value)}>
                  <option value="">All pitch</option>
                  <option value="1">Red (1)</option>
                  <option value="2">Yellow (2)</option>
                  <option value="3">Blue (3)</option>
                  <option value="none">No pitch</option>
                </select>
                <select className={selectCls} value={filterCost} onChange={(e) => setFilterCost(e.target.value)}>
                  <option value="">All cost</option>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={String(n)}>
                      Cost {n}
                    </option>
                  ))}
                  <option value="none">No cost</option>
                </select>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left text-[0.78rem]">
                <thead>
                  <tr className="border-b border-white/[0.1] text-[#f4f0fa]/55">
                    <th className="py-2 pr-3 font-semibold">Card</th>
                    <th className="py-2 pr-3 font-semibold">Type</th>
                    <th className="py-2 pr-3 font-semibold">Pitch</th>
                    <th className="py-2 pr-3 font-semibold">Cost</th>
                    <th className="py-2 pr-3 font-semibold">Pick rate</th>
                    <th className="py-2 pr-3 font-semibold">Decks</th>
                    <th className="py-2 font-semibold">Copies</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCards.map((raw) => {
                    const c = /** @type {Record<string, unknown>} */ (raw);
                    const id = String(c.card_id);
                    const pitch = numOrNull(c.pitch);
                    const cost = numOrNull(c.cost);
                    const typeId = typeof c.type === "number" ? c.type : Number(c.type);
                    const pick = typeof c.pick_rate === "number" ? c.pick_rate : Number(c.pick_rate);
                    const decksWith = typeof c.decks_with_card === "number" ? c.decks_with_card : 0;
                    const copies = typeof c.total_copies === "number" ? c.total_copies : 0;
                    return (
                      <tr key={id} className="border-b border-white/[0.06] text-[#f4f0fa]/88">
                        <td className="py-2 pr-3">{String(c.name ?? "—")}</td>
                        <td className="py-2 pr-3">{cardTypeName(typeId) ?? typeId}</td>
                        <td className="py-2 pr-3">{pitch ?? "—"}</td>
                        <td className="py-2 pr-3">{cost ?? "—"}</td>
                        <td className="py-2 pr-3 tabular-nums">{fmtPct(pick)}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {decksWith}/{deckCount}
                        </td>
                        <td className="py-2 tabular-nums">{copies}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredCards.length === 0 ? (
                <p className="mt-3 text-[0.82rem] text-[#f4f0fa]/55">No cards match the selected filters.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
