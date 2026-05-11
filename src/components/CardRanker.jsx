import { useEffect, useMemo, useState } from "react";
import { CARD_FORMAT_NAMES, CardFormat, isValidCardFormatId } from "../constants/cardFormat";

/** @typedef {{ id: number, name: string, code: string, image_url?: string | null }} CatalogSet */

/** Prefer "Omens of the Stars" / "Omen of the Stars" (or set code OMN); else first set. */
function defaultSetIdForRanker(/** @type {CatalogSet[]} */ list) {
  if (list.length === 0) return "";
  const byCode = list.find((s) => String(s.code ?? "").trim().toUpperCase() === "OMN");
  if (byCode) return String(byCode.id);
  const re = /omens?\s+of\s+the\s+stars/i;
  const byName = list.find((s) => re.test(String(s.name ?? "").trim()));
  if (byName) return String(byName.id);
  return String(list[0].id);
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CardRanker({ isLight, active }) {
  const [sets, setSets] = useState(/** @type {CatalogSet[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** Empty string only before sets load or if list empty. */
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedFormatId, setSelectedFormatId] = useState(CardFormat.Limited);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/sets");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const normalized = list
          .filter((s) => s && typeof s.id === "number")
          .map((s) => ({
            id: s.id,
            name: String(s.name ?? "").trim() || `Set ${s.id}`,
            code: String(s.code ?? "").trim(),
            image_url: s.image_url ?? null,
          }));
        if (!cancelled) {
          setSets(normalized);
          setSelectedSetId((prev) => {
            if (prev !== "" && normalized.some((s) => String(s.id) === prev)) return prev;
            return defaultSetIdForRanker(normalized);
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load sets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const selectedSet = useMemo(() => {
    if (!selectedSetId) return null;
    const id = Number.parseInt(selectedSetId, 10);
    if (!Number.isFinite(id)) return null;
    return sets.find((s) => s.id === id) ?? null;
  }, [sets, selectedSetId]);

  const setBgUrl =
    selectedSet?.image_url != null && String(selectedSet.image_url).trim() !== ""
      ? String(selectedSet.image_url).trim()
      : null;

  /** Match Resources tab / Cards catalog body text on the purple panel (readable in light & dark). */
  const labelCls =
    setBgUrl != null
      ? "text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/85"
      : "text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/80";

  const selectCls = isLight
    ? "min-w-[10rem] max-w-full rounded-lg border border-white/[0.22] bg-[#4a4658] px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none focus:border-purple-400/55 sm:min-w-[12rem]"
    : "min-w-[10rem] max-w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none focus:border-purple-400/55 sm:min-w-[12rem]";

  const bgScrim = isLight
    ? "bg-gradient-to-b from-[#2d2a38]/88 via-[#2d2a38]/72 to-[#2d2a38]/85"
    : "bg-gradient-to-b from-[rgba(12,6,22,0.88)] via-[rgba(12,6,22,0.72)] to-[rgba(12,6,22,0.9)]";

  return (
    <div className="relative flex min-h-0 w-full min-h-[min(52vh,28rem)] flex-1 flex-col overflow-hidden text-left">
      {setBgUrl ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${JSON.stringify(setBgUrl)})`,
              backgroundSize: "100% 100%",
            }}
          />
          <div aria-hidden className={`pointer-events-none absolute inset-0 z-0 ${bgScrim}`} />
        </>
      ) : null}
      <div className="relative z-[1] flex min-h-0 w-full flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4 self-start">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Set</span>
            <select
              className={selectCls}
              value={selectedSetId}
              onChange={(e) => setSelectedSetId(e.target.value)}
              disabled={loading || sets.length === 0}
              aria-busy={loading}
            >
            {loading ? <option value="">Loading…</option> : null}
            {!loading &&
              sets.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.code ? `${s.name} (${s.code})` : s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Format</span>
            <select
              className={selectCls}
              value={String(selectedFormatId)}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                setSelectedFormatId(isValidCardFormatId(v) ? v : CardFormat.Limited);
              }}
            >
              {CARD_FORMAT_NAMES.map((name, id) => (
                <option key={id} value={String(id)}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">{error}</p>
        ) : null}
        {loading ? <p className="text-[0.9rem] text-[#f4f0fa]/80">Loading sets…</p> : null}
      </div>
    </div>
  );
}
