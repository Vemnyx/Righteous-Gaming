import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { CARD_FORMAT_NAMES, CardFormat, isValidCardFormatId } from "../constants/cardFormat";

/** @typedef {{ id: number, name: string, code: string, image_url?: string | null }} CatalogSet */

/** @typedef {{ id: number, name?: string, image_url?: string | null, [key: string]: unknown }} RankerCard */

/**
 * @typedef {{ kind: 'pending', card: RankerCard }} PendingEntry
 * @typedef {{ kind: 'ranked', card: RankerCard, rank: number, notes: string | null }} RankedEntry
 * @typedef {PendingEntry | RankedEntry} QueueEntry
 */

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

function notesFromServer(/** @type {string | null | undefined} */ n) {
  if (n == null) return "";
  return String(n);
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CardRanker({ isLight, active }) {
  const { user, configured } = useAuth();
  const [sets, setSets] = useState(/** @type {CatalogSet[]} */ ([]));
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsError, setSetsError] = useState(/** @type {string | null} */ (null));
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedFormatId, setSelectedFormatId] = useState(CardFormat.Limited);

  const [queue, setQueue] = useState(/** @type {QueueEntry[]} */ ([]));
  const [cardIndex, setCardIndex] = useState(0);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState(/** @type {string | null} */ (null));
  const [draftRank, setDraftRank] = useState(/** @type {number | null} */ (null));
  const [draftNotes, setDraftNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    (async () => {
      setSetsLoading(true);
      setSetsError(null);
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
        if (!cancelled) setSetsError(e instanceof Error ? e.message : "Failed to load sets");
      } finally {
        if (!cancelled) setSetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const loadRankQueue = useCallback(async () => {
    if (!user || !selectedSetId || !isValidCardFormatId(selectedFormatId)) {
      setQueue([]);
      setCardIndex(0);
      return;
    }
    setRankLoading(true);
    setRankError(null);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({
        set_id: selectedSetId,
        format: String(selectedFormatId),
      });
      const headers = { Authorization: `Bearer ${token}` };
      const [resRanked, resPending] = await Promise.all([
        fetch(`/api/me/card-rankings?${qs}`, { headers }),
        fetch(`/api/me/cards-to-rank?${qs}`, { headers }),
      ]);
      if (!resRanked.ok) throw new Error(await resRanked.text());
      if (!resPending.ok) throw new Error(await resPending.text());
      const rankedData = await resRanked.json();
      const pendingData = await resPending.json();
      const rankedRows = Array.isArray(rankedData.rankings) ? rankedData.rankings : [];
      const pendingCards = Array.isArray(pendingData.cards) ? pendingData.cards : [];

      /** @type {QueueEntry[]} */
      const next = [];
      for (const c of pendingCards) {
        if (c && typeof c.id === "number") next.push({ kind: "pending", card: /** @type {RankerCard} */ (c) });
      }
      for (const r of rankedRows) {
        if (r && r.card && typeof r.card.id === "number" && typeof r.rank === "number") {
          next.push({
            kind: "ranked",
            card: /** @type {RankerCard} */ (r.card),
            rank: Number(r.rank),
            notes: r.notes != null ? String(r.notes) : null,
          });
        }
      }
      setQueue(next);
      setCardIndex(0);
    } catch (e) {
      setRankError(e instanceof Error ? e.message : "Failed to load rankings");
      setQueue([]);
      setCardIndex(0);
    } finally {
      setRankLoading(false);
    }
  }, [user, selectedSetId, selectedFormatId]);

  useEffect(() => {
    if (!active || !user) {
      setQueue([]);
      setCardIndex(0);
      return undefined;
    }
    void loadRankQueue();
    return undefined;
  }, [active, user, loadRankQueue]);

  const current = queue[cardIndex] ?? null;

  useEffect(() => {
    if (!current) {
      setDraftRank(null);
      setDraftNotes("");
      return;
    }
    if (current.kind === "ranked") {
      setDraftRank(current.rank);
      setDraftNotes(notesFromServer(current.notes));
    } else {
      setDraftRank(null);
      setDraftNotes("");
    }
  }, [current]);

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

  const selectCls = isLight
    ? "min-w-[10rem] max-w-full rounded-lg border border-white/[0.22] bg-[#4a4658] px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none focus:border-purple-400/55 sm:min-w-[12rem]"
    : "min-w-[10rem] max-w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none focus:border-purple-400/55 sm:min-w-[12rem]";

  const bgScrim = isLight
    ? "bg-gradient-to-b from-[#2d2a38]/88 via-[#2d2a38]/72 to-[#2d2a38]/85"
    : "bg-gradient-to-b from-[rgba(12,6,22,0.88)] via-[rgba(12,6,22,0.72)] to-[rgba(12,6,22,0.9)]";

  const inputCls = isLight
    ? "min-h-[8rem] w-full max-w-full resize-y rounded-lg border border-white/[0.32] bg-black/70 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/45 backdrop-blur-[2px] focus:border-purple-400/55"
    : "min-h-[8rem] w-full max-w-full resize-y rounded-lg border border-white/[0.28] bg-black/70 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 backdrop-blur-[2px] focus:border-purple-400/55";

  const btnPrimary =
    "rounded-lg border border-white/[0.28] bg-violet-600/90 px-4 py-2.5 text-[0.875rem] font-semibold text-white shadow-md transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-45";

  const starBase =
    "flex size-16 items-center justify-center rounded-xl border text-[1.6rem] leading-none transition-colors sm:size-[4.5rem] sm:text-3xl";
  const starIdle = `${starBase} border-white/[0.28] bg-black/55 text-amber-200/90 hover:border-amber-300/55 hover:bg-black/65`;
  const starOn = `${starBase} border-amber-300/85 bg-amber-500/55 text-amber-50 shadow-[0_0_16px_rgba(251,191,36,0.5)]`;
  const starDisabled = `${starBase} cursor-default border-white/[0.18] bg-black/45 text-amber-200/55`;

  const arrowNavCls =
    "flex h-[min(14rem,52vh)] min-h-[10.5rem] w-12 shrink-0 items-center justify-center self-center rounded-xl border-2 border-yellow-400/85 bg-yellow-400/18 text-xl font-semibold text-yellow-200 shadow-[0_0_18px_rgba(250,204,21,0.35)] transition-colors hover:border-yellow-300 hover:bg-yellow-400/28 hover:text-yellow-50 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-black/30 disabled:text-[#f4f0fa]/40 disabled:shadow-none sm:w-14 sm:text-2xl";

  const canSubmit = useMemo(() => {
    if (!user || !current || submitting) return false;
    if (current.kind === "pending") return draftRank != null && draftRank >= 1 && draftRank <= 5;
    return true;
  }, [user, current, draftRank, submitting]);

  const submitRanking = useCallback(async () => {
    if (!user || !current || !canSubmit) return;
    setSaveError(null);
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const setId = Number.parseInt(selectedSetId, 10);
      const rankVal = current.kind === "ranked" ? current.rank : draftRank;
      if (rankVal == null || rankVal < 1 || rankVal > 5) {
        setSaveError("Choose a star rating (1–5).");
        setSubmitting(false);
        return;
      }
      const notesTrim = draftNotes.trim();
      const body = {
        set_id: setId,
        card_id: current.card.id,
        format: selectedFormatId,
        rank: rankVal,
        notes: notesTrim === "" ? null : notesTrim,
      };
      const res = await fetch("/api/me/card-rankings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t?.trim() || res.statusText);
      }
      await loadRankQueue();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }, [user, current, canSubmit, draftNotes, selectedSetId, selectedFormatId, draftRank, loadRankQueue]);

  const goPrev = useCallback(() => {
    setCardIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setCardIndex((i) => Math.min(Math.max(0, queue.length - 1), i + 1));
  }, [queue.length]);

  const imgUrl =
    current?.card?.image_url != null && String(current.card.image_url).trim() !== ""
      ? String(current.card.image_url).trim()
      : null;

  return (
    <div className="relative flex min-h-0 w-full min-h-[min(52vh,28rem)] flex-1 flex-col overflow-hidden rounded-2xl text-left">
      {setBgUrl ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 rounded-2xl bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${JSON.stringify(setBgUrl)})`,
              backgroundSize: "100% 100%",
            }}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 z-0 rounded-2xl ${bgScrim}`}
          />
        </>
      ) : null}
      <div className="relative z-[1] flex min-h-0 w-full flex-1 flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-center gap-3 self-start">
          <select
            className={selectCls}
            value={selectedSetId}
            onChange={(e) => setSelectedSetId(e.target.value)}
            disabled={setsLoading || sets.length === 0}
            aria-busy={setsLoading}
            aria-label="Card set"
          >
            {setsLoading ? <option value="">Loading…</option> : null}
            {!setsLoading &&
              sets.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.code ? `${s.name} (${s.code})` : s.name}
                </option>
              ))}
          </select>
          <select
            className={selectCls}
            value={String(selectedFormatId)}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              setSelectedFormatId(isValidCardFormatId(v) ? v : CardFormat.Limited);
            }}
            aria-label="Format"
          >
            {CARD_FORMAT_NAMES.map((name, id) => (
              <option key={id} value={String(id)}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {setsError ? (
          <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">{setsError}</p>
        ) : null}
        {setsLoading ? <p className="text-[0.9rem] text-[#f4f0fa]/80">Loading sets…</p> : null}

        {!configured || !user ? (
          <p className="text-[0.9rem] text-[#f4f0fa]/75">Sign in to rank cards for this set and format.</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-6">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:basis-0">
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {rankLoading ? <p className="text-[0.9rem] text-[#f4f0fa]/80">Loading cards…</p> : null}
                <div className="min-h-0 flex-1" aria-hidden />
              </div>
              <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-white/[0.12] pt-4">
                <label className="flex flex-col gap-2">
                  <span className="sr-only">Notes</span>
                  <textarea
                    className={inputCls}
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    maxLength={2048}
                    rows={6}
                    disabled={!current}
                  />
                </label>
                <button type="button" className={btnPrimary} disabled={!canSubmit} onClick={() => void submitRanking()}>
                  {submitting ? "Saving…" : current?.kind === "ranked" ? "Save notes" : "Submit ranking"}
                </button>
                {saveError ? (
                  <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">
                    {saveError}
                  </p>
                ) : null}
                {rankError ? (
                  <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">
                    {rankError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="relative flex min-h-[min(18rem,40vh)] min-w-0 flex-1 flex-col items-stretch justify-start lg:basis-0">
              {!rankLoading && queue.length === 0 ? (
                <p className="text-center text-[0.9rem] text-[#f4f0fa]/70">No cards to show for this set and format.</p>
              ) : null}
              {current ? (
                <div className="flex min-h-0 w-full flex-1 items-start justify-center gap-0.5 sm:gap-1">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={cardIndex <= 0 || rankLoading}
                    className={arrowNavCls}
                    aria-label="Previous card"
                  >
                    <span aria-hidden>←</span>
                  </button>
                  <div className="flex min-h-0 min-w-0 max-w-[min(100%,22rem)] flex-1 flex-col items-center justify-start gap-1.5 px-0.5 sm:max-w-sm sm:gap-2 sm:px-1">
                    <div className="flex w-full max-w-md justify-center gap-2.5 sm:gap-3" role="group" aria-label="Star rating 1 to 5">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const locked = current.kind === "ranked";
                        const cap = locked ? current.rank : draftRank;
                        const filled = cap != null && cap >= 1 && cap <= 5 && n <= cap;
                        const isExact = cap === n;
                        const starClass = locked
                          ? filled
                            ? `${starOn} cursor-default opacity-95`
                            : `${starDisabled} opacity-55`
                          : filled
                            ? starOn
                            : starIdle;
                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={locked || rankLoading}
                            aria-pressed={isExact}
                            aria-label={`${n} star${n === 1 ? "" : "s"}`}
                            className={starClass}
                            onClick={() => setDraftRank(n)}
                          >
                            ★
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex min-h-0 w-full max-w-xs flex-1 items-center justify-center sm:max-w-sm">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={String(current.card.name ?? "Card")}
                          className="max-h-[min(52vh,22rem)] w-full max-w-full object-contain"
                          draggable={false}
                        />
                      ) : (
                        <div className="rounded-lg border border-dashed border-white/[0.2] px-6 py-12 text-center text-[0.85rem] text-[#f4f0fa]/55">
                          No image
                        </div>
                      )}
                    </div>
                    <p className="m-0 max-w-full truncate text-center text-[0.85rem] text-[#f4f0fa]/80">
                      {String(current.card.name ?? "").trim() || "Card"}
                      {queue.length > 1 ? (
                        <span className="text-[#f4f0fa]/50"> · {cardIndex + 1} / {queue.length}</span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={cardIndex >= queue.length - 1 || rankLoading}
                    className={arrowNavCls}
                    aria-label="Next card"
                  >
                    <span aria-hidden>→</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
