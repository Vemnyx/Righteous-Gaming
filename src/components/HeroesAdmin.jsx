import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { CARD_CLASS_NAMES } from "../constants/cardClass";
import { CARD_HERO_NAMES, cardHeroName } from "../constants/cardHero";
import { CARD_TALENT_NAMES } from "../constants/cardTalent";
import {
  PORTRAIT_BANNER,
  bannerRectForCenter,
  clickToNormalizedImagePoint,
} from "../utils/heroCropPreview";

/**
 * @typedef {{
 *   id: number,
 *   name: string,
 *   type: number,
 *   young: boolean,
 *   classes: number[],
 *   talents: number[],
 *   card_id?: number | null,
 *   card_identifier?: string | null,
 *   card_image_url?: string | null,
 *   art_image_url?: string | null,
 *   crop_center_x?: number | null,
 *   crop_center_y?: number | null,
 * }} HeroAdminRow
 */

/**
 * @typedef {{
 *   card_id: number,
 *   name: string,
 *   card_identifier?: string | null,
 *   type?: number | null,
 *   young: boolean,
 *   classes: number[],
 *   talents: number[],
 *   card_image_url?: string | null,
 *   eligible: boolean,
 *   skip_reason?: string,
 * }} MissingHeroCard
 */

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
 * @param {unknown} value
 * @returns {number[]}
 */
