import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { cardClassName } from "../constants/cardClass";
import { cardFormatName } from "../constants/cardFormat";
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
 * @returns {string | null}
 */
function formatEnumList(arr, nameFn) {
  if (!arr?.length) return null;
  const parts = arr.map((id) => nameFn(id)).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
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
 *   talents: number[],
 *   formats: number[],
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
          <div className="mx-auto flex w-full max-w-[min(100%,22rem)] shrink-0 flex-col gap-3 lg:mx-0 lg:w-[min(100%,22rem)]">
            <header className="space-y-1 text-center lg:text-left">
              <h2 className="m-0 text-xl font-semibold tracking-tight text-[#f4f0fa]">{card.name}</h2>
              <p className={`m-0 text-[0.9rem] leading-snug ${muted}`}>
                {(() => {
                  const setName = card.set_name?.trim();
                  const code = formatCollectorCode(card.set_code, card.set_num);
                  if (setName) return `${setName} - ${code}`;
                  return code;
                })()}
              </p>
            </header>

            <div
              className={`overflow-hidden rounded-xl border bg-black/25 ${panelBorder}`}
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
          </div>

          <section className={`min-w-0 flex-1 rounded-xl border bg-black/20 p-4 sm:p-5 ${panelBorder}`}>
            <h3 className="m-0 mb-3 text-[0.7rem] font-semibold uppercase tracking-wider text-[#f4f0fa]/55">
              Card data
            </h3>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(9rem,11rem)_1fr]">
              {card.rarity != null ? (
                <>
                  <dt className={labelCls}>Rarity</dt>
                  <dd className={ddCls}>{cardRarityName(card.rarity) ?? card.rarity}</dd>
                </>
              ) : null}

              <dt className={labelCls}>Type</dt>
              <dd className={ddCls}>{cardTypeName(card.type) ?? card.type}</dd>

              {(() => {
                const v = formatEnumList(card.subtypes, (id) => cardSubtypeToken(id) ?? undefined);
                return v ? (
                  <>
                    <dt className={labelCls}>Subtypes</dt>
                    <dd className={ddCls}>{v}</dd>
                  </>
                ) : null;
              })()}

              {(() => {
                const v = formatEnumList(card.classes, cardClassName);
                return v ? (
                  <>
                    <dt className={labelCls}>Classes</dt>
                    <dd className={ddCls}>{v}</dd>
                  </>
                ) : null;
              })()}

              {(() => {
                const v = formatEnumList(card.talents, cardTalentName);
                return v ? (
                  <>
                    <dt className={labelCls}>Talents</dt>
                    <dd className={ddCls}>{v}</dd>
                  </>
                ) : null;
              })()}

              {(() => {
                const v = formatEnumList(card.formats, cardFormatName);
                return v ? (
                  <>
                    <dt className={labelCls}>Formats Legal In</dt>
                    <dd className={ddCls}>{v}</dd>
                  </>
                ) : null;
              })()}

              {card.functional_text?.trim() ? (
                <>
                  <dt className={labelCls}>Text</dt>
                  <dd className={`${ddCls} whitespace-pre-wrap leading-relaxed`}>
                    {card.functional_text.trim()}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}
