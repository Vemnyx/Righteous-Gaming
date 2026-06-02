import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { deckHeroLabel } from "../utils/deckHeroLabel";
import { deckDisplayName } from "../utils/deckDisplayName";
import { deckFormatColumnLabel } from "../utils/deckTableFilters";
import { partitionDeckCards, sectionCardCount } from "../utils/deckSections";
import { DeckViewerCard } from "./DeckViewerCard";

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

/** @param {{ className?: string }} props */
function SectionIconPerson({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" />
    </svg>
  );
}

/** @param {{ className?: string }} props */
function SectionIconDeck({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

/** @param {{ className?: string }} props */
function SectionIconBag({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

/** @param {{ className?: string }} props */
function SectionIconToken({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

/**
 * @param {{
 *   title: string,
 *   icon: import("react").ReactNode,
 *   lines: import("../utils/deckSections").DeckCardLine[],
 *   isLight: boolean,
 *   stacked?: boolean,
 *   onOpenCard?: (identifier: string) => void,
 * }} props
 */
function DeckViewerSection({ title, icon, lines, isLight, stacked = true, onOpenCard }) {
  const count = sectionCardCount(lines);
  if (lines.length === 0) return null;

  return (
    <section className={`flex flex-col ${stacked ? "gap-1" : "gap-2"}`}>
      <h3 className="m-0 flex items-center gap-2 text-[0.95rem] font-semibold tracking-tight text-[#f4f0fa]/92">
        <span className="text-[#f4f0fa]/70">{icon}</span>
        <span>
          {title} <span className="font-normal text-[#f4f0fa]/55">({count})</span>
        </span>
      </h3>
      <div
        className={`grid grid-cols-4 items-end gap-x-2 gap-y-6 overflow-visible sm:grid-cols-5 sm:gap-y-7 md:grid-cols-6 md:gap-x-2.5 lg:grid-cols-7 ${stacked ? "pt-3" : ""}`}
      >
        {lines.map((line) => (
          <div
            key={`${line.card_id}-${line.mainboard}`}
            className={`min-w-0 overflow-visible ${stacked ? "pt-[52px]" : ""}`}
          >
            <DeckViewerCard
              card={line.card}
              count={line.count}
              isLight={isLight}
              stacked={stacked}
              onOpenCard={onOpenCard}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * @param {{
 *   isLight: boolean,
 *   deckId: string,
 *   active: boolean,
 *   onOpenCard?: (identifier: string) => void,
 *   onDeckDeleted?: () => void,
 * }} props
 */
export function DeckDetailPage({ isLight, deckId, active, onOpenCard, onDeckDeleted }) {
  const { user, sessionProfile } = useAuth();
  const myUserId = typeof sessionProfile?.id === "number" ? sessionProfile.id : null;
  const [cardLines, setCardLines] = useState(/** @type {import("../utils/deckSections").DeckCardLine[] | null} */ (null));
  const [meta, setMeta] = useState(
    /** @type {{ id: number, user_id: number, name: string, format: number, hero_id: number, hero_name?: string | null, set_id?: number | null, fabrary_format?: string | null, fabrary_link?: string | null, source?: string, owner_username?: string | null, owner_email?: string | null } | null} */ (null),
  );
  const [sets, setSets] = useState(/** @type {{ id: number, name: string }[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [notFound, setNotFound] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(async () => {
    if (!active || !user) return;
    const id = parseInt(String(deckId).trim(), 10);
    if (!Number.isFinite(id) || id <= 0) {
      setNotFound(true);
      setMeta(null);
      setCardLines(null);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const token = await user.getIdToken();
      const [resDeck, resSets] = await Promise.all([
        fetch(`/api/me/decks/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/sets"),
      ]);
      if (resDeck.status === 404) {
        setNotFound(true);
        setMeta(null);
        setCardLines(null);
        return;
      }
      if (!resDeck.ok) throw new Error(parseApiError(await resDeck.text()));
      const data = await resDeck.json();
      const d = data?.deck;
      if (!d || typeof d.id !== "number" || typeof d.name !== "string") {
        throw new Error("Invalid deck response");
      }
      setMeta({
        id: d.id,
        user_id: typeof d.user_id === "number" ? d.user_id : 0,
        name: String(d.name).trim() || `Deck #${d.id}`,
        format: typeof d.format === "number" ? d.format : 0,
        hero_id: typeof d.hero_id === "number" ? d.hero_id : 0,
        hero_name:
          d.hero_name != null && String(d.hero_name).trim() !== "" ? String(d.hero_name).trim() : null,
        set_id: typeof d.set_id === "number" ? d.set_id : null,
        fabrary_format:
          d.fabrary_format != null && String(d.fabrary_format).trim() !== ""
            ? String(d.fabrary_format).trim()
            : null,
        fabrary_link:
          d.fabrary_link != null && String(d.fabrary_link).trim() !== "" ? String(d.fabrary_link).trim() : null,
        source: typeof d.source === "string" ? String(d.source).trim() : "",
        owner_username:
          d.owner_username != null && String(d.owner_username).trim() !== ""
            ? String(d.owner_username).trim()
            : null,
        owner_email:
          d.owner_email != null && String(d.owner_email).trim() !== "" ? String(d.owner_email).trim() : null,
      });
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
      setCardLines(lines);

      if (resSets.ok) {
        const rawSets = await resSets.json();
        const arr = Array.isArray(rawSets) ? rawSets : [];
        setSets(
          arr
            .filter((s) => s && typeof s.id === "number")
            .map((s) => ({
              id: s.id,
              name: String(s.name ?? "").trim() || `Set ${s.id}`,
            })),
        );
      } else {
        setSets([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deck");
      setMeta(null);
      setCardLines(null);
      setSets([]);
    } finally {
      setLoading(false);
    }
  }, [active, user, deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = useMemo(() => partitionDeckCards(cardLines ?? []), [cardLines]);

  const setNameById = useMemo(() => {
    /** @type {Record<number, string>} */
    const m = {};
    for (const s of sets) {
      if (s && typeof s.id === "number") m[s.id] = s.name;
    }
    return m;
  }, [sets]);

  const title = useMemo(() => {
    if (!meta) return "Deck";
    return deckDisplayName(meta, setNameById);
  }, [meta, setNameById]);

  const formatLabel = useMemo(() => {
    if (!meta) return "";
    return deckFormatColumnLabel(meta, setNameById);
  }, [meta, setNameById]);

  const sourceLabel = useMemo(() => {
    if (!meta) return "";
    const src = meta.source ?? "";
    if (src.toLowerCase() === "member") {
      const who = meta.owner_username ?? meta.owner_email ?? "";
      return who ? `Member · ${who}` : "Member";
    }
    return src || "—";
  }, [meta]);

  const canDelete = meta != null && myUserId != null && meta.user_id === myUserId;

  const closeDeleteModal = useCallback(() => {
    setDeleteOpen(false);
    setDeleteError(null);
  }, []);

  const confirmDeleteDeck = useCallback(async () => {
    if (!user || !meta || !canDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/me/decks/${meta.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      closeDeleteModal();
      if (typeof onDeckDeleted === "function") {
        onDeckDeleted();
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteSubmitting(false);
    }
  }, [user, meta, canDelete, closeDeleteModal, onDeckDeleted]);

  useEffect(() => {
    if (!deleteOpen) return undefined;
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key === "Escape" && !deleteSubmitting) closeDeleteModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleteSubmitting, closeDeleteModal]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";

  const btnDanger =
    "rounded-lg border border-red-400/45 bg-red-950/50 px-3 py-1.5 text-[0.875rem] font-medium text-red-100 transition-colors hover:border-red-300/55 hover:bg-red-900/45 disabled:cursor-not-allowed disabled:opacity-45";

  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

  const muted = "text-[#f4f0fa]/70";
  const metaLink =
    "text-purple-300/95 underline decoration-purple-300/45 underline-offset-[3px] hover:text-purple-200";

  return (
    <div className="flex w-full flex-1 flex-col gap-3 px-1 py-2 sm:px-2">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {meta ? (
            <>
              <h2 className="m-0 text-left text-2xl font-semibold tracking-tight text-[#f4f0fa] sm:text-3xl">
                {title}
              </h2>
              <p className="m-0 mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[1rem] leading-relaxed text-[#f4f0fa]/88 sm:text-[1.0625rem]">
                <span>{formatLabel}</span>
                <span className="text-[#f4f0fa]/40" aria-hidden>
                  ·
                </span>
                <span>{deckHeroLabel(meta)}</span>
                <span className="text-[#f4f0fa]/40" aria-hidden>
                  ·
                </span>
                <span>{sourceLabel}</span>
                {meta.fabrary_link ? (
                  <>
                    <span className="text-[#f4f0fa]/40" aria-hidden>
                      ·
                    </span>
                    <a
                      href={meta.fabrary_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={metaLink}
                    >
                      Fabrary
                    </a>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <h2 className="m-0 text-left text-2xl font-semibold tracking-tight text-[#f4f0fa] sm:text-3xl">Deck</h2>
          )}
        </div>
        {canDelete ? (
          <button
            type="button"
            className={`shrink-0 self-start ${btnDanger}`}
            disabled={!user || loading || deleteSubmitting}
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            Delete deck
          </button>
        ) : null}
      </header>

      {loading ? <p className={`m-0 text-[0.875rem] ${muted}`}>Loading deck…</p> : null}

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button type="button" className={`mt-3 ${btnBase} ${btnTheme}`} onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && notFound ? (
        <p className={`text-[0.9rem] ${muted}`}>Deck not found.</p>
      ) : null}

      {!loading && !error && !notFound && cardLines ? (
        <div className="flex flex-col gap-6">
          <DeckViewerSection
            title="Hero + arena"
            icon={<SectionIconPerson />}
            lines={sections.heroArena}
            isLight={isLight}
            stacked={false}
            onOpenCard={onOpenCard}
          />
          <DeckViewerSection
            title="Deck"
            icon={<SectionIconDeck />}
            lines={sections.deck}
            isLight={isLight}
            stacked
            onOpenCard={onOpenCard}
          />
          <DeckViewerSection
            title="Inventory"
            icon={<SectionIconBag />}
            lines={sections.inventory}
            isLight={isLight}
            stacked
            onOpenCard={onOpenCard}
          />
          <DeckViewerSection
            title="Tokens"
            icon={<SectionIconToken />}
            lines={sections.tokens}
            isLight={isLight}
            stacked={false}
            onOpenCard={onOpenCard}
          />
          {sections.heroArena.length === 0 &&
          sections.deck.length === 0 &&
          sections.inventory.length === 0 &&
          sections.tokens.length === 0 ? (
            <p className={`m-0 text-[0.875rem] ${muted}`}>This deck has no cards yet.</p>
          ) : null}
        </div>
      ) : null}

      {deleteOpen && meta && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !deleteSubmitting) closeDeleteModal();
              }}
            >
              <div
                className={`relative w-full max-w-md rounded-xl p-5 sm:p-6 ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="deck-delete-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="deck-delete-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  Delete “{title}”?
                </h3>
                <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/75">
                  This will permanently remove the deck and all of its cards from your library.
                </p>
                {deleteError ? (
                  <p className="mt-3 text-[0.85rem] text-red-200/95" role="alert">
                    {deleteError}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    disabled={deleteSubmitting}
                    onClick={closeDeleteModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnDanger}
                    disabled={deleteSubmitting || !user}
                    onClick={() => void confirmDeleteDeck()}
                  >
                    {deleteSubmitting ? "Deleting…" : "Delete deck"}
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
