import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { cardRarityName } from "../constants/cardRarity";
import { CardType, cardTypeName } from "../constants/cardType";
import { partitionDeckCards } from "../utils/deckSections";
import { DeckViewerSection } from "./DeckViewerSection";

const RUNAWAYS_SOURCE_ID = 3;
const MAINBOARD_SIZE = 30;
const PICK_PAGE_SIZE = 10;
const DECKLIST_PAGE_SIZE = 10;
const PREVIEW_WIDTH = 320;
const PREVIEW_GAP_X = 36;
const PREVIEW_GAP_Y = 10;

/** @typedef {'distribution' | 'top-picks' | 'bottom-picks' | 'sideboard' | 'decklists' | 'trends' | 'build-styles'} CategoryTab */

/** @typedef {{ id: number, name: string, owner_username?: string | null, owner_email?: string | null, mainboard_count: number, fabrary_link?: string | null }} RunawaysDeckRow */

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

/** @param {number} rate */
function fmtPctPoints(rate) {
  if (!Number.isFinite(rate)) return "—";
  const pts = rate * 100;
  const sign = pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(1)} pp`;
}

/** @param {string | undefined | null} iso */
function fmtShortDate(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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

/** @param {Record<string, unknown>} card */
function cardTypeFilterKey(card) {
  if (card.type == null || card.type === "") return "";
  return String(card.type);
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

/** @param {RunawaysDeckRow} row */
function deckOwnerLabel(row) {
  const username = row.owner_username != null ? String(row.owner_username).trim() : "";
  if (username) return username;
  const email = row.owner_email != null ? String(row.owner_email).trim() : "";
  if (email) return email;
  return "—";
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
 * @param {{ pageIndex: number, pageSize: number, total: number, onPageChange: (nextIndex: number) => void }} props
 */
function PickListPagination({ pageIndex, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const safeIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const start = total === 0 ? 0 : safeIndex * pageSize + 1;
  const end = Math.min(total, (safeIndex + 1) * pageSize);

  if (total <= pageSize) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-3 py-3 sm:px-4">
      <p className="m-0 text-[0.8rem] text-[#f4f0fa]/60">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={safeIndex <= 0}
          className="rounded-lg border border-white/[0.18] bg-black/30 px-3 py-1.5 text-[0.78rem] font-semibold text-[#f4f0fa]/90 disabled:cursor-not-allowed disabled:opacity-45 hover:bg-white/[0.06]"
          onClick={() => onPageChange(safeIndex - 1)}
        >
          Previous
        </button>
        <span className="text-[0.78rem] tabular-nums text-[#f4f0fa]/70">
          Page {safeIndex + 1} of {totalPages}
        </span>
        <button
          type="button"
          disabled={safeIndex >= totalPages - 1}
          className="rounded-lg border border-white/[0.18] bg-black/30 px-3 py-1.5 text-[0.78rem] font-semibold text-[#f4f0fa]/90 disabled:cursor-not-allowed disabled:opacity-45 hover:bg-white/[0.06]"
          onClick={() => onPageChange(safeIndex + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   filterRarity: string,
 *   onFilterRarityChange: (value: string) => void,
 *   rarityOptions: { value: string, label: string }[],
 *   filterType: string,
 *   onFilterTypeChange: (value: string) => void,
 *   typeOptions: { value: string, label: string }[],
 *   selectCls: string,
 * }} props
 */
function PickTableFilters({
  filterRarity,
  onFilterRarityChange,
  rarityOptions,
  filterType,
  onFilterTypeChange,
  typeOptions,
  selectCls,
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-[9rem] flex-col gap-1">
        <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50">Type</span>
        <select className={selectCls} value={filterType} onChange={(e) => onFilterTypeChange(e.target.value)}>
          <option value="">All types</option>
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[9rem] flex-col gap-1">
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
 *   filterType: string,
 *   onFilterTypeChange: (value: string) => void,
 *   typeOptions: { value: string, label: string }[],
 *   selectCls: string,
 *   pageIndex: number,
 *   onPageChange: (nextIndex: number) => void,
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
  filterType,
  onFilterTypeChange,
  typeOptions,
  selectCls,
  pageIndex,
  onPageChange,
}) {
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  const totalPages = Math.max(1, Math.ceil(Math.max(0, cards.length) / PICK_PAGE_SIZE));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const pagedCards = cards.slice(safePageIndex * PICK_PAGE_SIZE, safePageIndex * PICK_PAGE_SIZE + PICK_PAGE_SIZE);
  const rowOffset = safePageIndex * PICK_PAGE_SIZE;

  if (!cards.length) {
    return (
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">{title}</h3>
          <PickTableFilters
            filterRarity={filterRarity}
            onFilterRarityChange={onFilterRarityChange}
            rarityOptions={rarityOptions}
            filterType={filterType}
            onFilterTypeChange={onFilterTypeChange}
            typeOptions={typeOptions}
            selectCls={selectCls}
          />
        </div>
        <p className="mt-2 text-[0.82rem] text-[#f4f0fa]/55">No cards match the selected filters.</p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">{title}</h3>
        <PickTableFilters
          filterRarity={filterRarity}
          onFilterRarityChange={onFilterRarityChange}
          rarityOptions={rarityOptions}
          filterType={filterType}
          onFilterTypeChange={onFilterTypeChange}
          typeOptions={typeOptions}
          selectCls={selectCls}
        />
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
            {pagedCards.map((raw, index) => {
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
                  <td className="px-3 py-2 tabular-nums text-[#f4f0fa]/45 sm:px-4">{rowOffset + index + 1}</td>
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
        <PickListPagination
          pageIndex={safePageIndex}
          pageSize={PICK_PAGE_SIZE}
          total={cards.length}
          onPageChange={onPageChange}
        />
      </div>
    </section>
  );
}

/**
 * @param {{
 *   cards: unknown[],
 *   deckCount: number,
 *   isLight: boolean,
 *   onPreview: (preview: { url: string, x: number, y: number } | null) => void,
 * }} props
 */
function SideboardTopTable({ cards, deckCount, isLight, onPreview }) {
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  return (
    <section>
      <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Top inventory cards</h3>
      <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">
        Most common cards in deck inventories (sideboard), ranked by how many decks include each card.
      </p>
      {cards.length === 0 ? (
        <p className="mt-3 text-[0.82rem] text-[#f4f0fa]/55">No inventory cards found in these decks.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.12] bg-black/20">
          <table className="w-full min-w-[28rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
            <thead>
              <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
                <th className="w-8 px-3 py-2.5 font-semibold sm:px-4">#</th>
                <th className="px-3 py-2.5 font-semibold sm:px-4">Card</th>
                <th className="px-3 py-2.5 font-semibold sm:px-4">Rate</th>
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
      )}
    </section>
  );
}

/**
 * @param {{ buckets: { label: string, key?: string, deck_count: number, decks_with_card?: number, pick_rate?: number }[] }} props
 */
function CardPickRateTimelineChart({ buckets }) {
  if (!buckets.length) {
    return <p className="m-0 text-[0.82rem] text-[#f4f0fa]/55">No dated submissions to chart.</p>;
  }

  const width = 640;
  const height = 220;
  const pad = { top: 18, right: 16, bottom: 42, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxRate = buckets.reduce((m, b) => Math.max(m, numOrNull(b.pick_rate) ?? 0), 0);
  const yMax = Math.min(1, Math.max(0.25, maxRate * 1.15));

  /** @param {number} rate */
  const yForRate = (rate) => pad.top + innerH - (rate / yMax) * innerH;

  const points = buckets.map((b, i) => {
    const x =
      buckets.length === 1 ? pad.left + innerW / 2 : pad.left + (i / (buckets.length - 1)) * innerW;
    const rate = numOrNull(b.pick_rate) ?? 0;
    return { x, y: yForRate(rate), rate, bucket: b };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));
  const yTicks = [0, yMax / 2, yMax];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[20rem]"
        role="img"
        aria-label="Pick rate over time line chart"
      >
        {yTicks.map((tick) => {
          const y = yForRate(tick);
          return (
            <g key={tick}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fill="rgba(244,240,250,0.5)" fontSize="10">
                {fmtPct(tick)}
              </text>
            </g>
          );
        })}
        <path d={pathD} fill="none" stroke="#9b6fd8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => (
          <g key={p.bucket.key ?? p.bucket.label}>
            <circle cx={p.x} cy={p.y} r="4.5" fill="#c4a9ef" stroke="#1a1424" strokeWidth="1.5">
              <title>
                {p.bucket.label}: {fmtPct(p.rate)} ({p.bucket.decks_with_card ?? 0}/{p.bucket.deck_count} decks)
              </title>
            </circle>
          </g>
        ))}
        {points.map((p, i) => {
          if (i % labelEvery !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={`${p.bucket.key ?? p.bucket.label}-x`}
              x={p.x}
              y={height - 14}
              textAnchor="middle"
              fill="rgba(244,240,250,0.55)"
              fontSize="10"
            >
              {p.bucket.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * @param {{
 *   cardName: string,
 *   imageUrl: string | null,
 *   loading: boolean,
 *   error: string | null,
 *   timeline: Record<string, unknown> | null,
 *   isLight: boolean,
 *   onClose: () => void,
 * }} props
 */
function CardTrendPickModal({ cardName, imageUrl, loading, error, timeline, isLight, onClose }) {
  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

  const buckets = Array.isArray(timeline?.buckets)
    ? timeline.buckets.map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const b = /** @type {Record<string, unknown>} */ (raw);
        return {
          label: String(b.label ?? ""),
          key: b.key != null ? String(b.key) : undefined,
          deck_count: numOrNull(b.deck_count) ?? 0,
          decks_with_card: numOrNull(b.decks_with_card) ?? 0,
          pick_rate: numOrNull(b.pick_rate) ?? 0,
        };
      }).filter(Boolean)
    : [];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className={`relative flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col rounded-xl p-5 sm:p-6 ${modalPanel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="runaways-card-trend-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-16 w-auto shrink-0 rounded-md border border-white/[0.14] bg-black/30 object-contain sm:h-20"
              />
            ) : null}
            <div className="min-w-0">
              <h3 id="runaways-card-trend-modal-title" className="m-0 truncate text-lg font-semibold text-[#f4f0fa]">
                {cardName}
              </h3>
              <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">
                Mainboard pick rate by Fabrary deck created date (UTC days).
              </p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-white/[0.18] bg-black/30 px-2.5 py-1 text-[0.78rem] font-semibold text-[#f4f0fa]/85 hover:bg-white/[0.06]"
            disabled={loading}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <p className="m-0 py-10 text-center text-[0.875rem] text-[#f4f0fa]/70">Loading pick trend…</p>
          ) : error ? (
            <p className="m-0 text-[0.875rem] text-red-200/95" role="alert">
              {error}
            </p>
          ) : !timeline?.available ? (
            <p className="m-0 text-[0.875rem] text-[#f4f0fa]/70">
              {timeline?.unavailable_reason != null
                ? String(timeline.unavailable_reason)
                : "Pick trend is not available for this card."}
            </p>
          ) : (
            <CardPickRateTimelineChart buckets={/** @type {NonNullable<typeof buckets>} */ (buckets)} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * @param {{
 *   title: string,
 *   cards: unknown[],
 *   earlyDeckCount: number,
 *   lateDeckCount: number,
 *   isLight: boolean,
 *   onPreview: (preview: { url: string, x: number, y: number } | null) => void,
 *   onCardClick?: (card: Record<string, unknown>) => void,
 * }} props
 */
function CardTrendTable({ title, cards, earlyDeckCount, lateDeckCount, isLight, onPreview, onCardClick }) {
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  if (!cards.length) {
    return (
      <section>
        <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">{title}</h3>
        <p className="mt-2 text-[0.82rem] text-[#f4f0fa]/55">No cards match the trend criteria.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">{title}</h3>
      {onCardClick ? (
        <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">Click a row to view pick rate over time.</p>
      ) : null}
      <div className="mt-2 overflow-x-auto rounded-xl border border-white/[0.12] bg-black/20">
        <table className="w-full min-w-[32rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="w-8 px-3 py-2.5 font-semibold sm:px-4">#</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Card</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Early</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Late</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Change</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((raw, index) => {
              const c = /** @type {Record<string, unknown>} */ (raw);
              const name = String(c.name ?? "Card");
              const img = c.image_url != null ? String(c.image_url) : "";
              const earlyRate = typeof c.early_pick_rate === "number" ? c.early_pick_rate : Number(c.early_pick_rate);
              const lateRate = typeof c.late_pick_rate === "number" ? c.late_pick_rate : Number(c.late_pick_rate);
              const delta = typeof c.pick_rate_delta === "number" ? c.pick_rate_delta : Number(c.pick_rate_delta);
              const earlyDecks = typeof c.early_decks_with_card === "number" ? c.early_decks_with_card : 0;
              const lateDecks = typeof c.late_decks_with_card === "number" ? c.late_decks_with_card : 0;
              const rarity = numOrNull(c.rarity);
              const deltaClass =
                Number.isFinite(delta) && delta > 0.001
                  ? "text-emerald-300/95"
                  : Number.isFinite(delta) && delta < -0.001
                    ? "text-rose-300/95"
                    : "";

              return (
                <tr
                  key={String(c.card_id)}
                  className={`border-b ${tableRowBorder} last:border-b-0 ${
                    onCardClick ? "cursor-pointer hover:bg-white/[0.04]" : ""
                  }`}
                  onClick={() => onCardClick?.(c)}
                >
                  <td className="px-3 py-2 tabular-nums text-[#f4f0fa]/45 sm:px-4">{index + 1}</td>
                  <td className="max-w-[16rem] px-3 py-2 sm:px-4">
                    <div className="min-w-0">
                      <CardNameWithPreview name={name} imageUrl={img} onPreview={onPreview} />
                      <p className="m-0 mt-0.5 text-[0.72rem] text-[#f4f0fa]/50">
                        {rarity != null ? (cardRarityName(rarity) ?? `Rarity ${rarity}`) : "Unknown rarity"}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums sm:px-4">
                    {fmtPct(earlyRate)}
                    <span className="text-[#f4f0fa]/45">
                      {" "}
                      ({earlyDecks}/{earlyDeckCount})
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums sm:px-4">
                    {fmtPct(lateRate)}
                    <span className="text-[#f4f0fa]/45">
                      {" "}
                      ({lateDecks}/{lateDeckCount})
                    </span>
                  </td>
                  <td className={`px-3 py-2 tabular-nums sm:px-4 ${deltaClass}`}>{fmtPctPoints(delta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * @param {{ buckets: { label: string, key?: string, deck_count: number }[], panelBorder: string }} props
 */
function SubmissionTimelineChart({ buckets, panelBorder }) {
  const max = Math.max(1, ...buckets.map((b) => b.deck_count));
  return (
    <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
      <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Deck submissions over time</h3>
      <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">By Fabrary deck created date (UTC days).</p>
      <div className="mt-4 flex h-40 items-end gap-1.5 sm:gap-2">
        {buckets.map((b) => {
          const h = Math.round((b.deck_count / max) * 100);
          return (
            <div key={b.key ?? b.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex h-32 w-full items-end justify-center rounded-md bg-black/30 px-0.5">
                <div
                  className="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-[#5a2f8f] to-[#9b6fd8]"
                  style={{ height: `${Math.max(4, h)}%` }}
                  title={`${b.deck_count} decks`}
                />
              </div>
              <span className="max-w-full truncate text-center text-[0.62rem] text-[#f4f0fa]/55">{b.label}</span>
              <span className="text-[0.68rem] tabular-nums text-[#f4f0fa]/70">{b.deck_count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * @param {{
 *   archetypes: Record<string, unknown> | null,
 *   deckCount: number,
 *   panelBorder: string,
 *   onPreview: (preview: { url: string, x: number, y: number } | null) => void,
 * }} props
 */
function BuildStylesPanel({ archetypes, deckCount, panelBorder, onPreview }) {
  const typical =
    archetypes?.typical != null && typeof archetypes.typical === "object"
      ? /** @type {Record<string, unknown>} */ (archetypes.typical)
      : null;
  const tags = Array.isArray(archetypes?.tags) ? archetypes.tags : [];
  const packages = Array.isArray(archetypes?.packages) ? archetypes.packages : [];

  if (!archetypes?.available) {
    return (
      <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
        <p className="m-0 text-[0.875rem] text-[#f4f0fa]/75">
          {archetypes?.unavailable_reason != null
            ? String(archetypes.unavailable_reason)
            : `Need at least ${numOrNull(archetypes?.min_decks_for_analysis) ?? 10} decks to infer build styles.`}
        </p>
        {deckCount > 0 ? (
          <p className="m-0 mt-2 text-[0.78rem] text-[#f4f0fa]/55">{deckCount} decks in this slice.</p>
        ) : null}
      </div>
    );
  }

  /** @param {unknown} pct @param {string} colorClass */
  const pitchBar = (pct, colorClass) => {
    const p = (numOrNull(pct) ?? 0) * 100;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 text-[0.78rem]">
          <span className="truncate text-[#f4f0fa]/82">{p.toFixed(1)}% of pitched cards</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/35">
          <div
            className={`h-full rounded-full ${colorClass}`}
            style={{ width: `${Math.max(p, p > 0 ? 2 : 0)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-[0.82rem] leading-snug text-[#f4f0fa]/65">
        Heuristic build styles from submitted mainboards. Decks can match multiple tags. Card packages are pairs that
        co-occur more often than expected (lift ≥ 1.2).
      </p>

      {typical ? (
        <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
          <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Typical mainboard profile</h3>
          <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">Average across {deckCount} decks.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50">Pitch mix</p>
              <div className="flex flex-col gap-2">
                <div>
                  <p className="m-0 mb-1 text-[0.78rem] text-red-300/90">Red</p>
                  {pitchBar(typical.red_pct, "bg-red-500/75")}
                </div>
                <div>
                  <p className="m-0 mb-1 text-[0.78rem] text-yellow-300/90">Yellow</p>
                  {pitchBar(typical.yellow_pct, "bg-yellow-400/80")}
                </div>
                <div>
                  <p className="m-0 mb-1 text-[0.78rem] text-sky-300/90">Blue</p>
                  {pitchBar(typical.blue_pct, "bg-sky-500/75")}
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <StatTile title="Avg cost" value={fmtNum(typical.avg_cost, 2)} />
              <StatTile title="Avg 3-blocks" value={fmtNum(typical.avg_block3, 1)} />
              <StatTile title="Reaction share" value={fmtPct(numOrNull(typical.reaction_pct) ?? 0)} />
              <StatTile title="Equip / weapon share" value={fmtPct(numOrNull(typical.equipment_weapon_pct) ?? 0)} />
            </div>
          </div>
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Detected build styles</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {tags.map((raw) => {
              if (!raw || typeof raw !== "object") return null;
              const tag = /** @type {Record<string, unknown>} */ (raw);
              const sig = Array.isArray(tag.signature_cards) ? tag.signature_cards : [];
              return (
                <div
                  key={String(tag.key ?? tag.label ?? "")}
                  className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="m-0 text-[0.95rem] font-semibold text-[#f4f0fa]">
                      {String(tag.label ?? tag.key ?? "Style")}
                    </h4>
                    <span className="text-[0.82rem] tabular-nums text-[#f4f0fa]/70">
                      {numOrNull(tag.deck_count) ?? 0} decks · {fmtPct(numOrNull(tag.share) ?? 0)}
                    </span>
                  </div>
                  {tag.description != null ? (
                    <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">{String(tag.description)}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] tabular-nums text-[#f4f0fa]/60">
                    <span>Red {fmtPct(numOrNull(tag.avg_red_pct) ?? 0)}</span>
                    <span>Blue {fmtPct(numOrNull(tag.avg_blue_pct) ?? 0)}</span>
                    <span>Cost {fmtNum(tag.avg_cost, 2)}</span>
                  </div>
                  {sig.length > 0 ? (
                    <div className="mt-3 border-t border-white/[0.08] pt-3">
                      <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/45">
                        Signature picks
                      </p>
                      <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                        {sig.map((cRaw) => {
                          if (!cRaw || typeof cRaw !== "object") return null;
                          const c = /** @type {Record<string, unknown>} */ (cRaw);
                          const name = String(c.name ?? "Card");
                          const imageUrl = c.image_url != null ? String(c.image_url) : "";
                          return (
                            <li key={String(c.card_id ?? name)} className="truncate text-[0.8rem] text-[#f4f0fa]/85">
                              <CardNameWithPreview name={name} imageUrl={imageUrl} onPreview={onPreview} />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No build styles matched the heuristics for this slice.</p>
      )}

      {packages.length > 0 ? (
        <div className={`overflow-hidden rounded-xl border ${panelBorder} bg-black/20`}>
          <div className="border-b border-white/[0.08] px-4 py-3">
            <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Card packages</h3>
            <p className="m-0 mt-1 text-[0.78rem] text-[#f4f0fa]/55">Pairs that show up together disproportionately often.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-[0.82rem]">
              <thead>
                <tr className="border-b border-white/[0.08] text-[0.68rem] uppercase tracking-wide text-[#f4f0fa]/45">
                  <th className="px-4 py-2.5 font-semibold">Cards</th>
                  <th className="px-3 py-2.5 font-semibold">Decks</th>
                  <th className="px-3 py-2.5 font-semibold">Share</th>
                  <th className="px-3 py-2.5 font-semibold">Lift</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((raw, idx) => {
                  if (!raw || typeof raw !== "object") return null;
                  const pkg = /** @type {Record<string, unknown>} */ (raw);
                  const cards = Array.isArray(pkg.cards) ? pkg.cards : [];
                  return (
                    <tr key={idx} className="border-b border-white/[0.06] last:border-b-0">
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1">
                          {cards.map((cRaw) => {
                            if (!cRaw || typeof cRaw !== "object") return null;
                            const c = /** @type {Record<string, unknown>} */ (cRaw);
                            const name = String(c.name ?? "Card");
                            const imageUrl = c.image_url != null ? String(c.image_url) : "";
                            return (
                              <span key={String(c.card_id ?? name)} className="block truncate text-[#f4f0fa]/90">
                                <CardNameWithPreview name={name} imageUrl={imageUrl} onPreview={onPreview} />
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-[#f4f0fa]/80">{numOrNull(pkg.deck_count) ?? 0}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[#f4f0fa]/80">{fmtPct(numOrNull(pkg.share) ?? 0)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-emerald-300/90">{fmtNum(pkg.lift, 2)}×</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No strong card pairs detected for this hero yet.</p>
      )}
    </div>
  );
}

const CATEGORY_TABS = /** @type {{ id: CategoryTab, label: string }[]} */ ([
  { id: "distribution", label: "Distribution" },
  { id: "trends", label: "Trends over time" },
  { id: "build-styles", label: "Build styles" },
  { id: "top-picks", label: "Top picks" },
  { id: "bottom-picks", label: "Bottom picks" },
  { id: "sideboard", label: "Sideboard" },
  { id: "decklists", label: "Decklists" },
]);

/**
 * @param {{
 *   deckName: string,
 *   ownerLabel: string,
 *   fabraryLink: string | null,
 *   sections: ReturnType<typeof partitionDeckCards>,
 *   loading: boolean,
 *   error: string | null,
 *   isLight: boolean,
 *   onClose: () => void,
 * }} props
 */
function DeckDetailModal({ deckName, ownerLabel, fabraryLink, sections, loading, error, isLight, onClose }) {
  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className={`relative flex max-h-[min(90vh,820px)] w-full max-w-4xl flex-col rounded-xl p-5 sm:p-6 ${modalPanel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="runaways-deck-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="runaways-deck-modal-title" className="m-0 truncate text-lg font-semibold text-[#f4f0fa]">
              {deckName}
            </h3>
            <p className="m-0 mt-1 text-[0.82rem] text-[#f4f0fa]/60">{ownerLabel}</p>
            {fabraryLink ? (
              <a
                href={fabraryLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[0.78rem] text-[#c4a9ef] underline-offset-2 hover:underline"
              >
                View on Fabrary
              </a>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-white/[0.18] bg-black/30 px-2.5 py-1 text-[0.78rem] font-semibold text-[#f4f0fa]/85 hover:bg-white/[0.06]"
            disabled={loading}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div
                className="h-9 w-9 animate-spin rounded-full border-2 border-[#f4f0fa]/20 border-t-[#f4f0fa]/90"
                role="status"
                aria-label="Loading deck"
              />
              <p className="m-0 text-[0.875rem] text-[#f4f0fa]/70">Loading deck…</p>
            </div>
          ) : error ? (
            <p className="m-0 text-[0.875rem] text-red-200/95" role="alert">
              {error}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              <DeckViewerSection title="Hero + arena" lines={sections.heroArena} isLight={isLight} stacked={false} />
              <DeckViewerSection title="Deck" lines={sections.deck} isLight={isLight} stacked />
              <DeckViewerSection title="Inventory" lines={sections.inventory} isLight={isLight} stacked />
              <DeckViewerSection title="Tokens" lines={sections.tokens} isLight={isLight} stacked={false} />
              {sections.heroArena.length === 0 &&
              sections.deck.length === 0 &&
              sections.inventory.length === 0 &&
              sections.tokens.length === 0 ? (
                <p className="m-0 text-[0.875rem] text-[#f4f0fa]/60">This deck has no cards.</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * @param {{
 *   decks: RunawaysDeckRow[],
 *   loading: boolean,
 *   pageIndex: number,
 *   onPageChange: (nextIndex: number) => void,
 *   onOpenDeck: (deckId: number) => void,
 *   isLight: boolean,
 * }} props
 */
function DecklistsTable({ decks, loading, pageIndex, onPageChange, onOpenDeck, isLight }) {
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  const totalPages = Math.max(1, Math.ceil(Math.max(0, decks.length) / DECKLIST_PAGE_SIZE));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const pagedDecks = decks.slice(safePageIndex * DECKLIST_PAGE_SIZE, safePageIndex * DECKLIST_PAGE_SIZE + DECKLIST_PAGE_SIZE);
  const rowOffset = safePageIndex * DECKLIST_PAGE_SIZE;

  if (loading) {
    return <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">Loading decklists…</p>;
  }

  if (decks.length === 0) {
    return <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No decklists for this set and hero.</p>;
  }

  return (
    <section>
      <div className="overflow-x-auto rounded-xl border border-white/[0.12] bg-black/20">
        <table className="w-full min-w-[24rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="w-8 px-3 py-2.5 font-semibold sm:px-4">#</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Deck</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Mainboard</th>
            </tr>
          </thead>
          <tbody>
            {pagedDecks.map((row, index) => {
              const name = String(row.name ?? "Deck").trim() || "Deck";
              return (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b transition-colors hover:bg-white/[0.04] ${tableRowBorder} last:border-b-0`}
                  onClick={() => onOpenDeck(row.id)}
                >
                  <td className="px-3 py-2 tabular-nums text-[#f4f0fa]/45 sm:px-4">{rowOffset + index + 1}</td>
                  <td className="max-w-[18rem] px-3 py-2 font-medium text-[#c4a9ef] sm:px-4">
                    <span className="truncate">{name}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums sm:px-4">{row.mainboard_count ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <PickListPagination
          pageIndex={safePageIndex}
          pageSize={DECKLIST_PAGE_SIZE}
          total={decks.length}
          onPageChange={onPageChange}
        />
      </div>
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
  const [archetypes, setArchetypes] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [loadingArchetypes, setLoadingArchetypes] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [categoryTab, setCategoryTab] = useState(/** @type {CategoryTab} */ ("distribution"));
  const [pickRarityFilter, setPickRarityFilter] = useState("");
  const [pickTypeFilter, setPickTypeFilter] = useState("");
  const [topPickPageIndex, setTopPickPageIndex] = useState(0);
  const [bottomPickPageIndex, setBottomPickPageIndex] = useState(0);
  const [decklists, setDecklists] = useState(/** @type {RunawaysDeckRow[]} */ ([]));
  const [loadingDecklists, setLoadingDecklists] = useState(false);
  const [decklistPageIndex, setDecklistPageIndex] = useState(0);
  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [deckModalLoading, setDeckModalLoading] = useState(false);
  const [deckModalError, setDeckModalError] = useState(/** @type {string | null} */ (null));
  const [deckModalMeta, setDeckModalMeta] = useState(
    /** @type {{ name: string, ownerLabel: string, fabraryLink: string | null } | null} */ (null),
  );
  const [deckModalSections, setDeckModalSections] = useState(
    /** @type {ReturnType<typeof partitionDeckCards> | null} */ (null),
  );
  const [imagePreview, setImagePreview] = useState(/** @type {{ url: string, x: number, y: number } | null} */ (null));
  const [trendCardModalOpen, setTrendCardModalOpen] = useState(false);
  const [trendCardModalLoading, setTrendCardModalLoading] = useState(false);
  const [trendCardModalError, setTrendCardModalError] = useState(/** @type {string | null} */ (null));
  const [trendCardModalTimeline, setTrendCardModalTimeline] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  );
  const [trendCardModalMeta, setTrendCardModalMeta] = useState(
    /** @type {{ name: string, imageUrl: string | null } | null} */ (null),
  );

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

  const loadArchetypes = useCallback(async () => {
    if (!user || selectedSetId == null || selectedHeroId == null) {
      setArchetypes(null);
      return;
    }
    setLoadingArchetypes(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({
        deck_source_id: String(RUNAWAYS_SOURCE_ID),
        set_id: String(selectedSetId),
        hero_id: String(selectedHeroId),
      });
      const res = await fetch(`/api/data/runaways-drafts/archetypes?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setArchetypes(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load build styles");
      setArchetypes(null);
    } finally {
      setLoadingArchetypes(false);
    }
  }, [user, selectedSetId, selectedHeroId]);

  const closeTrendCardModal = useCallback(() => {
    if (trendCardModalLoading) return;
    setTrendCardModalOpen(false);
    setTrendCardModalError(null);
    setTrendCardModalTimeline(null);
    setTrendCardModalMeta(null);
  }, [trendCardModalLoading]);

  const openTrendCardModal = useCallback(
    async (cardRaw) => {
      if (!user || selectedSetId == null || selectedHeroId == null) return;
      const c = /** @type {Record<string, unknown>} */ (cardRaw);
      const cardId = numOrNull(c.card_id);
      if (cardId == null) return;

      const name = String(c.name ?? "Card");
      const imageUrl = c.image_url != null ? String(c.image_url) : null;
      setTrendCardModalMeta({ name, imageUrl });
      setTrendCardModalOpen(true);
      setTrendCardModalLoading(true);
      setTrendCardModalError(null);
      setTrendCardModalTimeline(null);

      try {
        const token = await user.getIdToken();
        const qs = new URLSearchParams({
          deck_source_id: String(RUNAWAYS_SOURCE_ID),
          set_id: String(selectedSetId),
          hero_id: String(selectedHeroId),
          card_id: String(cardId),
        });
        const res = await fetch(`/api/data/runaways-drafts/card-pick-timeline?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(parseApiError(await res.text()));
        setTrendCardModalTimeline(await res.json());
      } catch (e) {
        setTrendCardModalError(e instanceof Error ? e.message : "Failed to load pick trend");
      } finally {
        setTrendCardModalLoading(false);
      }
    },
    [user, selectedSetId, selectedHeroId],
  );

  const loadDecklists = useCallback(async () => {
    if (!user || selectedSetId == null || selectedHeroId == null) {
      setDecklists([]);
      return;
    }
    setLoadingDecklists(true);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({
        deck_source_id: String(RUNAWAYS_SOURCE_ID),
        set_id: String(selectedSetId),
        hero_id: String(selectedHeroId),
      });
      const res = await fetch(`/api/data/runaways-drafts/decks?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.decks) ? data.decks : [];
      /** @type {RunawaysDeckRow[]} */
      const next = [];
      for (const d of list) {
        if (!d || typeof d.id !== "number") continue;
        next.push({
          id: d.id,
          name: String(d.name ?? `Deck ${d.id}`).trim(),
          owner_username: d.owner_username != null ? String(d.owner_username) : null,
          owner_email: d.owner_email != null ? String(d.owner_email) : null,
          mainboard_count: typeof d.mainboard_count === "number" ? d.mainboard_count : 0,
          fabrary_link: d.fabrary_link != null ? String(d.fabrary_link) : null,
        });
      }
      setDecklists(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decklists");
      setDecklists([]);
    } finally {
      setLoadingDecklists(false);
    }
  }, [user, selectedSetId, selectedHeroId]);

  const openDeckModal = useCallback(
    async (deckId) => {
      if (!user || selectedSetId == null || selectedHeroId == null) return;
      const summary = decklists.find((d) => d.id === deckId);
      setDeckModalOpen(true);
      setDeckModalLoading(true);
      setDeckModalError(null);
      setDeckModalSections(null);
      setDeckModalMeta({
        name: summary?.name ?? `Deck ${deckId}`,
        ownerLabel: summary ? deckOwnerLabel(summary) : "—",
        fabraryLink:
          summary?.fabrary_link != null && String(summary.fabrary_link).trim() !== ""
            ? String(summary.fabrary_link).trim()
            : null,
      });
      try {
        const token = await user.getIdToken();
        const qs = new URLSearchParams({
          deck_source_id: String(RUNAWAYS_SOURCE_ID),
          set_id: String(selectedSetId),
          hero_id: String(selectedHeroId),
        });
        const res = await fetch(`/api/data/runaways-drafts/decks/${deckId}?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(parseApiError(await res.text()));
        const data = await res.json();
        const d = data?.deck;
        const list = Array.isArray(data.cards) ? data.cards : [];
        /** @type {import("../utils/deckSections").DeckCardLine[]} */
        const lines = [];
        for (const row of list) {
          if (!row || typeof row.card_id !== "number" || !row.card || typeof row.card.id !== "number") continue;
          lines.push({
            card_id: row.card_id,
            mainboard: row.mainboard === true,
            count: typeof row.count === "number" && row.count > 0 ? row.count : 1,
            card: row.card,
          });
        }
        const hc = data?.hero_card;
        const heroCard = hc && typeof hc.id === "number" ? hc : null;
        setDeckModalMeta({
          name: d && typeof d.name === "string" ? String(d.name).trim() || `Deck ${deckId}` : summary?.name ?? `Deck ${deckId}`,
          ownerLabel:
            d?.owner_username != null && String(d.owner_username).trim() !== ""
              ? String(d.owner_username).trim()
              : d?.owner_email != null && String(d.owner_email).trim() !== ""
                ? String(d.owner_email).trim()
                : summary
                  ? deckOwnerLabel(summary)
                  : "—",
          fabraryLink:
            d?.fabrary_link != null && String(d.fabrary_link).trim() !== ""
              ? String(d.fabrary_link).trim()
              : summary?.fabrary_link != null && String(summary.fabrary_link).trim() !== ""
                ? String(summary.fabrary_link).trim()
                : null,
        });
        setDeckModalSections(
          partitionDeckCards(lines, {
            heroCard: heroCard ?? undefined,
            heroCardId: heroCard?.id,
          }),
        );
      } catch (e) {
        setDeckModalError(e instanceof Error ? e.message : "Failed to load deck");
      } finally {
        setDeckModalLoading(false);
      }
    },
    [user, selectedSetId, selectedHeroId, decklists],
  );

  const closeDeckModal = useCallback(() => {
    if (deckModalLoading) return;
    setDeckModalOpen(false);
    setDeckModalError(null);
    setDeckModalSections(null);
    setDeckModalMeta(null);
  }, [deckModalLoading]);

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
    setPickTypeFilter("");
    setTopPickPageIndex(0);
    setBottomPickPageIndex(0);
    setDecklistPageIndex(0);
    setDecklists([]);
    setArchetypes(null);
    setDeckModalOpen(false);
    setDeckModalLoading(false);
    setDeckModalError(null);
    setDeckModalSections(null);
    setDeckModalMeta(null);
    setTrendCardModalOpen(false);
    setTrendCardModalLoading(false);
    setTrendCardModalError(null);
    setTrendCardModalTimeline(null);
    setTrendCardModalMeta(null);
  }, [selectedSetId, selectedHeroId]);

  useEffect(() => {
    setTopPickPageIndex(0);
    setBottomPickPageIndex(0);
  }, [pickRarityFilter, pickTypeFilter]);

  useEffect(() => {
    if (!active || !user || categoryTab !== "decklists") return undefined;
    if (selectedSetId == null || selectedHeroId == null) return undefined;
    void loadDecklists();
    return undefined;
  }, [active, user, categoryTab, selectedSetId, selectedHeroId, loadDecklists]);

  useEffect(() => {
    if (!active || !user || categoryTab !== "build-styles") return undefined;
    if (selectedSetId == null || selectedHeroId == null) return undefined;
    void loadArchetypes();
    return undefined;
  }, [active, user, categoryTab, selectedSetId, selectedHeroId, loadArchetypes]);

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

  const pickTypeOptions = useMemo(() => {
    /** @type {Map<string, string>} */
    const seen = new Map();
    for (const raw of allCards) {
      const c = /** @type {Record<string, unknown>} */ (raw);
      const key = cardTypeFilterKey(c);
      if (key === "" || seen.has(key)) continue;
      const id = Number(key);
      seen.set(key, cardTypeName(id) ?? `Type ${key}`);
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allCards]);

  const cardsForPicks = useMemo(() => {
    return allCards.filter((raw) => {
      const c = /** @type {Record<string, unknown>} */ (raw);
      if (pickRarityFilter !== "" && cardRarityFilterKey(c) !== pickRarityFilter) return false;
      if (pickTypeFilter !== "" && cardTypeFilterKey(c) !== pickTypeFilter) return false;
      return true;
    });
  }, [allCards, pickRarityFilter, pickTypeFilter]);

  const mostPickedCards = useMemo(() => {
    const pool = cardsForPicks.filter((raw) => numOrNull(/** @type {Record<string, unknown>} */ (raw).type) !== CardType.Weapon);
    return sortCardsByPick(pool, true);
  }, [cardsForPicks]);

  const leastPickedCards = useMemo(() => sortCardsByPick(cardsForPicks, false), [cardsForPicks]);

  const topSideboardCards = useMemo(
    () => (Array.isArray(analytics?.top_sideboard) ? analytics.top_sideboard : []),
    [analytics],
  );

  const avgDeckPitchBreakdown = useMemo(
    () => (Array.isArray(analytics?.avg_deck_pitch_breakdown) ? analytics.avg_deck_pitch_breakdown : []),
    [analytics],
  );
  const avgDeckCostBreakdown = useMemo(
    () => (Array.isArray(analytics?.avg_deck_cost_breakdown) ? analytics.avg_deck_cost_breakdown : []),
    [analytics],
  );
  const avgDeckTypeBreakdown = useMemo(
    () => (Array.isArray(analytics?.avg_deck_type_breakdown) ? analytics.avg_deck_type_breakdown : []),
    [analytics],
  );
  const avgDeckBlockBreakdown = useMemo(
    () => (Array.isArray(analytics?.avg_deck_block_breakdown) ? analytics.avg_deck_block_breakdown : []),
    [analytics],
  );

  const timeTrends = useMemo(() => {
    const raw = analytics?.time_trends;
    if (!raw || typeof raw !== "object") return null;
    return /** @type {Record<string, unknown>} */ (raw);
  }, [analytics]);

  const trendEarlyDeckCount = useMemo(() => {
    const periods = Array.isArray(timeTrends?.periods) ? timeTrends.periods : [];
    const early = periods.find((p) => p && typeof p === "object" && /** @type {Record<string, unknown>} */ (p).key === "early");
    if (!early || typeof early !== "object") return 0;
    const n = numOrNull(/** @type {Record<string, unknown>} */ (early).deck_count);
    return n ?? 0;
  }, [timeTrends]);

  const trendLateDeckCount = useMemo(() => {
    const periods = Array.isArray(timeTrends?.periods) ? timeTrends.periods : [];
    const late = periods.find((p) => p && typeof p === "object" && /** @type {Record<string, unknown>} */ (p).key === "late");
    if (!late || typeof late !== "object") return 0;
    const n = numOrNull(/** @type {Record<string, unknown>} */ (late).deck_count);
    return n ?? 0;
  }, [timeTrends]);

  const trendTimeline = useMemo(() => {
    const rows = Array.isArray(timeTrends?.timeline) ? timeTrends.timeline : [];
    return rows
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const r = /** @type {Record<string, unknown>} */ (x);
        return {
          label: r.label != null ? String(r.label) : "",
          key: r.key != null ? String(r.key) : String(r.label ?? ""),
          deck_count: numOrNull(r.deck_count) ?? 0,
        };
      });
  }, [timeTrends]);

  const pitchColors = {
    1: "bg-red-500/75",
    2: "bg-yellow-400/80",
    3: "bg-sky-500/75",
    none: "bg-[#f4f0fa]/30",
  };

  const blockColors = {
    3: "bg-emerald-500/75",
    2: "bg-amber-500/75",
    1: "bg-orange-500/70",
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
        <label className="flex min-w-[14rem] flex-col gap-1">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Hero</span>
          <select
            className={selectCls}
            value={selectedHeroId ?? ""}
            disabled={loadingMeta || heroes.length === 0}
            onChange={(e) => setSelectedHeroId(Number.parseInt(e.target.value, 10) || null)}
          >
            {heroes.length === 0 ? (
              <option value="">No heroes</option>
            ) : (
              heroes.map((h) => (
                <option key={h.hero_id} value={h.hero_id}>
                  {h.hero_name} ({h.deck_count})
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      {loadingAnalytics || loadingMeta || (categoryTab === "build-styles" && loadingArchetypes) ? (
        <p className="m-0 mt-6 text-[0.875rem] text-[#f4f0fa]/65">Loading analytics…</p>
      ) : null}

      {!loadingAnalytics && analytics && deckCount === 0 ? (
        <p className="m-0 mt-6 text-[0.875rem] text-[#f4f0fa]/65">
          No decks for {selectedSet?.set_name ?? "this set"} / {selectedHero?.hero_name ?? "this hero"}.
        </p>
      ) : null}

      {!loadingAnalytics && analytics ? (
        <div className="mt-6 flex flex-col gap-4">
          <div
            className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-3"
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
                  className={`rounded-xl border px-5 py-2.5 text-[0.9375rem] font-semibold transition-colors ${
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

          {categoryTab === "distribution" && deckCount > 0 ? (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <StatTile title="Decks" value={String(deckCount)} />
                <StatTile title="Avg card cost / deck" value={fmtNum(analytics.avg_cost_per_deck)} />
                <StatTile title="Avg pitch / deck" value={fmtNum(analytics.avg_pitch_per_deck)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
                  <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Average Pitch Per Deck</h3>
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
                  <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Average Cost Per Deck</h3>
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

              <div className="grid gap-4 lg:grid-cols-2">
                <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
                  <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Average Card Type Per Deck</h3>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {avgDeckTypeBreakdown.length === 0 ? (
                      <p className="m-0 text-[0.82rem] text-[#f4f0fa]/55">No type data.</p>
                    ) : (
                      avgDeckTypeBreakdown.map((raw) => {
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

                <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
                  <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Average Block Per Deck</h3>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {avgDeckBlockBreakdown.length === 0 ? (
                      <p className="m-0 text-[0.82rem] text-[#f4f0fa]/55">No block data.</p>
                    ) : (
                      avgDeckBlockBreakdown.map((raw) => {
                        const b = /** @type {Record<string, unknown>} */ (raw);
                        const key = String(b.key ?? "");
                        const label = String(b.label ?? key);
                        const avgCount = numOrNull(b.avg_count) ?? 0;
                        const color = /** @type {Record<string, string>} */ (blockColors)[key] ?? "bg-violet-500/70";
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
              </div>
            </div>
          ) : null}

          {categoryTab === "distribution" && deckCount === 0 ? (
            <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No deck data for distribution stats.</p>
          ) : null}

          {categoryTab === "trends" && deckCount > 0 ? (
            <div className="flex flex-col gap-5">
              {!timeTrends?.available ? (
                <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
                  <p className="m-0 text-[0.875rem] text-[#f4f0fa]/75">
                    {timeTrends?.unavailable_reason != null
                      ? String(timeTrends.unavailable_reason)
                      : "Trend analysis requires dated Fabrary submissions."}
                  </p>
                  {timeTrends ? (
                    <p className="m-0 mt-2 text-[0.78rem] text-[#f4f0fa]/55">
                      {numOrNull(timeTrends.timed_deck_count) ?? 0} dated decks ·{" "}
                      {numOrNull(timeTrends.untimed_deck_count) ?? 0} without created date
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="m-0 text-[0.82rem] leading-snug text-[#f4f0fa]/65">
                    Decks split at the median Fabrary created time
                    {timeTrends.split_at != null ? ` (${fmtShortDate(String(timeTrends.split_at))})` : ""}. Pick rates
                    compare the first half of submissions (early) to the second half (late). Cards need at least{" "}
                    {numOrNull(timeTrends.min_deck_appearances) ?? 4} total appearances across both periods.
                  </p>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <StatTile
                      title="Dated decks"
                      value={String(numOrNull(timeTrends.timed_deck_count) ?? 0)}
                      hint={`${numOrNull(timeTrends.untimed_deck_count) ?? 0} without date`}
                    />
                    <StatTile title="Early period" value={String(trendEarlyDeckCount)} />
                    <StatTile title="Late period" value={String(trendLateDeckCount)} />
                  </div>

                  {trendTimeline.length > 0 ? (
                    <SubmissionTimelineChart buckets={trendTimeline} panelBorder={panelBorder} />
                  ) : null}

                  {Array.isArray(timeTrends.composition_trends) && timeTrends.composition_trends.length > 0 ? (
                    <div className={`rounded-xl border ${panelBorder} bg-black/20 p-4`}>
                      <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Deck composition shifts</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {timeTrends.composition_trends.map((raw) => {
                          if (!raw || typeof raw !== "object") return null;
                          const row = /** @type {Record<string, unknown>} */ (raw);
                          const label = row.label != null ? String(row.label) : String(row.metric ?? "Metric");
                          const early = numOrNull(row.early_value);
                          const late = numOrNull(row.late_value);
                          const delta = numOrNull(row.delta);
                          const deltaClass =
                            delta != null && delta > 0.001
                              ? "text-emerald-300/95"
                              : delta != null && delta < -0.001
                                ? "text-rose-300/95"
                                : "text-[#f4f0fa]/70";
                          return (
                            <div key={String(row.metric ?? label)} className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5">
                              <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50">
                                {label}
                              </p>
                              <p className="m-0 mt-1 text-[1rem] font-semibold tabular-nums text-[#f4f0fa]">
                                {late != null ? late.toFixed(2) : "—"}
                                <span className="ml-2 text-[0.75rem] font-normal text-[#f4f0fa]/55">
                                  early {early != null ? early.toFixed(2) : "—"}
                                </span>
                              </p>
                              {delta != null ? (
                                <p className={`m-0 mt-0.5 text-[0.78rem] tabular-nums ${deltaClass}`}>
                                  {delta > 0 ? "+" : ""}
                                  {delta.toFixed(2)} vs early
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-6 xl:grid-cols-2">
                    <CardTrendTable
                      title="Rising picks"
                      cards={Array.isArray(timeTrends.rising_picks) ? timeTrends.rising_picks : []}
                      earlyDeckCount={trendEarlyDeckCount}
                      lateDeckCount={trendLateDeckCount}
                      isLight={isLight}
                      onPreview={setImagePreview}
                      onCardClick={(card) => void openTrendCardModal(card)}
                    />
                    <CardTrendTable
                      title="Falling picks"
                      cards={Array.isArray(timeTrends.falling_picks) ? timeTrends.falling_picks : []}
                      earlyDeckCount={trendEarlyDeckCount}
                      lateDeckCount={trendLateDeckCount}
                      isLight={isLight}
                      onPreview={setImagePreview}
                      onCardClick={(card) => void openTrendCardModal(card)}
                    />
                  </div>
                </>
              )}
            </div>
          ) : null}

          {categoryTab === "trends" && deckCount === 0 ? (
            <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No deck data for trend analysis.</p>
          ) : null}

          {categoryTab === "build-styles" && deckCount > 0 && !loadingArchetypes ? (
            <BuildStylesPanel
              archetypes={archetypes}
              deckCount={deckCount}
              panelBorder={panelBorder}
              onPreview={setImagePreview}
            />
          ) : null}

          {categoryTab === "build-styles" && deckCount === 0 ? (
            <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No deck data for build style analysis.</p>
          ) : null}

          {categoryTab === "top-picks" && deckCount > 0 ? (
            <CardPickTable
              title="Most picked"
              cards={mostPickedCards}
              deckCount={deckCount}
              isLight={isLight}
              onPreview={setImagePreview}
              filterRarity={pickRarityFilter}
              onFilterRarityChange={setPickRarityFilter}
              rarityOptions={pickRarityOptions}
              filterType={pickTypeFilter}
              onFilterTypeChange={setPickTypeFilter}
              typeOptions={pickTypeOptions}
              selectCls={selectCls}
              pageIndex={topPickPageIndex}
              onPageChange={setTopPickPageIndex}
            />
          ) : null}

          {categoryTab === "top-picks" && deckCount === 0 ? (
            <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No deck data for pick stats.</p>
          ) : null}

          {categoryTab === "bottom-picks" && deckCount > 0 ? (
            <CardPickTable
              title="Least picked"
              cards={leastPickedCards}
              deckCount={deckCount}
              isLight={isLight}
              onPreview={setImagePreview}
              filterRarity={pickRarityFilter}
              onFilterRarityChange={setPickRarityFilter}
              rarityOptions={pickRarityOptions}
              filterType={pickTypeFilter}
              onFilterTypeChange={setPickTypeFilter}
              typeOptions={pickTypeOptions}
              selectCls={selectCls}
              pageIndex={bottomPickPageIndex}
              onPageChange={setBottomPickPageIndex}
            />
          ) : null}

          {categoryTab === "bottom-picks" && deckCount === 0 ? (
            <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No deck data for pick stats.</p>
          ) : null}

          {categoryTab === "sideboard" && deckCount > 0 ? (
            <SideboardTopTable
              cards={topSideboardCards}
              deckCount={deckCount}
              isLight={isLight}
              onPreview={setImagePreview}
            />
          ) : null}

          {categoryTab === "sideboard" && deckCount === 0 ? (
            <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No deck data for sideboard stats.</p>
          ) : null}

          {categoryTab === "decklists" ? (
            <DecklistsTable
              decks={decklists}
              loading={loadingDecklists}
              pageIndex={decklistPageIndex}
              onPageChange={setDecklistPageIndex}
              onOpenDeck={(id) => void openDeckModal(id)}
              isLight={isLight}
            />
          ) : null}
        </div>
      ) : null}

      {trendCardModalOpen && trendCardModalMeta ? (
        <CardTrendPickModal
          cardName={trendCardModalMeta.name}
          imageUrl={trendCardModalMeta.imageUrl}
          loading={trendCardModalLoading}
          error={trendCardModalError}
          timeline={trendCardModalTimeline}
          isLight={isLight}
          onClose={closeTrendCardModal}
        />
      ) : null}

      {deckModalOpen && deckModalMeta ? (
        <DeckDetailModal
          deckName={deckModalMeta.name}
          ownerLabel={deckModalMeta.ownerLabel}
          fabraryLink={deckModalMeta.fabraryLink}
          sections={deckModalSections ?? { heroArena: [], deck: [], inventory: [], tokens: [] }}
          loading={deckModalLoading}
          error={deckModalError}
          isLight={isLight}
          onClose={closeDeckModal}
        />
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
