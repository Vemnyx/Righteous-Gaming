import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { CARD_CLASS_NAMES } from "../constants/cardClass";
import { CARD_FORMAT_NAMES } from "../constants/cardFormat";
import { CARD_FUSION_NAMES } from "../constants/cardFusion";
import { CARD_HERO_NAMES } from "../constants/cardHero";
import { CARD_KEYWORD_NAMES } from "../constants/cardKeyword";
import { CARD_RARITY_NAMES } from "../constants/cardRarity";
import { CARD_SUBTYPE_TOKENS } from "../constants/cardSubtype";
import { CARD_TALENT_NAMES } from "../constants/cardTalent";
import { CARD_TYPE_NAMES } from "../constants/cardType";
import { cardImageUrl } from "../utils/cardPrintings";
import { CardsCatalog } from "./CardsCatalog";

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
    if (j && typeof j.error === "string" && j.error.trim() !== "") return j.error.trim();
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
 * @param {number[] | null | undefined} ids
 * @returns {string}
 */
function idsToCsv(ids) {
  if (!ids || ids.length === 0) return "";
  return ids.join(", ");
}

/**
 * @param {string} raw
 * @returns {{ ok: true, ids: number[] } | { ok: false, message: string }}
 */
function parseIdCsv(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, ids: [] };
  /** @type {number[]} */
  const ids = [];
  for (const part of text.split(/[\s,]+/)) {
    if (part === "") continue;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, message: `Invalid id "${part}"` };
    }
    ids.push(n);
  }
  return { ok: true, ids };
}

/**
 * @param {unknown} card
 */