function asInt16Array(value) {
  if (!Array.isArray(value)) return [];
  /** @type {number[]} */
  const out = [];
  for (const item of value) {
    const n = typeof item === "number" ? item : Number(item);
    if (Number.isInteger(n)) out.push(n);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {HeroAdminRow | null}
 */
function normalizeHeroRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const h = /** @type {Record<string, unknown>} */ (raw);
  if (typeof h.id !== "number") return null;
  return {
    id: h.id,
    name: String(h.name ?? "").trim() || `Hero #${h.id}`,
    type: typeof h.type === "number" ? h.type : Number(h.type) || 0,
    young: Boolean(h.young),
    classes: asInt16Array(h.classes),
    talents: asInt16Array(h.talents),
    card_id: typeof h.card_id === "number" ? h.card_id : null,
    card_identifier: h.card_identifier != null ? String(h.card_identifier) : null,
    card_image_url: h.card_image_url != null ? String(h.card_image_url) : null,
    art_image_url: h.art_image_url != null ? String(h.art_image_url) : null,
    crop_center_x: typeof h.crop_center_x === "number" ? h.crop_center_x : null,
    crop_center_y: typeof h.crop_center_y === "number" ? h.crop_center_y : null,
  };
}

/**
 * @param {HeroAdminRow | null | undefined} hero
 * @returns {{ x: number, y: number }}
 */
function defaultCropCenter(hero) {
  if (hero?.crop_center_x != null && hero?.crop_center_y != null) {
    return { x: hero.crop_center_x, y: hero.crop_center_y };
  }
  return { x: 0.5, y: PORTRAIT_BANNER.fallbackCenterY };
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function HeroesAdmin({ isLight, active }) {
  const { user } = useAuth();
  const editTitleId = useId();
  const [rows, setRows] = useState(/** @type {HeroAdminRow[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [missingCards, setMissingCards] = useState(/** @type {MissingHeroCard[]} */ ([]));
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingError, setMissingError] = useState(/** @type {string | null} */ (null));
  const [creatingCardIds, setCreatingCardIds] = useState(/** @type {number[]} */ ([]));
  const [createBanner, setCreateBanner] = useState(/** @type {string | null} */ (null));

  const [editingHero, setEditingHero] = useState(/** @type {HeroAdminRow | null} */ (null));
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState(0);
  const [editYoung, setEditYoung] = useState(false);
  const [editClasses, setEditClasses] = useState(/** @type {number[]} */ ([]));
  const [editTalents, setEditTalents] = useState(/** @type {number[]} */ ([]));
  const [editCardId, setEditCardId] = useState("");
  const [editCardImageUrl, setEditCardImageUrl] = useState("");
  const [editArtImageUrl, setEditArtImageUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(/** @type {string | null} */ (null));

  const [cropHero, setCropHero] = useState(/** @type {HeroAdminRow | null} */ (null));
  const [cropCenter, setCropCenter] = useState(/** @type {{ x: number, y: number } | null} */ (null));
  const [cropSaving, setCropSaving] = useState(false);
  const [cropError, setCropError] = useState(/** @type {string | null} */ (null));
  const cardImgRef = useRef(/** @type {HTMLImageElement | null} */ (null));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/heroes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.heroes) ? data.heroes : [];
      /** @type {HeroAdminRow[]} */
      const next = [];
      for (const h of list) {
        const row = normalizeHeroRow(h);
        if (row) next.push(row);
      }
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load heroes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMissing = useCallback(async () => {
    if (!user) return;
    setMissingLoading(true);
    setMissingError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/heroes/missing-cards", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.cards) ? data.cards : [];
      /** @type {MissingHeroCard[]} */
      const next = [];
      for (const c of list) {
        if (!c || typeof c.card_id !== "number") continue;
        next.push({
          card_id: c.card_id,
          name: String(c.name ?? "").trim() || `Card #${c.card_id}`,
          card_identifier: c.card_identifier != null ? String(c.card_identifier) : null,
          type: typeof c.type === "number" ? c.type : null,
          young: Boolean(c.young),
          classes: asInt16Array(c.classes),
          talents: asInt16Array(c.talents),
          card_image_url: c.card_image_url != null ? String(c.card_image_url) : null,
          eligible: Boolean(c.eligible),
          skip_reason: c.skip_reason != null ? String(c.skip_reason) : undefined,
        });
      }
      setMissingCards(next);
    } catch (e) {
      setMissingError(e instanceof Error ? e.message : "Failed to load missing hero cards");
      setMissingCards([]);
    } finally {
      setMissingLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    void (async () => {
      await Promise.all([load(), loadMissing()]);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, load, loadMissing, reloadSeq]);

  const eligibleMissing = useMemo(() => missingCards.filter((c) => c.eligible), [missingCards]);
  const creatingAny = creatingCardIds.length > 0;

  const createFromCards = useCallback(
    /** @param {number[] | null} cardIds */
    async (cardIds) => {
      if (!user || creatingAny) return;
      const ids = cardIds && cardIds.length > 0 ? cardIds : eligibleMissing.map((c) => c.card_id);
      if (ids.length === 0) return;
      setCreatingCardIds(ids);
      setCreateBanner(null);
      setMissingError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/heroes/from-cards", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ card_ids: ids }),
        });
        const errText = await res.text();
        if (!res.ok) throw new Error(parseApiError(errText));
        const data = JSON.parse(errText);
        const createdRaw = Array.isArray(data.created) ? data.created : [];
        const skippedRaw = Array.isArray(data.skipped) ? data.skipped : [];
        /** @type {HeroAdminRow[]} */
        const created = [];
        for (const h of createdRaw) {
          const row = normalizeHeroRow(h);
          if (row) created.push(row);
        }
        if (created.length > 0) {
          setRows((prev) => {
            const byId = new Map(prev.map((r) => [r.id, r]));
            for (const row of created) byId.set(row.id, row);
            return Array.from(byId.values()).sort((a, b) =>
              a.name.localeCompare(b.name) || a.id - b.id,
            );
          });
        }
        await loadMissing();
        const skippedCount = skippedRaw.length;
        setCreateBanner(
          skippedCount > 0
            ? `Created ${created.length} hero${created.length === 1 ? "" : "es"}; skipped ${skippedCount}.`
            : `Created ${created.length} hero${created.length === 1 ? "" : "es"}.`,
        );
      } catch (e) {
        setMissingError(e instanceof Error ? e.message : "Failed to create heroes");
      } finally {
        setCreatingCardIds([]);
      }
    },
    [user, creatingAny, eligibleMissing, loadMissing],
  );
  const openEdit = useCallback((/** @type {HeroAdminRow} */ hero) => {
    setEditingHero(hero);
    setEditName(hero.name);
    setEditType(hero.type);
    setEditYoung(Boolean(hero.young));
    setEditClasses([...hero.classes]);
    setEditTalents([...hero.talents]);
    setEditCardId(hero.card_id != null ? String(hero.card_id) : "");
    setEditCardImageUrl(hero.card_image_url ?? "");
    setEditArtImageUrl(hero.art_image_url ?? "");
    setEditError(null);
    setEditSaving(false);
  }, []);

  const closeEdit = useCallback(() => {
    if (editSaving) return;
    setEditingHero(null);
    setEditError(null);
  }, [editSaving]);

  const openCrop = useCallback((/** @type {HeroAdminRow} */ hero) => {
    setCropHero(hero);
    setCropCenter(defaultCropCenter(hero));
    setCropError(null);
    setCropSaving(false);
  }, []);

  const closeCrop = useCallback(() => {
    if (cropSaving) return;
    setCropHero(null);
    setCropCenter(null);
    setCropError(null);
  }, [cropSaving]);

  useEffect(() => {
    if (!editingHero && !cropHero) return undefined;
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      if (cropHero && !cropSaving) {
        closeCrop();
        return;
      }
      if (editingHero && !editSaving) closeEdit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingHero, cropHero, editSaving, cropSaving, closeEdit, closeCrop]);

  const cropPreviewRect = useMemo(() => {
    if (!cropCenter) return null;
    return bannerRectForCenter(cropCenter.x, cropCenter.y);
  }, [cropCenter]);

  const handleCardClick = useCallback(
    (/** @type {React.MouseEvent<HTMLImageElement>} */ e) => {
      const img = cardImgRef.current;
      if (!img) return;
      const pt = clickToNormalizedImagePoint(e, img);
      if (!pt) return;
      setCropCenter(pt);
      setCropError(null);
    },
    [],
  );

  const toggleClass = useCallback((/** @type {number} */ id) => {
    setEditClasses((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b)));
  }, []);

  const toggleTalent = useCallback((/** @type {number} */ id) => {
    setEditTalents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b)));
  }, []);

  const saveEdit = useCallback(async () => {
    if (!user || !editingHero || editSaving) return;
    const name = editName.trim();
    if (!name) {
      setEditError("Name is required");
      return;
    }
    const cardIdRaw = editCardId.trim();
    /** @type {number | null} */
    let cardId = null;
    if (cardIdRaw !== "") {
      const n = Number(cardIdRaw);
      if (!Number.isInteger(n) || n <= 0) {
        setEditError("Card ID must be a positive integer or empty");
        return;
      }
      cardId = n;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/heroes/${editingHero.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          type: editType,
          young: editYoung,
          classes: editClasses,
          talents: editTalents,
          card_id: cardId,
          card_image_url: editCardImageUrl.trim() || null,
          art_image_url: editArtImageUrl.trim() || null,
        }),
      });
      const errText = await res.text();
      if (!res.ok) throw new Error(parseApiError(errText));
      const updated = normalizeHeroRow(JSON.parse(errText));
      if (!updated) throw new Error("Invalid response");
      setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setEditingHero(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save hero");
    } finally {
      setEditSaving(false);
    }
  }, [
    user,
    editingHero,
    editSaving,
    editName,
    editType,
    editYoung,
    editClasses,
    editTalents,
    editCardId,
    editCardImageUrl,
    editArtImageUrl,
  ]);

  const saveRecrop = useCallback(async () => {
    if (!user || !cropHero || !cropCenter) return;
    setCropSaving(true);
    setCropError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/heroes/${cropHero.id}/recrop-art`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ center_x: cropCenter.x, center_y: cropCenter.y }),
      });
      const errText = await res.text();
      if (!res.ok) throw new Error(parseApiError(errText));
      const data = JSON.parse(errText);
      const updated = normalizeHeroRow(data?.hero);
      if (updated) {
        setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
      } else {
        setReloadSeq((n) => n + 1);
      }
      setCropSaving(false);
      setCropHero(null);
      setCropCenter(null);
      setCropError(null);
    } catch (e) {
      setCropError(e instanceof Error ? e.message : "Failed to save crop");
      setCropSaving(false);
    }
  }, [user, cropHero, cropCenter]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";
  const tableChromeBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";
  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";
  const inputCls =
    "w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55 disabled:opacity-60";
  const chipIdle =
    "rounded-md border border-white/[0.2] bg-black/25 px-2 py-1 text-[0.72rem] font-medium text-[#f4f0fa]/75 hover:border-white/35";
  const chipActive =
    "rounded-md border border-[rgba(152,117,207,0.75)] bg-gradient-to-b from-[#7b4cb8]/85 to-[#5a2f8f]/85 px-2 py-1 text-[0.72rem] font-semibold text-white";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div>
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Heroes</h2>
        <p className="m-0 mt-2 max-w-2xl text-left text-[0.85rem] leading-snug text-[#f4f0fa]/70">
          Click a row to edit hero details. Use Crop to adjust the portrait strip from the full card art.
        </p>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button type="button" className={`mt-3 ${btnBase} ${btnTheme}`} onClick={() => setReloadSeq((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      <div className={`rounded-xl border bg-black/20 ${tableChromeBorder}`}>
        <div className="flex flex-col gap-3 border-b border-white/[0.1] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="m-0 text-[0.95rem] font-semibold text-[#f4f0fa]">Missing hero cards</h3>
            <p className="m-0 mt-1 text-[0.8rem] text-[#f4f0fa]/65">
              Catalog Hero cards with no linked heroes row yet.
              {missingLoading
                ? " Loading…"
                : ` ${eligibleMissing.length} ready to create${
                    missingCards.length > eligibleMissing.length
                      ? ` · ${missingCards.length - eligibleMissing.length} skipped`
                      : ""
                  }.`}
            </p>
          </div>
          <button
            type="button"
            className={`shrink-0 self-start ${btnPrimary}`}
            disabled={creatingAny || missingLoading || eligibleMissing.length === 0}
            onClick={() => void createFromCards(null)}
          >
            {creatingAny && creatingCardIds.length > 1 ? "Creating…" : "Create all missing"}
          </button>
        </div>

        {createBanner ? (
          <p className="m-0 border-b border-white/[0.08] px-4 py-2.5 text-[0.8rem] text-emerald-200/90">{createBanner}</p>
        ) : null}

        {missingError ? (
          <p className="m-0 border-b border-white/[0.08] px-4 py-2.5 text-[0.8rem] text-red-200/95" role="alert">
            {missingError}
          </p>
        ) : null}

        {missingLoading && missingCards.length === 0 ? (
          <p className="m-0 px-4 py-6 text-center text-[0.85rem] text-[#f4f0fa]/55">Checking catalog…</p>
        ) : missingCards.length === 0 ? (
          <p className="m-0 px-4 py-6 text-center text-[0.85rem] text-[#f4f0fa]/55">
            Every Hero card already has a heroes row.
          </p>
        ) : (
          <div className="max-h-[16rem] overflow-y-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
              <thead className="sticky top-0 bg-[rgba(28,22,40,0.98)] backdrop-blur-sm">
                <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
                  <th className="px-3 py-2 font-semibold sm:px-4">Card</th>
                  <th className="px-3 py-2 font-semibold sm:px-4">Type</th>
                  <th className="px-3 py-2 font-semibold sm:px-4">Age</th>
                  <th className="px-3 py-2 font-semibold sm:px-4">Status</th>
                  <th className="px-3 py-2 font-semibold sm:px-4"> </th>
                </tr>
              </thead>
              <tbody>
                {missingCards.map((card) => {
                  const busy = creatingCardIds.includes(card.card_id);
                  return (
                    <tr key={card.card_id} className={`border-b ${tableRowBorder} last:border-b-0`}>
                      <td className="px-3 py-2 sm:px-4">
                        <div className="font-medium text-[#f4f0fa]">{card.name}</div>
                        <div className="font-mono text-[0.7rem] text-[#f4f0fa]/45">
                          #{card.card_id}
                          {card.card_identifier ? ` · ${card.card_identifier}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[#f4f0fa]/75 sm:px-4">
                        {card.type != null ? (cardHeroName(card.type) ?? `Type ${card.type}`) : "—"}
                      </td>
                      <td className="px-3 py-2 text-[#f4f0fa]/75 sm:px-4">{card.young ? "Young" : "Adult"}</td>
                      <td className="px-3 py-2 text-[0.75rem] sm:px-4">
                        {card.eligible ? (
                          <span className="text-emerald-200/85">Ready</span>
                        ) : (
                          <span className="text-amber-200/85">{card.skip_reason || "Skipped"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 sm:px-4">
                        <button
                          type="button"
                          className={`${btnBase} ${btnTheme}`}
                          disabled={!card.eligible || creatingAny}
                          onClick={() => void createFromCards([card.card_id])}
                        >
                          {busy ? "Creating…" : "Create"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`overflow-x-auto rounded-xl border bg-black/20 ${tableChromeBorder}`}>
        <table className="w-full min-w-[40rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Art</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Hero</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Type</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Age</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Crop center</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4"> </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  No heroes found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  title="Edit hero"
                  className={`cursor-pointer border-b transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.08] focus-visible:outline-none ${tableRowBorder} last:border-b-0`}
                  onClick={() => openEdit(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEdit(row);
                    }
                  }}
                >
                  <td className="px-3 py-2 sm:px-4">
                    {row.art_image_url ? (
                      <img
                        src={row.art_image_url}
                        alt=""
                        className="h-10 max-w-[10rem] rounded object-contain object-left"
                        draggable={false}
                      />
                    ) : (
                      <span className="text-[#f4f0fa]/45">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 sm:px-4">{row.name}</td>
                  <td className="px-3 py-2.5 text-[#f4f0fa]/75 sm:px-4">
                    {cardHeroName(row.type) ?? `Type ${row.type}`}
                  </td>
                  <td className="px-3 py-2.5 text-[#f4f0fa]/75 sm:px-4">{row.young ? "Young" : "Adult"}</td>
                  <td className="px-3 py-2.5 font-mono text-[0.75rem] text-[#f4f0fa]/60 sm:px-4">
                    {row.crop_center_x != null && row.crop_center_y != null
                      ? `${(row.crop_center_x * 100).toFixed(0)}%, ${(row.crop_center_y * 100).toFixed(0)}%`
                      : "Auto"}
                  </td>
                  <td className="px-3 py-2 sm:px-4">
                    <button
                      type="button"
                      className={`${btnBase} ${btnTheme}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCrop(row);
                      }}
                    >
                      Crop
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingHero && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !editSaving) closeEdit();
              }}
            >
              <div
                className={`relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={editTitleId}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-white/[0.1] px-5 py-4">
                  <h3 id={editTitleId} className="m-0 text-lg font-semibold text-[#f4f0fa]">
                    Edit hero
                  </h3>
                  <p className="m-0 mt-1.5 text-[0.82rem] leading-snug text-[#f4f0fa]/65">
                    Update matching name, type, age, and linked card fields for this row.
                  </p>
                </div>

                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      ID
                    </span>
                    <input type="text" className={inputCls} value={String(editingHero.id)} disabled readOnly />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Name
                    </span>
                    <input
                      type="text"
                      className={inputCls}
                      value={editName}
                      maxLength={100}
                      disabled={editSaving}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Type
                    </span>
                    <select
                      className={inputCls}
                      value={editType}
                      disabled={editSaving}
                      onChange={(e) => setEditType(Number(e.target.value))}
                    >
                      {CARD_HERO_NAMES.map((label, id) => (
                        <option key={id} value={id}>
                          {label} ({id})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-2.5 text-[0.875rem] text-[#f4f0fa]/9">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-white/30 bg-black/40"
                      checked={editYoung}
                      disabled={editSaving}
                      onChange={(e) => setEditYoung(e.target.checked)}
                    />
                    Young hero
                  </label>

                  <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="mb-1.5 px-0 text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Classes
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_CLASS_NAMES.map((label, id) => (
                        <button
                          key={id}
                          type="button"
                          disabled={editSaving}
                          className={editClasses.includes(id) ? chipActive : chipIdle}
                          onClick={() => toggleClass(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="mb-1.5 px-0 text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Talents
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_TALENT_NAMES.map((label, id) => (
                        <button
                          key={id}
                          type="button"
                          disabled={editSaving}
                          className={editTalents.includes(id) ? chipActive : chipIdle}
                          onClick={() => toggleTalent(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Card ID
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={inputCls}
                      value={editCardId}
                      placeholder="Optional catalog card id"
                      disabled={editSaving}
                      onChange={(e) => setEditCardId(e.target.value)}
                    />
                    {editingHero.card_identifier ? (
                      <span className="text-[0.75rem] text-[#f4f0fa]/5">
                        Linked identifier: {editingHero.card_identifier}
                      </span>
                    ) : null}
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Card image URL
                    </span>
                    <input
                      type="url"
                      className={inputCls}
                      value={editCardImageUrl}
                      disabled={editSaving}
                      onChange={(e) => setEditCardImageUrl(e.target.value)}
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Art image URL
                    </span>
                    <input
                      type="url"
                      className={inputCls}
                      value={editArtImageUrl}
                      disabled={editSaving}
                      onChange={(e) => setEditArtImageUrl(e.target.value)}
                    />
                  </label>

                  {editError ? (
                    <p className="m-0 text-[0.85rem] text-red-200/95" role="alert">
                      {editError}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.1] px-5 py-4">
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    disabled={editSaving}
                    onClick={() => {
                      const hero = editingHero;
                      closeEdit();
                      openCrop(hero);
                    }}
                  >
                    Adjust crop…
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`${btnBase} ${btnTheme}`} disabled={editSaving} onClick={closeEdit}>
                      Cancel
                    </button>
                    <button type="button" className={btnPrimary} disabled={editSaving} onClick={() => void saveEdit()}>
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {cropHero && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !cropSaving) closeCrop();
              }}
            >
              <div
                className={`relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="hero-crop-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-white/[0.1] px-5 py-4">
                  <h3 id="hero-crop-modal-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                    {cropHero.name}
                  </h3>
                  <p className="m-0 mt-1.5 text-[0.82rem] leading-snug text-[#f4f0fa]/65">
                    Click the card art to set the crop center. The green box shows the portrait strip that will be
                    saved.
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {cropHero.card_image_url ? (
                    <div className="relative mx-auto w-fit max-w-full">
                      <img
                        ref={cardImgRef}
                        src={cropHero.card_image_url}
                        alt={cropHero.name}
                        className="block h-auto max-h-[min(60vh,28rem)] w-auto max-w-[min(100%,20rem)] cursor-crosshair"
                        draggable={false}
                        onClick={handleCardClick}
                      />
                      {cropPreviewRect && cropCenter ? (
                        <>
                          <div
                            className="pointer-events-none absolute rounded-sm border-2 border-emerald-400/90 bg-emerald-400/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
                            style={{
                              left: `${cropPreviewRect.x * 100}%`,
                              top: `${cropPreviewRect.y * 100}%`,
                              width: `${cropPreviewRect.w * 100}%`,
                              height: `${cropPreviewRect.h * 100}%`,
                            }}
                          />
                          <div
                            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
                            style={{
                              left: `${cropCenter.x * 100}%`,
                              top: `${cropCenter.y * 100}%`,
                            }}
                          />
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No card image available for this hero.</p>
                  )}

                  {cropCenter ? (
                    <p className="mb-0 mt-3 text-center font-mono text-[0.75rem] text-[#f4f0fa]/55">
                      Center: {(cropCenter.x * 100).toFixed(1)}%, {(cropCenter.y * 100).toFixed(1)}%
                    </p>
                  ) : null}

                  {cropError ? (
                    <p className="mt-3 text-[0.85rem] text-red-200/95" role="alert">
                      {cropError}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.1] px-5 py-4">
                  <button type="button" className={`${btnBase} ${btnTheme}`} disabled={cropSaving} onClick={closeCrop}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={cropSaving || !cropCenter || !cropHero.card_image_url}
                    onClick={() => void saveRecrop()}
                  >
                    {cropSaving ? "Saving…" : "Save & re-crop"}
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
