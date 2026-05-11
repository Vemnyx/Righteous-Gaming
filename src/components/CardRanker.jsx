import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { CardFormat } from "../constants/cardFormat";

/** @typedef {{ id: number, name: string, code: string, image_url?: string | null }} CatalogSet */

/** @typedef {{ id: number, name?: string, image_url?: string | null, [key: string]: unknown }} RankerCard */

/**
 * @typedef {{ kind: 'pending', card: RankerCard }} PendingEntry
 * @typedef {{ kind: 'ranked', card: RankerCard, rank: number, notes: string | null }} RankedEntry
 * @typedef {PendingEntry | RankedEntry} QueueEntry
 */

/**
 * @typedef {{ user_name: string, rank: number, notes?: string | null }} TeamRankingRow
 * @typedef {{ averageRank: number | null, rows: TeamRankingRow[] }} TeamRankingsState
 */

function notesFromServer(/** @type {string | null | undefined} */ n) {
  if (n == null) return "";
  return String(n);
}

/** Card ranker always uses Limited format. */
const RANKER_FORMAT_ID = CardFormat.Limited;

/** Matches catalog names like "Omen of the Third Age" / "Omens of the Third Age". */
const RANKER_SET_NAME_RE = /omens?\s+of\s+the\s+third\s+age/i;

/** @param {CatalogSet[]} list */
function matchRankerCatalogSet(list) {
  return list.find((s) => RANKER_SET_NAME_RE.test(String(s.name ?? "").trim())) ?? null;
}

/** @param {{ card: RankerCard }} entry */
function cardJumpOptionLabel(entry) {
  const name = String(entry.card.name ?? "").trim() || `Card ${entry.card.id}`;
  const dot = pitchDot(entry.card);
  return dot ? `${dot} ${name}` : name;
}

