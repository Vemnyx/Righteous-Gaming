import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { cardClassName } from "../constants/cardClass";
import { cardFormatName } from "../constants/cardFormat";
import { cardFusionName } from "../constants/cardFusion";
import { cardHeroName } from "../constants/cardHero";
import { cardKeywordName } from "../constants/cardKeyword";
import { cardRarityName } from "../constants/cardRarity";
import { cardSubtypeToken } from "../constants/cardSubtype";
import { cardTalentName } from "../constants/cardTalent";
import { cardTypeName } from "../constants/cardType";

/** FAB-style collector number: OMN001 */
function formatCollectorCode(setCode, setNum) {
  const code = String(setCode ?? "").trim();
  const n = Math.max(0, Number(setNum) || 0);
  return `${code}${String(n).padStart(3, "0")}`;
}

/**
 * @param {number[] | undefined} arr
 * @param {(id: number) => string | undefined} nameFn
 */
function joinEnumIds(arr, nameFn) {
  if (!arr?.length) return "—";
  const parts = arr.map((id) => nameFn(id)).filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

/**
 * @typedef {{
 *   id: number,
 *   set_id: number,
 *   name: string,
 *   card_identifier: string | null,
 *   image_url: string | null,
 *   functional_text: string | null,
 *   rarity: number | null,
 *   set_code: string,
 *   set_num: number,
 *   set_name?: string,
 *   type: number,
 *   subtypes: number[],
 *   classes: number[],
 *   hybrid: boolean,
 *   talents: number[],
 *   pitch: number | null,
 *   cost: number | null,
 *   power: number | null,
 *   block: number | null,
 *   heroes: number[],
 *   life: number | null,
 *   intellect: number | null,
 *   keywords: number[],
 *   formats: number[],
 *   specializations: number[],
 *   fusions: number[],
 * }} CatalogCardDetail
 */

/**
 * @param {{ isLight: boolean, identifier: string, active: boolean, onBackToCatalog: () => void }} props
 */
export function CardDetailPage({ isLight, identifier, active, onBackToCatalog }) {
  const { user } = useAuth();
  const [card, setCard] = useState(/** @type {CatalogCardDetail | null} */ (null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!active || !identifier.trim()) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const headers = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const path = `/api/cards/${encodeURIComponent(identifier.trim())}`;
      const res = await fetch(path, { headers });
      if (res.status === 404) {
        setCard(null);
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t?.trim() || res.statusText || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load card");
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [active, identifier, user]);

  useEffect(() => {
    if (!active) return undefined;
    load();
    return undefined;
  }, [active, load]);

  const panelBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const muted = "text-[#f4f0fa]/70";
  const labelCls = `text-[0.75rem] font-semibold uppercase tracking-wide ${muted}`;
  const ddCls = "text-[0.9rem] text-[#f4f0fa]/95";

  return (
    <div className="relative flex w-full flex-1 flex-col gap-5 px-1 py-2 sm:px-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBackToCatalog}
          className={`rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55 ${
            isLight
              ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
              : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30"
          }`}
        >
          ← Back to catalog
        </button>
      </div>

      {loading ? <p className={`text-[0.9rem] ${muted}`}>Loading…</p> : null}

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Could not load card</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button
            type="button"
            className={`mt-3 rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium ${
              isLight
                ? "border-white/25 bg-black/25 text-[#f4f0fa]"
                : "border-white/[0.28] bg-black/20 text-[#f4f0fa]"
            }`}
            onClick={load}
          >
            Retry
          </button>
        </div>
      ) : null}

      {notFound && !loading ? (
        <p className={`text-[0.9rem] ${muted}`}>No card found for “{identifier}”.</p>
      ) : null}

      {!loading && !error && card ? (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
          <div
            className={`mx-auto flex w-full max-w-[min(100%,22rem)] shrink-0 flex-col overflow-hidden rounded-xl border bg-black/25 lg:mx-0 lg:w-[min(100%,22rem)] ${panelBorder}`}
          >
            {card.image_url ? (
              <img
                src={card.image_url}
                alt={card.name || ""}
                className="h-auto w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex aspect-[63/88] items-center justify-center px-4 py-12 text-center text-[0.875rem] text-[#f4f0fa]/55">
                No image available
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-5">
            <header className="space-y-1">
              <h2 className="m-0 text-xl font-semibold tracking-tight text-[#f4f0fa]">{card.name}</h2>
              {card.card_identifier ? (
                <p className={`m-0 font-mono text-[0.8125rem] ${muted}`}>{card.card_identifier}</p>
              ) : null}
            </header>

            <section className={`rounded-xl border bg-black/20 p-4 sm:p-5 ${panelBorder}`}>
              <h3 className="m-0 mb-3 text-[0.7rem] font-semibold uppercase tracking-wider text-[#f4f0fa]/55">
                Card data
              </h3>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(9rem,11rem)_1fr]">
                <dt className={labelCls}>Set</dt>
                <dd className={ddCls}>{card.set_name?.trim() ? card.set_name : "—"}</dd>

                <dt className={labelCls}>Collector code</dt>
                <dd className={`font-mono ${ddCls}`}>
                  {formatCollectorCode(card.set_code, card.set_num)}
                </dd>

                <dt className={labelCls}>Set code / #</dt>
                <dd className={`font-mono ${ddCls}`}>
                  {card.set_code} · {card.set_num}
                </dd>

                <dt className={labelCls}>Type</dt>
                <dd className={ddCls}>{cardTypeName(card.type) ?? card.type}</dd>

                <dt className={labelCls}>Rarity</dt>
                <dd className={ddCls}>
                  {card.rarity != null ? cardRarityName(card.rarity) ?? card.rarity : "—"}
                </dd>

                <dt className={labelCls}>Pitch</dt>
                <dd className={ddCls}>{card.pitch != null ? String(card.pitch) : "—"}</dd>

                <dt className={labelCls}>Cost</dt>
                <dd className={ddCls}>{card.cost != null ? String(card.cost) : "—"}</dd>

                <dt className={labelCls}>Power</dt>
                <dd className={ddCls}>{card.power != null ? String(card.power) : "—"}</dd>

                <dt className={labelCls}>Defense</dt>
                <dd className={ddCls}>{card.block != null ? String(card.block) : "—"}</dd>

                <dt className={labelCls}>Life</dt>
                <dd className={ddCls}>{card.life != null ? String(card.life) : "—"}</dd>

                <dt className={labelCls}>Intellect</dt>
                <dd className={ddCls}>{card.intellect != null ? String(card.intellect) : "—"}</dd>

                <dt className={labelCls}>Hybrid</dt>
                <dd className={ddCls}>{card.hybrid ? "Yes" : "No"}</dd>

                <dt className={labelCls}>Subtypes</dt>
                <dd className={ddCls}>
                  {joinEnumIds(card.subtypes, (id) => cardSubtypeToken(id) ?? undefined)}
                </dd>

                <dt className={labelCls}>Classes</dt>
                <dd className={ddCls}>{joinEnumIds(card.classes, cardClassName)}</dd>

                <dt className={labelCls}>Talents</dt>
                <dd className={ddCls}>{joinEnumIds(card.talents, cardTalentName)}</dd>

                <dt className={labelCls}>Heroes</dt>
                <dd className={ddCls}>{joinEnumIds(card.heroes, cardHeroName)}</dd>

                <dt className={labelCls}>Keywords</dt>
                <dd className={ddCls}>{joinEnumIds(card.keywords, cardKeywordName)}</dd>

                <dt className={labelCls}>Formats</dt>
                <dd className={ddCls}>{joinEnumIds(card.formats, cardFormatName)}</dd>

                <dt className={labelCls}>Specializations</dt>
                <dd className={ddCls}>{joinEnumIds(card.specializations, cardHeroName)}</dd>

                <dt className={labelCls}>Fusions</dt>
                <dd className={ddCls}>{joinEnumIds(card.fusions, cardFusionName)}</dd>
              </dl>
            </section>

            {card.functional_text?.trim() ? (
              <section className={`rounded-xl border bg-black/20 p-4 sm:p-5 ${panelBorder}`}>
                <h3 className="m-0 mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[#f4f0fa]/55">
                  Functional text
                </h3>
                <p className={`m-0 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-[#f4f0fa]/90`}>
                  {card.functional_text.trim()}
                </p>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
