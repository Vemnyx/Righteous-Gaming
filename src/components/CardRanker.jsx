import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { userSettingsFromProfile } from "../auth/sessionProfile";
import { cardImageUrl } from "../utils/cardPrintings";

/** @typedef {{ id: number, name: string, code: string, image_url?: string | null }} CatalogSet */

/** @typedef {{ id: number, set_id: number, format: number }} ActiveCardRater */

/** @typedef {{ id: number, name?: string, printings?: { image_url?: string | null }[], [key: string]: unknown }} RankerCard */

/**
 * @typedef {{ kind: 'pending', card: RankerCard }} PendingEntry
 * @typedef {{ kind: 'rated', card: RankerCard, rating: number, notes: string | null }} RatedEntry
 * @typedef {PendingEntry | RatedEntry} QueueEntry
 */

/**
 * @typedef {{ user_name: string, rating: number, notes?: string | null }} TeamRatingRow
 * @typedef {{ averageRating: number | null, rows: TeamRatingRow[] }} TeamRatingsState
 * @typedef {Record<number, TeamRatingsState>} TeamRatingsByCard
 */

function notesFromServer(/** @type {string | null | undefined} */ n) {
  if (n == null) return "";
  return String(n);
}

/** @param {{ card: RankerCard }} entry */
function cardJumpOptionLabel(entry) {
  const name = String(entry.card.name ?? "").trim() || `Card ${entry.card.id}`;
  const dot = pitchDot(entry.card);
  return dot ? `${name}  ${dot}` : name;
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

const CARD_SWIPE_MIN_DIST_PX = 34;
/** Max |dy|/|dx| for a horizontal swipe (higher = more vertical wobble allowed). */
const CARD_SWIPE_MAX_VERTICAL_RATIO = 0.9;

/** @param {number} dx @param {number} dy */
function cardSwipeQualifies(dx, dy) {
  const mostlyHorizontal = Math.abs(dy) <= Math.abs(dx) * CARD_SWIPE_MAX_VERTICAL_RATIO;
  return Math.abs(dx) >= CARD_SWIPE_MIN_DIST_PX && mostlyHorizontal;
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CardRanker({ isLight, active }) {
  const { user, configured, sessionProfile } = useAuth();
  const cardRaterQuickSubmit = userSettingsFromProfile(sessionProfile).card_rater_quick_submit;
  const [activeRater, setActiveRater] = useState(/** @type {ActiveCardRater | null} */ (null));
  const [rankerSet, setRankerSet] = useState(/** @type {CatalogSet | null} */ (null));
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(/** @type {string | null} */ (null));
  /** True when signed in and the API reports no active card_rater (not a load failure). */
  const [ratingInactive, setRatingInactive] = useState(false);

  const [queue, setQueue] = useState(/** @type {QueueEntry[]} */ ([]));
  const [cardIndex, setCardIndex] = useState(0);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState(/** @type {string | null} */ (null));
  const [draftRank, setDraftRank] = useState(/** @type {number | null} */ (null));
  const [draftNotes, setDraftNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(/** @type {string | null} */ (null));
  const [cardDragX, setCardDragX] = useState(0);
  const [cardDragActive, setCardDragActive] = useState(false);

  const [teamRatingsByCard, setTeamRatingsByCard] = useState(/** @type {TeamRatingsByCard} */ ({}));
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamLoadError, setTeamLoadError] = useState(/** @type {string | null} */ (null));
  /** Bumps after a successful rating save so team batch refetches (queue length alone may not change). */
  const [teamRefreshKey, setTeamRefreshKey] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    if (!configured || !user) {
      setActiveRater(null);
      setRankerSet(null);
      setSessionError(null);
      setRatingInactive(false);
      setSessionLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setSessionLoading(true);
      setSessionError(null);
      setRatingInactive(false);
      setActiveRater(null);
      setRankerSet(null);
      try {
        const token = await user.getIdToken();
        const resRaters = await fetch("/api/card-raters?active=true", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resRaters.ok) throw new Error(await resRaters.text());
        const raterPayload = await resRaters.json();
        if (cancelled) return;
        const raters = Array.isArray(raterPayload.raters) ? raterPayload.raters : [];
        const r = raters[0];
        if (!r || typeof r.id !== "number" || typeof r.set_id !== "number" || typeof r.format !== "number") {
          setRatingInactive(true);
          return;
        }
        setActiveRater({ id: r.id, set_id: r.set_id, format: r.format });
        const resSet = await fetch(`/api/sets/${r.set_id}`);
        if (!resSet.ok) throw new Error(await resSet.text());
        const s = await resSet.json();
        if (cancelled) return;
        if (!s || typeof s.id !== "number") {
          throw new Error("Invalid set response");
        }
        setRankerSet({
          id: s.id,
          name: String(s.name ?? "").trim() || `Set ${s.id}`,
          code: String(s.code ?? "").trim(),
          image_url: s.image_url ?? null,
        });
      } catch (e) {
        if (!cancelled) {
          setRatingInactive(false);
          setSessionError(e instanceof Error ? e.message : "Failed to load rating session");
          setActiveRater(null);
          setRankerSet(null);
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, configured, user]);

  const loadRankQueue = useCallback(async () => {
    if (!user || !activeRater) {
      setQueue([]);
      setCardIndex(0);
      return;
    }
    setRankLoading(true);
    setRankError(null);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({ rater_id: String(activeRater.id) });
      const headers = { Authorization: `Bearer ${token}` };
      const [resRanked, resPending] = await Promise.all([
        fetch(`/api/me/card-ratings?${qs}`, { headers }),
        fetch(`/api/me/cards-to-rate?${qs}`, { headers }),
      ]);
      if (!resRanked.ok) throw new Error(await resRanked.text());
      if (!resPending.ok) throw new Error(await resPending.text());
      const ratedData = await resRanked.json();
      const pendingData = await resPending.json();
      const ratedRows = Array.isArray(ratedData.ratings) ? ratedData.ratings : [];
      const pendingCards = Array.isArray(pendingData.cards) ? pendingData.cards : [];

      /** @type {QueueEntry[]} */
      const next = [];
      for (const c of pendingCards) {
        if (c && typeof c.id === "number") next.push({ kind: "pending", card: /** @type {RankerCard} */ (c) });
      }
      for (const r of ratedRows) {
        if (r && r.card && typeof r.card.id === "number" && typeof r.rating === "number") {
          next.push({
            kind: "rated",
            card: /** @type {RankerCard} */ (r.card),
            rating: Number(r.rating),
            notes: r.notes != null ? String(r.notes) : null,
          });
        }
      }
      setQueue(next);
      setCardIndex(0);
    } catch (e) {
      setRankError(e instanceof Error ? e.message : "Failed to load ratings");
      setQueue([]);
      setCardIndex(0);
    } finally {
      setRankLoading(false);
    }
  }, [user, activeRater]);

  useEffect(() => {
    if (!active || !user || !activeRater) {
      setQueue([]);
      setCardIndex(0);
      return undefined;
    }
    void loadRankQueue();
    return undefined;
  }, [active, user, activeRater, loadRankQueue]);

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
    if (current.kind === "rated") {
      setDraftRank(current.rating);
      setDraftNotes(notesFromServer(current.notes));
    } else {
      setDraftRank(null);
      setDraftNotes("");
    }
  }, [current]);

  useEffect(() => {
    if (!active || !user || !activeRater || queue.length === 0) {
      setTeamRatingsByCard({});
      setTeamLoadError(null);
      setTeamLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setTeamLoading(true);
      setTeamLoadError(null);
      try {
        const token = await user.getIdToken();
        const qs = new URLSearchParams({
          set_id: String(activeRater.set_id),
          format: String(activeRater.format),
        });
        const res = await fetch(`/api/me/card-team-ratings-batch?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        const cards = Array.isArray(data.cards) ? data.cards : [];
        /** @type {TeamRatingsByCard} */
        const byCard = {};
        for (const c of cards) {
          if (!c || typeof c.card_id !== "number") continue;
          const rawRows = Array.isArray(c.ratings) ? c.ratings : [];
          const rows = rawRows
            .filter((r) => r && typeof r.user_name === "string" && typeof r.rating === "number")
            .map((r) => ({
              user_name: String(r.user_name),
              rating: Number(r.rating),
              notes: r.notes != null ? String(r.notes) : null,
            }));
          const averageRating =
            typeof c.average_rating === "number" && Number.isFinite(c.average_rating) ? c.average_rating : null;
          byCard[c.card_id] = { averageRating, rows };
        }
        setTeamRatingsByCard(byCard);
      } catch (e) {
        if (!cancelled) {
          setTeamRatingsByCard({});
          setTeamLoadError(e instanceof Error ? e.message : "Failed to load team ratings");
        }
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, activeRater, queue.length, teamRefreshKey]);

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
    ? "mb-4 flex min-h-[11rem] flex-1 flex-col gap-2 rounded-lg border border-white/[0.24] bg-black/35 px-3 py-3 text-[0.9rem] text-[#f4f0fa] shadow-sm"
    : "mb-4 flex min-h-[11rem] flex-1 flex-col gap-2 rounded-lg border border-white/[0.16] bg-black/45 px-3 py-3 text-[0.9rem] text-[#f4f0fa] shadow-sm";

  const cardJumpSelectCls = isLight
    ? "rg-select mb-5 w-full max-w-md rounded-lg border border-white/[0.24] bg-[#4a4658]/95 py-2 pl-3 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55 sm:mb-6"
    : "rg-select mb-5 w-full max-w-md rounded-lg border border-white/[0.22] bg-black/50 py-2 pl-3 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55 sm:mb-6";

  const btnPrimary =
    "rounded-lg border border-white/[0.28] bg-violet-600/90 px-4 py-2.5 text-[0.875rem] font-semibold text-white shadow-md transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-45";

  const starBase =
    "flex size-[3.875rem] items-center justify-center rounded-xl border text-[1.52rem] leading-none transition-colors sm:size-16 sm:text-[1.85rem]";
  const starIdle = `${starBase} border-white/[0.28] bg-black/55 text-amber-200/90 hover:border-amber-300/55 hover:bg-black/65`;
  const starOn = `${starBase} border-amber-300/85 bg-amber-500/55 text-amber-50 shadow-[0_0_16px_rgba(251,191,36,0.5)]`;

  const arrowNavCls =
    "translate-y-8 sm:translate-y-10 flex h-[min(14rem,52vh)] min-h-[10.5rem] w-12 shrink-0 items-center justify-center rounded-xl border-2 border-yellow-400/85 bg-yellow-400/18 text-xl font-semibold text-yellow-200 shadow-[0_0_18px_rgba(250,204,21,0.35)] transition-colors hover:border-yellow-300 hover:bg-yellow-400/28 hover:text-yellow-50 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-black/30 disabled:text-[#f4f0fa]/40 disabled:shadow-none sm:w-14 sm:text-2xl";

  const canSubmit = useMemo(() => {
    if (!user || !current || submitting) return false;
    if (draftRank == null || draftRank < 1 || draftRank > 5) return false;
    if (current.kind === "pending") return true;
    const notesTrim = draftNotes.trim();
    const savedNotes = notesFromServer(current.notes);
    return draftRank !== current.rating || notesTrim !== savedNotes;
  }, [user, current, draftRank, draftNotes, submitting]);

  const submitRanking = useCallback(
    /** @param {{ background?: boolean, rating?: number }} [opts] */
    async (opts) => {
      const background = opts?.background === true;
      const ratingVal = opts?.rating ?? draftRank;
      if (!user || !current) return false;
      if (background) {
        if (ratingVal == null || ratingVal < 1 || ratingVal > 5) return false;
        if (current.kind === "pending") {
          /* ok */
        } else if (current.kind === "rated") {
          const notesTrim = draftNotes.trim();
          const savedNotes = notesFromServer(current.notes);
          if (ratingVal === current.rating && notesTrim === savedNotes) return false;
        } else {
          return false;
        }
      } else if (!canSubmit) {
        return false;
      }
      setSaveError(null);
      if (!background) setSubmitting(true);
      try {
        const token = await user.getIdToken();
        if (!activeRater) return false;
        if (ratingVal == null || ratingVal < 1 || ratingVal > 5) {
          if (!background) setSaveError("Choose a star rating (1–5).");
          return false;
        }
        const notesTrim = draftNotes.trim();
        const body = {
          rater_id: activeRater.id,
          card_id: current.card.id,
          rating: ratingVal,
          notes: notesTrim === "" ? null : notesTrim,
        };
        const res = await fetch("/api/me/card-ratings", {
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
        setTeamRefreshKey((k) => k + 1);
        // Keep the in-session queue order stable: mark/update current entry in place
        // instead of reloading and rebuilding pending->ranked order after each submit.
        const idxAtSave = cardIndex;
        setQueue((prev) => {
          if (idxAtSave < 0 || idxAtSave >= prev.length) return prev;
          const next = prev.slice();
          const entry = next[idxAtSave];
          if (!entry) return prev;
          const notesVal = notesTrim === "" ? null : notesTrim;
          next[idxAtSave] = {
            kind: "rated",
            card: entry.card,
            rating: ratingVal,
            notes: notesVal,
          };
          return next;
        });
        return true;
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Save failed");
        return false;
      } finally {
        if (!background) setSubmitting(false);
      }
    },
    [user, current, canSubmit, draftNotes, activeRater, draftRank, cardIndex],
  );

  const goPrev = useCallback(() => {
    setCardIndex((i) => {
      if (queue.length <= 0) return 0;
      if (i <= 0) return queue.length - 1;
      return i - 1;
    });
  }, [queue.length]);

  const goNext = useCallback(() => {
    setCardIndex((i) => {
      if (queue.length <= 0) return 0;
      const last = queue.length - 1;
      if (i >= last) return 0;
      return i + 1;
    });
  }, [queue.length]);

  const pickStarRating = useCallback(
    /** @param {number} n */
    (n) => {
      setDraftRank(n);
      if (!cardRaterQuickSubmit || !user || !current || rankLoading || submitting) return;
      if (n < 1 || n > 5) return;
      if (current.kind === "rated" && n === current.rating) return;
      void (async () => {
        const ok = await submitRanking({ background: true, rating: n });
        if (ok && queue.length > 1) goNext();
      })();
    },
    [cardRaterQuickSubmit, user, current, rankLoading, submitting, submitRanking, queue.length, goNext],
  );

  /** @type {React.MutableRefObject<{ active: boolean, id: number, x0: number, y0: number, x: number, y: number }>} */
  const cardSwipeRef = useRef({ active: false, id: 0, x0: 0, y0: 0, x: 0, y: 0 });
  /** @type {React.MutableRefObject<number | null>} */
  const cardSwipeAnimTimerRef = useRef(null);

  const resetCardSwipe = useCallback(() => {
    if (cardSwipeAnimTimerRef.current != null) {
      window.clearTimeout(cardSwipeAnimTimerRef.current);
      cardSwipeAnimTimerRef.current = null;
    }
    cardSwipeRef.current = { active: false, id: 0, x0: 0, y0: 0, x: 0, y: 0 };
    setCardDragActive(false);
    setCardDragX(0);
  }, []);

  useEffect(() => () => resetCardSwipe(), [resetCardSwipe]);

  const onCardSwipePointerDown = useCallback(
    /** @param {React.PointerEvent<HTMLDivElement>} e */
    (e) => {
      if (rankLoading || queue.length <= 1) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cardSwipeRef.current = {
        active: true,
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
      };
      setCardDragActive(true);
      setCardDragX(0);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [rankLoading, queue.length],
  );

  const onCardSwipePointerMove = useCallback(
    /** @param {React.PointerEvent<HTMLDivElement>} e */
    (e) => {
      const s = cardSwipeRef.current;
      if (!s.active || s.id !== e.pointerId) return;
      s.x = e.clientX;
      s.y = e.clientY;
      const dx = s.x - s.x0;
      const dy = s.y - s.y0;
      if (Math.abs(dy) > Math.abs(dx) * 1.55) return;
      const clamped = Math.max(-220, Math.min(220, dx));
      setCardDragX(clamped);
    },
    [],
  );

  const completeSwipe = useCallback(
    /** @param {number} dx */
    (dx) => {
      const direction = dx < 0 ? -1 : 1;
      setCardDragActive(false);
      setCardDragX(direction * 560);
      if (cardSwipeAnimTimerRef.current != null) {
        window.clearTimeout(cardSwipeAnimTimerRef.current);
      }
      cardSwipeAnimTimerRef.current = window.setTimeout(() => {
        cardSwipeAnimTimerRef.current = null;
        void (async () => {
          const hasPendingSelectedRank =
            current?.kind === "pending" &&
            draftRank != null &&
            draftRank >= 1 &&
            draftRank <= 5;
          if (hasPendingSelectedRank) {
            void submitRanking({ background: true });
          }
          if (direction < 0) {
            goNext();
          } else {
            goPrev();
          }
          setCardDragX(0);
        })();
      }, 165);
    },
    [goNext, goPrev, current, draftRank, submitRanking],
  );

  const onCardSwipePointerUpOrCancel = useCallback(
    /** @param {React.PointerEvent<HTMLDivElement>} e */
    (e) => {
      const s = cardSwipeRef.current;
      if (!s.active || s.id !== e.pointerId) return;
      s.x = e.clientX;
      s.y = e.clientY;
      s.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (rankLoading || queue.length <= 1) {
        setCardDragActive(false);
        setCardDragX(0);
        return;
      }
      const dx = s.x - s.x0;
      const dy = s.y - s.y0;
      if (cardSwipeQualifies(dx, dy)) {
        completeSwipe(dx);
        return;
      }
      setCardDragActive(false);
      setCardDragX(0);
    },
    [rankLoading, queue.length, completeSwipe],
  );

  const onCardSwipeLostPointerCapture = useCallback(() => {
    // Some touch stacks end gestures via capture loss; commit swipe from tracked
    // coordinates if one is still active, otherwise just clear visuals.
    const s = cardSwipeRef.current;
    if (!s.active) {
      setCardDragActive(false);
      setCardDragX(0);
      return;
    }
    s.active = false;
    if (rankLoading || queue.length <= 1) {
      setCardDragActive(false);
      setCardDragX(0);
      return;
    }
    const dx = s.x - s.x0;
    const dy = s.y - s.y0;
    if (cardSwipeQualifies(dx, dy)) {
      completeSwipe(dx);
      return;
    }
    setCardDragActive(false);
    setCardDragX(0);
  }, [rankLoading, queue.length, completeSwipe]);

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
        if (queue.length <= 1) return;
        e.preventDefault();
        if (e.key === "ArrowLeft") {
          goPrev();
        } else {
          goNext();
        }
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
        e.preventDefault();
        pickStarRating(starPick);
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
  }, [active, user, queue.length, rankLoading, goPrev, goNext, current, canSubmit, submitRanking, pickStarRating]);

  const imgUrl = current?.card ? cardImageUrl(current.card) : null;

  const rankStats = useMemo(() => {
    let unranked = 0;
    for (const e of queue) {
      if (e.kind === "pending") unranked++;
    }
    return { total: queue.length, unranked };
  }, [queue]);

  const showRankCompleteMessage =
    !rankLoading && rankStats.total > 0 && rankStats.unranked === 0;

  const cardSwipeVisualStyle = useMemo(
    () => ({
      transform: `translateX(${cardDragX}px) rotate(${cardDragX * 0.025}deg)`,
      opacity: Math.max(0.72, 1 - Math.abs(cardDragX) / 540),
      transition: cardDragActive ? "none" : "transform 180ms ease, opacity 180ms ease",
    }),
    [cardDragX, cardDragActive],
  );

  const cardJumpGroups = useMemo(() => {
    /** @type {{ idx: number, entry: QueueEntry, label: string }[]} */
    const pending = [];
    /** @type {{ idx: number, entry: QueueEntry, label: string }[]} */
    const ranked = [];
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      if (!entry) continue;
      const label = cardJumpOptionLabel(entry);
      const row = { idx: i, entry, label };
      if (entry.kind === "pending") pending.push(row);
      else ranked.push(row);
    }
    const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    pending.sort(byLabel);
    ranked.sort(byLabel);
    return { pending, ranked };
  }, [queue]);

  const currentTeamRatingsView = useMemo(() => {
    if (!current || current.kind !== "rated") return null;
    const myRating = current.rating >= 1 && current.rating <= 5 ? current.rating : null;
    const api = teamRatingsByCard[current.card.id];
    if (api) {
      const rows = api.rows;
      let averageRating =
        api.averageRating != null && Number.isFinite(api.averageRating) ? api.averageRating : null;
      if (averageRating == null && rows.length === 0 && myRating != null) {
        averageRating = myRating;
      }
      return { averageRating, rows };
    }
    if (myRating != null) {
      return { averageRating: myRating, rows: [] };
    }
    return null;
  }, [current, teamRatingsByCard]);

  return (
    <div className="relative flex min-h-0 w-full min-h-[min(52vh,28rem)] flex-1 flex-col overflow-hidden rounded-2xl text-left">
      {setBgUrl ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 hidden rounded-2xl bg-center bg-no-repeat sm:block"
            style={{
              backgroundImage: `url(${JSON.stringify(setBgUrl)})`,
              backgroundSize: "100% 100%",
            }}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 z-0 hidden rounded-2xl sm:block ${bgScrim}`}
          />
        </>
      ) : null}
      <div className="relative z-[1] flex min-h-0 w-full flex-1 flex-col gap-4 px-4 pt-4 pb-8 sm:px-5 sm:pt-5 sm:pb-10">
        {sessionError ? (
          <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">{sessionError}</p>
        ) : null}
        {!sessionLoading && !sessionError && ratingInactive ? (
          <p className="text-[0.9rem] leading-snug text-[#f4f0fa]/80">Rating is not currently active.</p>
        ) : null}
        {sessionLoading ? <p className="text-[0.9rem] text-[#f4f0fa]/80">Loading rating session…</p> : null}

        {!configured || !user ? (
          <p className="text-[0.9rem] text-[#f4f0fa]/75">Sign in to rate cards for the active session.</p>
        ) : activeRater && rankerSet ? (
          <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-6">
            <div className="relative flex min-h-[min(18rem,40vh)] min-w-0 flex-1 flex-col items-stretch justify-center lg:basis-0">
              {!rankLoading && queue.length === 0 ? (
                <p className="text-center text-[0.9rem] text-[#f4f0fa]/70">No cards to show for this rating session.</p>
              ) : null}
              {current ? (
                <div className="flex w-full min-h-0 items-center justify-center gap-0.5 sm:gap-1">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={rankLoading || queue.length <= 1}
                    className={`${arrowNavCls} hidden sm:flex`}
                    aria-label="Previous card"
                  >
                    <span aria-hidden>←</span>
                  </button>
                  <div className="flex min-h-0 min-w-0 max-w-[min(100%,22rem)] shrink-0 flex-col items-center justify-center gap-1.5 px-0.5 sm:max-w-sm sm:gap-2 sm:px-1">
                    <label className="sr-only" htmlFor="card-rater-jump-select">
                      Jump to card
                    </label>
                    <select
                      id="card-rater-jump-select"
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
                        {cardJumpGroups.pending.map(({ idx, entry, label }) => (
                          <option key={`jump-${entry.card.id}-p-${idx}`} value={String(idx)}>
                            {label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Ranked">
                        {cardJumpGroups.ranked.map(({ idx, entry, label }) => (
                          <option key={`jump-${entry.card.id}-r-${idx}`} value={String(idx)}>
                            {label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="flex w-full max-w-md justify-center gap-2.5 sm:gap-3" role="group" aria-label="Star rating 1 to 5">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const cap = draftRank;
                        const filled = cap != null && cap >= 1 && cap <= 5 && n <= cap;
                        const isExact = cap === n;
                        const starClass = filled ? starOn : starIdle;
                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={rankLoading}
                            aria-pressed={isExact}
                            aria-label={`${n} star${n === 1 ? "" : "s"}`}
                            className={starClass}
                            onClick={() => pickStarRating(n)}
                          >
                            ★
                          </button>
                        );
                      })}
                    </div>
                    <div
                      className="mt-3 flex min-h-0 w-full max-w-xs touch-pan-y select-none items-center justify-center will-change-transform sm:mt-4 sm:max-w-sm"
                      style={cardSwipeVisualStyle}
                      onPointerDown={onCardSwipePointerDown}
                      onPointerMove={onCardSwipePointerMove}
                      onPointerUp={onCardSwipePointerUpOrCancel}
                      onPointerCancel={onCardSwipePointerUpOrCancel}
                      onLostPointerCapture={onCardSwipeLostPointerCapture}
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
                    disabled={rankLoading || queue.length <= 1}
                    className={`${arrowNavCls} hidden sm:flex`}
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
                    <p className="m-0 text-[0.88rem] leading-snug text-[#f4f0fa]/65">Team ratings will appear here for the current card.</p>
                  ) : current.kind === "pending" ? (
                    <p className="m-0 text-[0.98rem] font-semibold leading-snug text-[#f4f0fa]/88">
                      Team ratings are hidden until you submit your rating for this card.
                    </p>
                  ) : (
                    <>
                      {teamLoading ? <p className="m-0 text-[0.88rem] text-[#f4f0fa]/75">Loading team ratings…</p> : null}
                      {teamLoadError ? (
                        <p className="m-0 rounded-md border border-red-400/35 bg-red-950/35 px-2 py-1.5 text-[0.82rem] text-red-100">
                          {teamLoadError}
                        </p>
                      ) : null}
                      {!teamLoading && !teamLoadError && currentTeamRatingsView ? (
                        <>
                          <p className="m-0 text-[0.92rem] font-semibold leading-snug text-[#f4f0fa]">
                            Avg Team Rating -{" "}
                            {currentTeamRatingsView.averageRating != null
                              ? `${currentTeamRatingsView.averageRating.toFixed(2)}★`
                              : "—"}
                          </p>
                          <div className="max-h-[14rem] min-h-[5rem] overflow-y-auto overscroll-contain rounded-md border border-white/[0.12] bg-black/30 px-2 py-1 [scrollbar-gutter:stable]">
                            {currentTeamRatingsView.rows.length === 0 ? (
                              <p className="m-0 py-2 text-center text-[0.85rem] text-[#f4f0fa]/65">
                                {currentTeamRatingsView.averageRating != null
                                  ? "No other team ratings yet."
                                  : "No team ratings yet."}
                              </p>
                            ) : (
                              currentTeamRatingsView.rows.map((row, idx) => (
                                <div
                                  key={`${row.user_name}-${idx}`}
                                  className="border-b border-white/[0.08] py-2.5 last:border-b-0"
                                >
                                  <p className="m-0 text-[0.875rem] font-semibold text-[#f4f0fa]">
                                    {row.user_name} - {row.rating}/5 ★
                                  </p>
                                  {row.notes != null && String(row.notes).trim() !== "" ? (
                                    <p className="m-0 mt-3 whitespace-pre-wrap text-[0.8rem] leading-snug text-[#f4f0fa]/72">
                                      notes: {row.notes}
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
                      Total cards available for rating: {rankStats.total}
                    </p>
                    {showRankCompleteMessage ? (
                      <p className="m-0 text-[0.9rem] leading-snug text-[#f4f0fa]/92">
                        No more cards left to rate, come back later!
                      </p>
                    ) : (
                      <p className="m-0 text-[0.9rem] leading-snug text-[#f4f0fa]/88">
                        Unrated cards remaining: {rankStats.unranked}
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
                {!cardRaterQuickSubmit ? (
                  <button type="button" className={btnPrimary} disabled={!canSubmit} onClick={() => void submitRanking()}>
                    {submitting ? "Saving…" : current?.kind === "rated" ? "Save changes" : "Submit rating"}
                  </button>
                ) : null}
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