/** @param {RankerCard} card */
function pitchDot(card) {
  const p = typeof card.pitch === "number" ? card.pitch : Number.parseInt(String(card.pitch ?? ""), 10);
  if (!Number.isFinite(p)) return "";
  if (p === 1) return "🔴";
  if (p === 2) return "🟡";
  if (p === 3) return "🔵";
  return "";
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CardRanker({ isLight, active }) {
  const { user, configured } = useAuth();
  const [rankerSet, setRankerSet] = useState(/** @type {CatalogSet | null} */ (null));
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsError, setSetsError] = useState(/** @type {string | null} */ (null));

  const [queue, setQueue] = useState(/** @type {QueueEntry[]} */ ([]));
  const [cardIndex, setCardIndex] = useState(0);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState(/** @type {string | null} */ (null));
  const [draftRank, setDraftRank] = useState(/** @type {number | null} */ (null));
  const [draftNotes, setDraftNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(/** @type {string | null} */ (null));

  const [teamRankings, setTeamRankings] = useState(/** @type {TeamRankingsState | null} */ (null));
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamLoadError, setTeamLoadError] = useState(/** @type {string | null} */ (null));

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
        const hit = matchRankerCatalogSet(normalized);
        if (!cancelled) {
          if (!hit) {
            setSetsError('Could not find set "Omen of the Third Age" in the catalog.');
            setRankerSet(null);
          } else {
            setRankerSet(hit);
          }
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
    if (!user || !rankerSet) {
      setQueue([]);
      setCardIndex(0);
      return;
    }
    setRankLoading(true);
    setRankError(null);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({
        set_id: String(rankerSet.id),
        format: String(RANKER_FORMAT_ID),
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
  }, [user, rankerSet]);

  useEffect(() => {
    if (!active || !user || !rankerSet) {
      setQueue([]);
      setCardIndex(0);
      return undefined;
    }
    void loadRankQueue();
    return undefined;
  }, [active, user, rankerSet, loadRankQueue]);

  const current = queue[cardIndex] ?? null;

  useEffect(() => {
    setCardIndex((i) => {
      const max = Math.max(0, queue.length - 1);
      return Math.min(max, Math.max(0, i));
    });
  }, [queue.length]);

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

  useEffect(() => {
    if (!active || !user || !rankerSet || !current || current.kind !== "ranked") {
      setTeamRankings(null);
      setTeamLoadError(null);
      setTeamLoading(false);
      return undefined;
    }
    const cardId = current.card.id;
    let cancelled = false;
    (async () => {
      setTeamLoading(true);
      setTeamLoadError(null);
      try {
        const token = await user.getIdToken();
        const qs = new URLSearchParams({
          set_id: String(rankerSet.id),
          format: String(RANKER_FORMAT_ID),
          card_id: String(cardId),
        });
        const res = await fetch(`/api/me/card-team-rankings?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        const rawRows = Array.isArray(data.rankings) ? data.rankings : [];
        /** @type {TeamRankingRow[]} */
        const rows = rawRows
          .filter((r) => r && typeof r.user_name === "string" && typeof r.rank === "number")
          .map((r) => ({
            user_name: String(r.user_name),
            rank: Number(r.rank),
            notes: r.notes != null ? String(r.notes) : null,
          }));
        const averageRank = typeof data.average_rank === "number" && Number.isFinite(data.average_rank) ? data.average_rank : null;
        setTeamRankings({ averageRank, rows });
      } catch (e) {
        if (!cancelled) {
          setTeamRankings(null);
          setTeamLoadError(e instanceof Error ? e.message : "Failed to load team rankings");
        }
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, rankerSet, current?.kind, current?.card?.id]);

  const setBgUrl =
    rankerSet?.image_url != null && String(rankerSet.image_url).trim() !== ""
      ? String(rankerSet.image_url).trim()
      : null;

  const bgScrim = isLight
    ? "bg-gradient-to-b from-[#2d2a38]/88 via-[#2d2a38]/72 to-[#2d2a38]/85"
    : "bg-gradient-to-b from-[rgba(12,6,22,0.88)] via-[rgba(12,6,22,0.72)] to-[rgba(12,6,22,0.9)]";

  const inputCls = isLight
    ? "min-h-[8rem] w-full max-w-full resize-y rounded-lg border border-white/[0.32] bg-black/70 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/45 backdrop-blur-[2px] focus:border-purple-400/55"
    : "min-h-[8rem] w-full max-w-full resize-y rounded-lg border border-white/[0.28] bg-black/70 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 backdrop-blur-[2px] focus:border-purple-400/55";

  const teamPanelCls = isLight
    ? "flex min-h-[11rem] flex-1 flex-col gap-2 rounded-lg border border-white/[0.24] bg-black/35 px-3 py-3 text-[0.9rem] text-[#f4f0fa] shadow-sm"
    : "flex min-h-[11rem] flex-1 flex-col gap-2 rounded-lg border border-white/[0.16] bg-black/45 px-3 py-3 text-[0.9rem] text-[#f4f0fa] shadow-sm";

  const cardJumpSelectCls = isLight
    ? "mb-3 w-full max-w-md rounded-lg border border-white/[0.24] bg-[#4a4658]/95 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55 sm:mb-4"
    : "mb-3 w-full max-w-md rounded-lg border border-white/[0.22] bg-black/50 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55 sm:mb-4";

  const btnPrimary =
    "rounded-lg border border-white/[0.28] bg-violet-600/90 px-4 py-2.5 text-[0.875rem] font-semibold text-white shadow-md transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-45";

  const starBase =
    "flex size-[3.875rem] items-center justify-center rounded-xl border text-[1.52rem] leading-none transition-colors sm:size-16 sm:text-[1.85rem]";
  const starIdle = `${starBase} border-white/[0.28] bg-black/55 text-amber-200/90 hover:border-amber-300/55 hover:bg-black/65`;
  const starOn = `${starBase} border-amber-300/85 bg-amber-500/55 text-amber-50 shadow-[0_0_16px_rgba(251,191,36,0.5)]`;
  const starDisabled = `${starBase} cursor-default border-white/[0.18] bg-black/45 text-amber-200/55`;

  const arrowNavCls =
    "mt-8 flex h-[min(14rem,52vh)] min-h-[10.5rem] w-12 shrink-0 items-center justify-center rounded-xl border-2 border-yellow-400/85 bg-yellow-400/18 text-xl font-semibold text-yellow-200 shadow-[0_0_18px_rgba(250,204,21,0.35)] transition-colors hover:border-yellow-300 hover:bg-yellow-400/28 hover:text-yellow-50 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-black/30 disabled:text-[#f4f0fa]/40 disabled:shadow-none sm:mt-10 sm:w-14 sm:text-2xl";

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
      if (!rankerSet) return;
      const setId = rankerSet.id;
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
        format: RANKER_FORMAT_ID,
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
      // Keep the in-session queue order stable: mark/update current entry in place
      // instead of reloading and rebuilding pending->ranked order after each submit.
      setQueue((prev) => {
        if (cardIndex < 0 || cardIndex >= prev.length) return prev;
        const next = prev.slice();
        const entry = next[cardIndex];
        if (!entry) return prev;
        const notesVal = notesTrim === "" ? null : notesTrim;
        next[cardIndex] = {
          kind: "ranked",
          card: entry.card,
          rank: rankVal,
          notes: notesVal,
        };
        return next;
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }, [user, current, canSubmit, draftNotes, rankerSet, draftRank, cardIndex]);

  const goPrev = useCallback(() => {
    setCardIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setCardIndex((i) => Math.min(Math.max(0, queue.length - 1), i + 1));
  }, [queue.length]);

  /** @type {React.MutableRefObject<{ active: boolean, id: number, x0: number, y0: number }>} */
  const cardSwipeRef = useRef({ active: false, id: 0, x0: 0, y0: 0 });

  const resetCardSwipe = useCallback(() => {
    cardSwipeRef.current = { active: false, id: 0, x0: 0, y0: 0 };
  }, []);

  const onCardSwipePointerDown = useCallback(
    /** @param {React.PointerEvent<HTMLDivElement>} e */
    (e) => {
      if (rankLoading || queue.length <= 1) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cardSwipeRef.current = { active: true, id: e.pointerId, x0: e.clientX, y0: e.clientY };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [rankLoading, queue.length],
  );

  const onCardSwipePointerUpOrCancel = useCallback(
    /** @param {React.PointerEvent<HTMLDivElement>} e */
    (e) => {
      const s = cardSwipeRef.current;
      if (!s.active || s.id !== e.pointerId) return;
      const { x0, y0 } = s;
      resetCardSwipe();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (rankLoading || queue.length <= 1) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      const minDist = 52;
      if (Math.abs(dx) < minDist) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.72) return;
      if (dx < 0) {
        setCardIndex((i) => Math.min(Math.max(0, queue.length - 1), i + 1));
      } else {
        setCardIndex((i) => Math.max(0, i - 1));
      }
    },
    [rankLoading, queue.length, resetCardSwipe],
  );

  useEffect(() => {
    if (!active || !user || queue.length === 0) return undefined;

    /** @param {EventTarget | null} t */
    function isTextualFieldTarget(t) {
      if (!(t instanceof HTMLElement)) return false;
      if (t.closest("select")) return true;
      if (t.isContentEditable) return true;
      const tag = t.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") {
        const type = (t.getAttribute("type") || "text").toLowerCase();
        const nonText = new Set([
          "button",
          "submit",
          "reset",
          "checkbox",
          "radio",
          "range",
          "file",
          "hidden",
          "color",
          "image",
        ]);
        return !nonText.has(type);
      }
      return false;
    }

    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (isTextualFieldTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (rankLoading || !current) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (e.key === "ArrowLeft") {
          if (cardIndex <= 0) return;
          e.preventDefault();
          goPrev();
          return;
        }
        if (cardIndex >= queue.length - 1) return;
        e.preventDefault();
        goNext();
        return;
      }

      let starPick = /** @type {number | null} */ (null);
      if (e.key.length === 1) {
        const c = e.key.charCodeAt(0);
        if (c >= 49 && c <= 53) {
          starPick = c - 48;
        }
      }
      if (starPick == null && e.code.startsWith("Numpad")) {
        const tail = e.code.slice(6);
        const n = Number.parseInt(tail, 10);
        if (Number.isFinite(n) && n >= 1 && n <= 5) {
          starPick = n;
        }
      }
      if (starPick != null) {
        if (current.kind !== "pending") return;
        e.preventDefault();
        setDraftRank(starPick);
        return;
      }

      if (e.key === "Enter") {
        if (e.target instanceof HTMLElement && e.target.closest("button")) {
          return;
        }
        if (!canSubmit) return;
        e.preventDefault();
        void submitRanking();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, user, queue.length, cardIndex, rankLoading, goPrev, goNext, current, canSubmit, submitRanking]);

  const imgUrl =
    current?.card?.image_url != null && String(current.card.image_url).trim() !== ""
      ? String(current.card.image_url).trim()
      : null;

  const rankStats = useMemo(() => {
    let unranked = 0;
    for (const e of queue) {
      if (e.kind === "pending") unranked++;
    }
    return { total: queue.length, unranked };
  }, [queue]);

  const showRankCompleteMessage =
    !rankLoading && rankStats.total > 0 && rankStats.unranked === 0;

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
      <div className="relative z-[1] flex min-h-0 w-full flex-1 flex-col gap-4 px-4 pt-4 pb-8 sm:px-5 sm:pt-5 sm:pb-10">
        {setsError ? (
          <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">{setsError}</p>
        ) : null}
        {setsLoading ? <p className="text-[0.9rem] text-[#f4f0fa]/80">Loading card set…</p> : null}

        {!configured || !user ? (
          <p className="text-[0.9rem] text-[#f4f0fa]/75">Sign in to rank cards for this set and format.</p>
        ) : rankerSet ? (
          <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-6">
            <div className="relative flex min-h-[min(18rem,40vh)] min-w-0 flex-1 flex-col items-stretch justify-center lg:basis-0">
              {!rankLoading && queue.length === 0 ? (
                <p className="text-center text-[0.9rem] text-[#f4f0fa]/70">No cards to show for this set and format.</p>
              ) : null}
              {current ? (
                <div className="flex w-full min-h-0 items-center justify-center gap-0.5 sm:gap-1">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={cardIndex <= 0 || rankLoading}
                    className={arrowNavCls}
                    aria-label="Previous card"
                  >
                    <span aria-hidden>←</span>
                  </button>
                  <div className="flex min-h-0 min-w-0 max-w-[min(100%,22rem)] shrink-0 flex-col items-center justify-center gap-1.5 px-0.5 sm:max-w-sm sm:gap-2 sm:px-1">
                    <label className="sr-only" htmlFor="card-ranker-jump-select">
                      Jump to card
                    </label>
                    <select
                      id="card-ranker-jump-select"
                      className={cardJumpSelectCls}
                      value={queue.length > 0 ? String(Math.min(cardIndex, queue.length - 1)) : ""}
                      onChange={(e) => {
                        const next = Number.parseInt(e.target.value, 10);
                        if (Number.isFinite(next) && next >= 0 && next < queue.length) {
                          setCardIndex(next);
                        }
                      }}
                      disabled={rankLoading || queue.length === 0}
                    >
                      <optgroup label="Unranked">
                        {queue.map((entry, i) =>
                          entry.kind === "pending" ? (
                            <option key={`jump-${entry.card.id}-p-${i}`} value={String(i)}>
                              {cardJumpOptionLabel(entry)}
                            </option>
                          ) : null,
                        )}
                      </optgroup>
                      <optgroup label="Ranked">
                        {queue.map((entry, i) =>
                          entry.kind === "ranked" ? (
                            <option key={`jump-${entry.card.id}-r-${i}`} value={String(i)}>
                              {cardJumpOptionLabel(entry)}
                            </option>
                          ) : null,
                        )}
                      </optgroup>
                    </select>
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
                    <div
                      className="mt-2 flex min-h-0 w-full max-w-xs touch-pan-y select-none items-center justify-center sm:mt-3 sm:max-w-sm"
                      onPointerDown={onCardSwipePointerDown}
                      onPointerUp={onCardSwipePointerUpOrCancel}
                      onPointerCancel={onCardSwipePointerUpOrCancel}
                      onLostPointerCapture={resetCardSwipe}
                      role="presentation"
                      aria-label="Swipe left or right on the card to change cards"
                    >
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
            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:basis-0">
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {rankLoading ? <p className="text-[0.9rem] text-[#f4f0fa]/80">Loading cards…</p> : null}
                <div className={teamPanelCls} aria-live="polite">
                  {!current ? (
                    <p className="m-0 text-[0.88rem] leading-snug text-[#f4f0fa]/65">Team rankings will appear here for the current card.</p>
                  ) : current.kind === "pending" ? (
                    <p className="m-0 text-[0.88rem] leading-snug text-[#f4f0fa]/80">
                      Team rankings are hidden until you submit your ranking for this card.
                    </p>
                  ) : (
                    <>
                      {teamLoading ? <p className="m-0 text-[0.88rem] text-[#f4f0fa]/75">Loading team rankings…</p> : null}
                      {teamLoadError ? (
                        <p className="m-0 rounded-md border border-red-400/35 bg-red-950/35 px-2 py-1.5 text-[0.82rem] text-red-100">
                          {teamLoadError}
                        </p>
                      ) : null}
                      {!teamLoading && !teamLoadError && teamRankings ? (
                        <>
                          <p className="m-0 text-[0.92rem] font-semibold leading-snug text-[#f4f0fa]">
                            Avg Team Ranking -{" "}
                            {teamRankings.averageRank != null ? teamRankings.averageRank.toFixed(2) : "—"}
                          </p>
                          <div className="max-h-[14rem] min-h-[5rem] overflow-y-auto overscroll-contain rounded-md border border-white/[0.12] bg-black/30 px-2 py-1">
                            {teamRankings.rows.length === 0 ? (
                              <p className="m-0 py-2 text-center text-[0.85rem] text-[#f4f0fa]/65">No team ratings yet.</p>
                            ) : (
                              teamRankings.rows.map((row, idx) => (
                                <div
                                  key={`${row.user_name}-${idx}`}
                                  className="border-b border-white/[0.08] py-2.5 last:border-b-0"
                                >
                                  <p className="m-0 text-[0.875rem] font-semibold text-[#f4f0fa]">{row.user_name}</p>
                                  <p className="m-0 mt-0.5 text-[0.82rem] text-[#f4f0fa]/85">Rating: {row.rank}★ / 5</p>
                                  {row.notes != null && String(row.notes).trim() !== "" ? (
                                    <p className="m-0 mt-1 whitespace-pre-wrap text-[0.8rem] leading-snug text-[#f4f0fa]/72">
                                      Notes: {row.notes}
                                    </p>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-white/[0.12] pt-4">
                {!rankLoading ? (
                  <div className="flex flex-col gap-1">
                    <p className="m-0 text-[0.9rem] leading-snug text-[#f4f0fa]/88">
                      Total cards available for ranking: {rankStats.total}
                    </p>
                    {showRankCompleteMessage ? (
                      <p className="m-0 text-[0.9rem] leading-snug text-[#f4f0fa]/92">
                        No more cards left to rank, come back later!
                      </p>
                    ) : (
                      <p className="m-0 text-[0.9rem] leading-snug text-[#f4f0fa]/88">
                        Unranked cards remaining: {rankStats.unranked}
                      </p>
                    )}
                  </div>
                ) : null}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