function emptyFormFromCard(card) {
  const c = card && typeof card === "object" ? /** @type {Record<string, unknown>} */ (card) : {};
  const printings = Array.isArray(c.printings) ? c.printings : [];
  const primary = printings[0] && typeof printings[0] === "object" ? /** @type {Record<string, unknown>} */ (printings[0]) : {};
  return {
    set_id: typeof c.set_id === "number" ? c.set_id : 0,
    name: String(c.name ?? ""),
    card_identifier: c.card_identifier != null ? String(c.card_identifier) : "",
    functional_text: c.functional_text != null ? String(c.functional_text) : "",
    type: typeof c.type === "number" ? c.type : 0,
    hybrid: Boolean(c.hybrid),
    pitch: c.pitch != null && c.pitch !== "" ? String(c.pitch) : "",
    cost: c.cost != null && c.cost !== "" ? String(c.cost) : "",
    power: c.power != null && c.power !== "" ? String(c.power) : "",
    block: c.block != null && c.block !== "" ? String(c.block) : "",
    life: c.life != null && c.life !== "" ? String(c.life) : "",
    intellect: c.intellect != null && c.intellect !== "" ? String(c.intellect) : "",
    classes: asInt16Array(c.classes),
    talents: asInt16Array(c.talents),
    formats: asInt16Array(c.formats),
    fusions: asInt16Array(c.fusions),
    subtypesCsv: idsToCsv(asInt16Array(c.subtypes)),
    heroesCsv: idsToCsv(asInt16Array(c.heroes)),
    keywordsCsv: idsToCsv(asInt16Array(c.keywords)),
    specializationsCsv: idsToCsv(asInt16Array(c.specializations)),
    set_code: String(c.set_code ?? primary.set_code ?? ""),
    set_num: c.set_num != null ? String(c.set_num) : primary.set_num != null ? String(primary.set_num) : "",
    rarity:
      c.rarity != null && c.rarity !== ""
        ? String(c.rarity)
        : primary.rarity != null && primary.rarity !== ""
          ? String(primary.rarity)
          : "",
    image_url:
      (typeof c.image_url === "string" && c.image_url) ||
      (typeof primary.image_url === "string" && primary.image_url) ||
      cardImageUrl(/** @type {any} */ (c)) ||
      "",
  };
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CardsAdmin({ isLight, active }) {
  const { user } = useAuth();
  const titleId = useId();
  const [catalogKey, setCatalogKey] = useState(0);
  const [editingId, setEditingId] = useState(/** @type {number | null} */ (null));
  const [form, setForm] = useState(() => emptyFormFromCard(null));
  const [sets, setSets] = useState(/** @type {{ id: number, name: string, code: string }[]} */ ([]));
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const loadSets = useCallback(async () => {
    try {
      const res = await fetch("/api/sets");
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      /** @type {{ id: number, name: string, code: string }[]} */
      const next = [];
      for (const s of list) {
        if (!s || typeof s.id !== "number") continue;
        next.push({
          id: s.id,
          name: String(s.name ?? "").trim() || `Set ${s.id}`,
          code: String(s.code ?? "").trim(),
        });
      }
      next.sort((a, b) => a.name.localeCompare(b.name));
      setSets(next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    void loadSets();
    return undefined;
  }, [active, loadSets]);

  const closeEdit = useCallback(() => {
    if (saving) return;
    setEditingId(null);
    setError(null);
  }, [saving]);

  useEffect(() => {
    if (editingId == null) return undefined;
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.key === "Escape" && !saving) closeEdit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, saving, closeEdit]);

  const openEdit = useCallback(
    async (/** @type {{ id: number }} */ card) => {
      if (!user || typeof card?.id !== "number") return;
      setEditingId(card.id);
      setForm(emptyFormFromCard(card));
      setError(null);
      setLoadingDetail(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/cards/${card.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setForm(emptyFormFromCard(data));
        }
      } catch {
        /* keep catalog snapshot */
      } finally {
        setLoadingDetail(false);
      }
    },
    [user],
  );

  const toggleId = useCallback((/** @type {'classes' | 'talents' | 'formats' | 'fusions'} */ key, id) => {
    setForm((prev) => {
      const cur = prev[key];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].sort((a, b) => a - b);
      return { ...prev, [key]: next };
    });
  }, []);

  const setField = useCallback((/** @type {string} */ key, /** @type {string | boolean | number} */ value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  /**
   * @param {string} raw
   * @returns {number | null}
   */
  function optionalInt(raw) {
    const t = String(raw ?? "").trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isInteger(n)) return NaN;
    return n;
  }

  const saveEdit = useCallback(async () => {
    if (!user || editingId == null || saving) return;
    const name = form.name.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    if (!form.set_id) {
      setError("Set is required");
      return;
    }
    const setCode = form.set_code.trim();
    if (!setCode) {
      setError("Set code is required");
      return;
    }
    const setNum = optionalInt(form.set_num);
    if (setNum == null || Number.isNaN(setNum) || setNum < 0) {
      setError("Set number must be a non-negative integer");
      return;
    }
    const pitch = optionalInt(form.pitch);
    const cost = optionalInt(form.cost);
    const power = optionalInt(form.power);
    const block = optionalInt(form.block);
    const life = optionalInt(form.life);
    const intellect = optionalInt(form.intellect);
    for (const [label, v] of [
      ["Pitch", pitch],
      ["Cost", cost],
      ["Power", power],
      ["Block", block],
      ["Life", life],
      ["Intellect", intellect],
    ]) {
      if (Number.isNaN(v)) {
        setError(`${label} must be an integer or empty`);
        return;
      }
    }
    const rarityRaw = form.rarity.trim();
    /** @type {number | null} */
    let rarity = null;
    if (rarityRaw !== "") {
      rarity = Number(rarityRaw);
      if (!Number.isInteger(rarity) || rarity < 0) {
        setError("Rarity is invalid");
        return;
      }
    }
    const subtypes = parseIdCsv(form.subtypesCsv);
    if (!subtypes.ok) {
      setError(`Subtypes: ${subtypes.message}`);
      return;
    }
    const heroes = parseIdCsv(form.heroesCsv);
    if (!heroes.ok) {
      setError(`Heroes: ${heroes.message}`);
      return;
    }
    const keywords = parseIdCsv(form.keywordsCsv);
    if (!keywords.ok) {
      setError(`Keywords: ${keywords.message}`);
      return;
    }
    const specializations = parseIdCsv(form.specializationsCsv);
    if (!specializations.ok) {
      setError(`Specializations: ${specializations.message}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/cards/${editingId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          set_id: form.set_id,
          name,
          card_identifier: form.card_identifier.trim() || null,
          functional_text: form.functional_text.trim() || null,
          image_url: form.image_url.trim() || null,
          rarity,
          set_code: setCode,
          set_num: setNum,
          type: form.type,
          subtypes: subtypes.ids,
          classes: form.classes,
          hybrid: form.hybrid,
          talents: form.talents,
          pitch,
          cost,
          power,
          block,
          heroes: heroes.ids,
          life,
          intellect,
          keywords: keywords.ids,
          formats: form.formats,
          specializations: specializations.ids,
          fusions: form.fusions,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(parseApiError(text));
      setEditingId(null);
      setCatalogKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save card");
    } finally {
      setSaving(false);
    }
  }, [user, editingId, saving, form]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";
  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";
  const inputCls =
    "w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55 disabled:opacity-60";
  const chipIdle =
    "rounded-md border border-white/[0.2] bg-black/25 px-2 py-1 text-[0.72rem] font-medium text-[#f4f0fa]/75 hover:border-white/35";
  const chipActive =
    "rounded-md border border-[rgba(152,117,207,0.75)] bg-gradient-to-b from-[#7b4cb8]/85 to-[#5a2f8f]/85 px-2 py-1 text-[0.72rem] font-semibold text-white";

  const subtypeHint = useMemo(
    () =>
      CARD_SUBTYPE_TOKENS.map((t, i) => `${i}=${t}`)
        .slice(0, 8)
        .join(", ") + "…",
    [],
  );

  return (
    <div className="flex w-full flex-1 flex-col gap-3">
      <div className="px-1 sm:px-2">
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Cards</h2>
        <p className="m-0 mt-2 max-w-2xl text-left text-[0.85rem] leading-snug text-[#f4f0fa]/70">
          Same catalog as Resources → Cards. Click a card to edit its database row instead of opening the image.
        </p>
      </div>

      <CardsCatalog key={catalogKey} isLight={isLight} active={active} onAdminEditCard={openEdit} />

      {editingId != null && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !saving) closeEdit();
              }}
            >
              <div
                className={`relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-white/[0.1] px-5 py-4">
                  <h3 id={titleId} className="m-0 text-lg font-semibold text-[#f4f0fa]">
                    Edit card #{editingId}
                  </h3>
                  <p className="m-0 mt-1.5 text-[0.82rem] leading-snug text-[#f4f0fa]/65">
                    Update catalog fields. Array IDs can be comma-separated (see hints).
                    {loadingDetail ? " Loading latest…" : ""}
                  </p>
                </div>

                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        Name
                      </span>
                      <input
                        className={inputCls}
                        value={form.name}
                        disabled={saving}
                        onChange={(e) => setField("name", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        Card identifier
                      </span>
                      <input
                        className={inputCls}
                        value={form.card_identifier}
                        disabled={saving}
                        onChange={(e) => setField("card_identifier", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        Set
                      </span>
                      <select
                        className={inputCls}
                        value={form.set_id}
                        disabled={saving}
                        onChange={(e) => setField("set_id", Number(e.target.value))}
                      >
                        <option value={0}>Select set…</option>
                        {sets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        Type
                      </span>
                      <select
                        className={inputCls}
                        value={form.type}
                        disabled={saving}
                        onChange={(e) => setField("type", Number(e.target.value))}
                      >
                        {CARD_TYPE_NAMES.map((label, id) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2.5 self-end pb-2 text-[0.875rem] text-[#f4f0fa]/9">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-white/30 bg-black/40"
                        checked={form.hybrid}
                        disabled={saving}
                        onChange={(e) => setField("hybrid", e.target.checked)}
                      />
                      Hybrid
                    </label>
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Functional text
                    </span>
                    <textarea
                      className={`${inputCls} min-h-[5rem] resize-y`}
                      value={form.functional_text}
                      disabled={saving}
                      onChange={(e) => setField("functional_text", e.target.value)}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      ["pitch", "Pitch"],
                      ["cost", "Cost"],
                      ["power", "Power"],
                      ["block", "Block"],
                      ["life", "Life"],
                      ["intellect", "Intellect"],
                    ].map(([key, label]) => (
                      <label key={key} className="flex flex-col gap-1.5">
                        <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                          {label}
                        </span>
                        <input
                          className={inputCls}
                          inputMode="numeric"
                          value={/** @type {any} */ (form)[key]}
                          disabled={saving}
                          onChange={(e) => setField(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        Printing set code
                      </span>
                      <input
                        className={inputCls}
                        value={form.set_code}
                        disabled={saving}
                        onChange={(e) => setField("set_code", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        Printing set number
                      </span>
                      <input
                        className={inputCls}
                        inputMode="numeric"
                        value={form.set_num}
                        disabled={saving}
                        onChange={(e) => setField("set_num", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        Rarity
                      </span>
                      <select
                        className={inputCls}
                        value={form.rarity}
                        disabled={saving}
                        onChange={(e) => setField("rarity", e.target.value)}
                      >
                        <option value="">—</option>
                        {CARD_RARITY_NAMES.map((label, id) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        Image URL
                      </span>
                      <input
                        className={inputCls}
                        value={form.image_url}
                        disabled={saving}
                        onChange={(e) => setField("image_url", e.target.value)}
                      />
                    </label>
                  </div>

                  {[
                    ["classes", "Classes", CARD_CLASS_NAMES],
                    ["talents", "Talents", CARD_TALENT_NAMES],
                    ["formats", "Formats", CARD_FORMAT_NAMES],
                    ["fusions", "Fusions", CARD_FUSION_NAMES],
                  ].map(([key, label, names]) => (
                    <fieldset key={key} className="m-0 min-w-0 border-0 p-0">
                      <legend className="mb-1.5 px-0 text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                        {label}
                      </legend>
                      <div className="flex flex-wrap gap-1.5">
                        {/** @type {readonly string[]} */ (names).map((name, id) => (
                          <button
                            key={id}
                            type="button"
                            disabled={saving}
                            className={
                              /** @type {any} */ (form)[key].includes(id) ? chipActive : chipIdle
                            }
                            onClick={() =>
                              toggleId(/** @type {'classes' | 'talents' | 'formats' | 'fusions'} */ (key), id)
                            }
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ))}

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Subtypes (ids)
                    </span>
                    <input
                      className={inputCls}
                      value={form.subtypesCsv}
                      disabled={saving}
                      placeholder={subtypeHint}
                      onChange={(e) => setField("subtypesCsv", e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Heroes (ids, 0–{CARD_HERO_NAMES.length - 1})
                    </span>
                    <input
                      className={inputCls}
                      value={form.heroesCsv}
                      disabled={saving}
                      onChange={(e) => setField("heroesCsv", e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Keywords (ids, 0–{CARD_KEYWORD_NAMES.length - 1})
                    </span>
                    <input
                      className={inputCls}
                      value={form.keywordsCsv}
                      disabled={saving}
                      onChange={(e) => setField("keywordsCsv", e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Specializations (hero ids)
                    </span>
                    <input
                      className={inputCls}
                      value={form.specializationsCsv}
                      disabled={saving}
                      onChange={(e) => setField("specializationsCsv", e.target.value)}
                    />
                  </label>

                  {error ? (
                    <p className="m-0 text-[0.85rem] text-red-200/95" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.1] px-5 py-4">
                  <button type="button" className={`${btnBase} ${btnTheme}`} disabled={saving} onClick={closeEdit}>
                    Cancel
                  </button>
                  <button type="button" className={btnPrimary} disabled={saving || loadingDetail} onClick={() => void saveEdit()}>
                    {saving ? "Saving…" : "Save"}
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
