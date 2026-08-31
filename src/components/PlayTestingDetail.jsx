import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  CARD_FORMAT_NAMES,
  cardFormatName,
  isValidCardFormatId,
} from "../constants/cardFormat";
import { bodyToRichHtml, isEmptyRichHtml } from "../utils/richTextDomPurify";
import { PANEL_TABS_BLEED, PANEL_TABS_CONTENT_PAD } from "./PanelTabs";
import { RichTextEditor } from "./RichTextEditor";
import { RichTextHtml } from "./RichTextHtml";
import {
  HeroAvatar,
  HeroAvatarRow,
  formatTimeframeLabel,
  heroLegalForFormat,
  parseApiError,
  sessionOwnerLabel,
} from "./PlayTesting";

/**
 * @typedef {{
 *   id: number,
 *   user_id: number,
 *   body: string,
 *   draft_body?: string,
 *   published?: boolean,
 *   published_at?: string | null,
 *   updated_at: string,
 *   first_name?: string | null,
 *   username?: string | null,
 * }} SessionNote
 */

/**
 * @typedef {{
 *   id: number,
 *   session_id: number,
 *   user_id: number,
 *   note: string,
 *   updated_at: string,
 *   first_name?: string | null,
 *   username?: string | null,
 *   heroes: Array<{ hero_id: number, name: string, young?: boolean, card_image_url?: string | null, art_image_url?: string | null }>,
 * }} SessionInterest
 */

const INTEREST_NOTE_MAX = 280;

/**
 * @param {{ isLight: boolean, active: boolean, sessionId: string, onBack?: () => void }} props
 */
export function PlayTestingDetail({ isLight, active, sessionId, onBack }) {
  const { user, sessionProfile } = useAuth();
  const myUserId = typeof sessionProfile?.id === "number" ? sessionProfile.id : null;

  const [session, setSession] = useState(/** @type {any | null} */ (null));
  const [heroes, setHeroes] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [closing, setClosing] = useState(false);

  const [publishedNote, setPublishedNote] = useState(/** @type {SessionNote | null} */ (null));
  const [myNote, setMyNote] = useState(/** @type {SessionNote | null} */ (null));
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteEditorKey, setNoteEditorKey] = useState(0);
  const [noteInitialHtml, setNoteInitialHtml] = useState("<p></p>");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteDeleting, setNoteDeleting] = useState(false);
  const [noteSaveMode, setNoteSaveMode] = useState(/** @type {"draft" | "publish" | null} */ (null));
  const [noteError, setNoteError] = useState(/** @type {string | null} */ (null));
  const noteEditorRef = useRef(/** @type {{ getHTML: () => string, isEmpty?: () => boolean } | null} */ (null));

  const [interests, setInterests] = useState(/** @type {SessionInterest[]} */ ([]));
  const [myInterest, setMyInterest] = useState(/** @type {SessionInterest | null} */ (null));
  const [interestHeroIds, setInterestHeroIds] = useState(/** @type {number[]} */ ([]));
  const [interestNote, setInterestNote] = useState("");
  const [interestEditing, setInterestEditing] = useState(false);
  const [interestSubmitting, setInterestSubmitting] = useState(false);
  const [interestError, setInterestError] = useState(/** @type {string | null} */ (null));

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary =
    "rounded-lg border border-emerald-400/45 bg-emerald-950/45 px-3 py-1.5 text-[0.8125rem] font-semibold text-emerald-100 transition-colors hover:border-emerald-300/55 hover:bg-emerald-900/45 disabled:cursor-not-allowed disabled:opacity-45";
  const shell = "rounded-xl border border-white/[0.14] bg-black/30 p-4 sm:p-5";

  const isOwner = session != null && myUserId != null && session.user_id === myUserId;
  const isClosed = session?.status === 1 || session?.bucket === "past";
  const hasUnpublishedDraft = Boolean(myNote && !myNote.published);

  const legalHeroes = useMemo(() => {
    if (!session || !isValidCardFormatId(session.format)) return [];
    return heroes.filter((h) => heroLegalForFormat(h, session.format));
  }, [heroes, session]);

  const loadAll = useCallback(async () => {
    if (!user || !sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [resSession, resMeta, resNotes, resInterests] = await Promise.all([
        fetch(`/api/play-testing/sessions/${sessionId}`, { headers }),
        fetch("/api/play-testing/meta", { headers }),
        fetch(`/api/play-testing/sessions/${sessionId}/notes`, { headers }),
        fetch(`/api/play-testing/sessions/${sessionId}/interests`, { headers }),
      ]);
      if (!resSession.ok) throw new Error(parseApiError(await resSession.text()));
      if (!resMeta.ok) throw new Error(parseApiError(await resMeta.text()));
      if (!resNotes.ok) throw new Error(parseApiError(await resNotes.text()));
      if (!resInterests.ok) throw new Error(parseApiError(await resInterests.text()));

      const [sessionData, metaData, notesData, interestsData] = await Promise.all([
        resSession.json(),
        resMeta.json(),
        resNotes.json(),
        resInterests.json(),
      ]);

      const nextSession = sessionData.session && typeof sessionData.session === "object" ? sessionData.session : null;
      if (!nextSession || typeof nextSession.id !== "number") {
        throw new Error("Session not found");
      }
      setSession(nextSession);
      setHeroes(
        (Array.isArray(metaData.heroes) ? metaData.heroes : []).filter(
          (h) => h && typeof h.id === "number" && typeof h.name === "string",
        ),
      );

      const notes = Array.isArray(notesData.notes) ? notesData.notes : [];
      setPublishedNote(notes.length > 0 ? notes[0] : null);
      setMyNote(
        notesData.my_note && typeof notesData.my_note === "object" && typeof notesData.my_note.id === "number"
          ? notesData.my_note
          : null,
      );

      const nextInterests = Array.isArray(interestsData.interests) ? interestsData.interests : [];
      setInterests(nextInterests);
      const mine =
        interestsData.my_interest && typeof interestsData.my_interest === "object"
          ? interestsData.my_interest
          : null;
      setMyInterest(mine);
      if (mine) {
        setInterestHeroIds((mine.heroes || []).map((h) => h.hero_id).filter((id) => typeof id === "number"));
        setInterestNote(typeof mine.note === "string" ? mine.note : "");
      } else {
        setInterestHeroIds([]);
        setInterestNote("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [user, sessionId]);

  useEffect(() => {
    if (!active || !user || !sessionId) return undefined;
    void loadAll();
    return undefined;
  }, [active, user, sessionId, loadAll]);

  const closeSession = async () => {
    if (!user || !session || closing) return;
    if (!window.confirm("Close this session? It will move to Past.")) return;
    setClosing(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/play-testing/sessions/${session.id}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close session");
    } finally {
      setClosing(false);
    }
  };

  const beginEditNote = () => {
    const html = bodyToRichHtml(myNote?.body) || "<p></p>";
    setNoteInitialHtml(html);
    setNoteEditorKey((k) => k + 1);
    setNoteError(null);
    setNoteEditing(true);
  };

  const cancelEditNote = () => {
    if (noteSubmitting || noteDeleting) return;
    setNoteEditing(false);
    setNoteError(null);
  };

  /** @param {boolean} publish */
  const saveNote = async (publish) => {
    if (!user || !sessionId) return;
    const html = noteEditorRef.current?.getHTML() ?? "";
    if (noteEditorRef.current?.isEmpty?.() || isEmptyRichHtml(html)) {
      setNoteError("Enter a note.");
      return;
    }
    setNoteSubmitting(true);
    setNoteSaveMode(publish ? "publish" : "draft");
    setNoteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/play-testing/sessions/${sessionId}/notes`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: html, publish }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      if (data.note && typeof data.note === "object") {
        setMyNote(/** @type {SessionNote} */ (data.note));
      }
      if (publish) {
        setPublishedNote(
          data.note
            ? {
                ...data.note,
                body: data.note.body,
                published: true,
              }
            : null,
        );
        setNoteEditing(false);
      }
      await loadAll();
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : publish ? "Failed to publish note" : "Failed to save draft");
    } finally {
      setNoteSubmitting(false);
      setNoteSaveMode(null);
    }
  };

  const deleteNote = async () => {
    if (!user || !sessionId || !myNote) return;
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    setNoteDeleting(true);
    setNoteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/play-testing/sessions/${sessionId}/notes`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error(parseApiError(await res.text()));
      setMyNote(null);
      setPublishedNote(null);
      setNoteEditing(false);
      await loadAll();
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Failed to delete note");
    } finally {
      setNoteDeleting(false);
    }
  };

  const noteUploadPath = useCallback(
    (file, ext) => {
      const sid = sessionId || "unknown";
      const uid = myUserId ?? "anon";
      return `play-testing/${sid}/notes/${uid}/inline-${Date.now()}.${ext}`;
    },
    [sessionId, myUserId],
  );

  const toggleInterestHero = (id) => {
    setInterestHeroIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveInterest = async () => {
    if (!user || !sessionId) return;
    if (interestHeroIds.length === 0) {
      setInterestError("Select at least one hero.");
      return;
    }
    if ([...interestNote].length > INTEREST_NOTE_MAX) {
      setInterestError(`Note must be ${INTEREST_NOTE_MAX} characters or fewer.`);
      return;
    }
    setInterestSubmitting(true);
    setInterestError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/play-testing/sessions/${sessionId}/interests`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ hero_ids: interestHeroIds, note: interestNote.trim() }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setInterestEditing(false);
      await loadAll();
    } catch (e) {
      setInterestError(e instanceof Error ? e.message : "Failed to save interest");
    } finally {
      setInterestSubmitting(false);
    }
  };

  const withdrawInterest = async (userId) => {
    if (!user || !sessionId) return;
    const mine = userId === myUserId;
    if (!window.confirm(mine ? "Withdraw your interest?" : "Remove this interest signup?")) return;
    setInterestSubmitting(true);
    setInterestError(null);
    try {
      const token = await user.getIdToken();
      const path = mine
        ? `/api/play-testing/sessions/${sessionId}/interests`
        : `/api/play-testing/sessions/${sessionId}/interests/${userId}`;
      const res = await fetch(path, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error(parseApiError(await res.text()));
      setInterestEditing(false);
      await loadAll();
    } catch (e) {
      setInterestError(e instanceof Error ? e.message : "Failed to remove interest");
    } finally {
      setInterestSubmitting(false);
    }
  };

  const ownerLabel = session ? sessionOwnerLabel(session) : "";
  const hasTimeframes = (session?.timeframes || []).length > 0;
  const whenEmptyLabel = session?.bucket === "past" || session?.status === 1 ? "Not now" : "Now";

  return (
    <div className={PANEL_TABS_BLEED} aria-label="Looking for Games session">
      <div className={`${PANEL_TABS_CONTENT_PAD} pt-4`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className={`${btnBase} ${btnTheme}`} onClick={() => onBack?.()}>
            ← Back
          </button>
          {isOwner && session && session.status !== 1 ? (
            <button type="button" className={`${btnBase} ${btnTheme}`} disabled={closing} onClick={() => void closeSession()}>
              {closing ? "Closing…" : "Close session"}
            </button>
          ) : null}
        </div>

        {error ? (
          <div
            className="mb-4 rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {loading && !session ? (
          <p className="m-0 text-[0.9rem] text-[#f4f0fa]/65">Loading session…</p>
        ) : null}

        {session ? (
          <div className="grid gap-5">
            <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
              <section className={shell}>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[1rem] font-semibold tracking-wide text-[#f4f0fa]">
                      {cardFormatName(session.format) ?? `Format ${session.format}`}
                    </span>
                    {isClosed ? (
                      <p className="mb-0 mt-2 text-[0.85rem] text-[#f4f0fa]/55">Past session</p>
                    ) : null}
                  </div>
                  <div className="flex max-w-[65%] flex-col items-end gap-1.5">
                    {ownerLabel ? (
                      <span className="text-right text-[1rem] font-medium leading-snug text-[#f4f0fa]">
                        {ownerLabel}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2">
                      {hasTimeframes ? (
                        (session.timeframes || []).map((tf, idx) => (
                          <span
                            key={tf.id ?? idx}
                            className="rounded-md border border-white/12 bg-black/35 px-2.5 py-1.5 text-[0.95rem] text-[#f4f0fa]"
                          >
                            {formatTimeframeLabel(tf.starts_at, tf.ends_at)}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-md border border-white/12 bg-black/35 px-2.5 py-1.5 text-[0.95rem] text-[#f4f0fa]">
                          {whenEmptyLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div>
                    <p className="mb-2.5 mt-0 text-[0.9rem] font-semibold uppercase tracking-[0.12em] text-[#f4f0fa]/90">
                      Playing
                    </p>
                    <HeroAvatarRow heroes={session.heroes_with || []} emptyLabel="Any / unspecified" size="xl" />
                  </div>
                  <div>
                    <p className="mb-2.5 mt-0 text-[0.9rem] font-semibold uppercase tracking-[0.12em] text-[#f4f0fa]/90">
                      Requesting
                    </p>
                    <HeroAvatarRow
                      heroes={session.heroes_against || []}
                      emptyLabel="Any / unspecified"
                      size="xl"
                    />
                  </div>
                </div>
              </section>

              <section className={shell}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-[1.05rem] font-semibold text-[#f4f0fa]">Interested players</h3>
                  {!isOwner && !isClosed ? (
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={() => {
                        setInterestEditing(true);
                        setInterestError(null);
                        if (myInterest) {
                          setInterestHeroIds(
                            (myInterest.heroes || []).map((h) => h.hero_id).filter((id) => typeof id === "number"),
                          );
                          setInterestNote(typeof myInterest.note === "string" ? myInterest.note : "");
                        }
                      }}
                    >
                      {myInterest ? "Edit my interest" : "I'm interested"}
                    </button>
                  ) : null}
                </div>

                {interestEditing && !isOwner ? (
                  <div className="mb-5 rounded-lg border border-white/12 bg-black/25 p-3 sm:p-4">
                    <p className="mb-2 mt-0 text-[0.85rem] font-medium text-[#f4f0fa]/85">
                      Heroes you can play ({CARD_FORMAT_NAMES[session.format] ?? "format"})
                    </p>
                    {legalHeroes.length === 0 ? (
                      <p className="m-0 text-[0.85rem] text-[#f4f0fa]/5">No legal heroes for this format.</p>
                    ) : (
                      <div className="mb-3 grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto">
                        {legalHeroes.map((hero) => {
                          const selected = interestHeroIds.includes(hero.id);
                          return (
                            <button
                              key={hero.id}
                              type="button"
                              onClick={() => toggleInterestHero(hero.id)}
                              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[0.85rem] transition ${
                                selected
                                  ? "border-emerald-400/45 bg-emerald-950/40 text-emerald-100"
                                  : "border-white/12 bg-black/30 text-[#f4f0fa]/85 hover:border-white/25"
                              }`}
                            >
                              <HeroAvatar hero={hero} selected={selected} size="sm" />
                              <span className="min-w-0 truncate">{hero.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <label className="grid gap-1.5 text-[0.85rem] text-[#f4f0fa]/85">
                      <span className="font-medium">
                        Short note <span className="font-normal text-[#f4f0fa]/45">(optional)</span>
                      </span>
                      <textarea
                        className="min-h-[4.5rem] resize-y rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-[#f4f0fa]"
                        value={interestNote}
                        maxLength={INTEREST_NOTE_MAX}
                        onChange={(e) => setInterestNote(e.target.value)}
                        placeholder="Availability, preferred matchup, etc."
                      />
                      <span className="text-[0.75rem] text-[#f4f0fa]/45">
                        {[...interestNote].length}/{INTEREST_NOTE_MAX}
                      </span>
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={`${btnBase} ${btnTheme}`}
                        disabled={interestSubmitting}
                        onClick={() => {
                          setInterestEditing(false);
                          setInterestError(null);
                        }}
                      >
                        Cancel
                      </button>
                      {myInterest ? (
                        <button
                          type="button"
                          className={`${btnBase} ${btnTheme}`}
                          disabled={interestSubmitting}
                          onClick={() => void withdrawInterest(myUserId)}
                        >
                          Withdraw
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={interestSubmitting}
                        onClick={() => void saveInterest()}
                      >
                        {interestSubmitting ? "Saving…" : "Save interest"}
                      </button>
                    </div>
                    {interestError ? <p className="mt-3 mb-0 text-[0.85rem] text-red-200">{interestError}</p> : null}
                  </div>
                ) : null}

                {interests.length === 0 ? (
                  <p className="m-0 text-[0.9rem] text-[#f4f0fa]/55">No one has signed up yet.</p>
                ) : (
                  <ul className="m-0 grid list-none gap-3 p-0">
                    {interests.map((row) => {
                      const label =
                        [row.first_name, row.username].filter(Boolean).join(" · ") || `User ${row.user_id}`;
                      const canRemove = isOwner || row.user_id === myUserId;
                      return (
                        <li
                          key={row.id}
                          className="rounded-lg border border-white/10 bg-black/25 p-3 sm:p-4"
                        >
                          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="m-0 text-[0.95rem] font-semibold text-[#f4f0fa]">{label}</p>
                              {row.note ? (
                                <p className="mb-0 mt-1 text-[0.85rem] leading-snug text-[#f4f0fa]/75">
                                  {row.note}
                                </p>
                              ) : null}
                            </div>
                            {canRemove ? (
                              <button
                                type="button"
                                className={`${btnBase} ${btnTheme}`}
                                disabled={interestSubmitting}
                                onClick={() => void withdrawInterest(row.user_id)}
                              >
                                {row.user_id === myUserId ? "Withdraw" : "Remove"}
                              </button>
                            ) : null}
                          </div>
                          <HeroAvatarRow
                            heroes={(row.heroes || []).map((h) => ({
                              ...h,
                              id: h.hero_id,
                            }))}
                            emptyLabel="No heroes listed"
                            size="md"
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
                {interestError && !interestEditing ? (
                  <p className="mt-3 mb-0 text-[0.85rem] text-red-200">{interestError}</p>
                ) : null}
              </section>
            </div>

            <section className={shell}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="m-0 text-[1.05rem] font-semibold text-[#f4f0fa]">Session notes</h3>
                {isOwner &&
                !noteEditing &&
                publishedNote &&
                !isEmptyRichHtml(publishedNote.body) ? (
                  <button type="button" className={btnPrimary} onClick={beginEditNote}>
                    Edit notes
                  </button>
                ) : null}
              </div>

              {noteEditing && isOwner ? (
                <div>
                  <p className="mb-3 mt-0 text-[0.85rem] text-[#f4f0fa]/65">
                    Save draft to keep working privately, or Publish to share with others.
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {myNote ? (
                      <button
                        type="button"
                        className={`${btnBase} ${btnTheme}`}
                        disabled={noteSubmitting || noteDeleting}
                        onClick={() => void deleteNote()}
                      >
                        {noteDeleting ? "Deleting…" : "Delete"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`${btnBase} ${btnTheme}`}
                      disabled={noteSubmitting || noteDeleting}
                      onClick={cancelEditNote}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`${btnBase} ${btnTheme}`}
                      disabled={noteSubmitting || noteDeleting}
                      onClick={() => void saveNote(false)}
                    >
                      {noteSaveMode === "draft" ? "Saving…" : "Save draft"}
                    </button>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={noteSubmitting || noteDeleting}
                      onClick={() => void saveNote(true)}
                    >
                      {noteSaveMode === "publish" ? "Publishing…" : "Publish"}
                    </button>
                  </div>
                  <RichTextEditor
                    key={noteEditorKey}
                    ref={noteEditorRef}
                    initialHtml={noteInitialHtml}
                    getIdToken={() => user.getIdToken()}
                    isLight={isLight}
                    placeholder="Session notes… Add images via Image, paste, or drag & drop."
                    minHeightClass="min-h-[18rem]"
                    buildUploadPath={noteUploadPath}
                  />
                  {noteError ? <p className="mt-3 text-[0.85rem] text-red-200">{noteError}</p> : null}
                </div>
              ) : publishedNote && !isEmptyRichHtml(publishedNote.body) ? (
                <div className="rounded-lg border border-white/10 bg-black/25 p-3 sm:p-4">
                  <RichTextHtml html={publishedNote.body} />
                </div>
              ) : isOwner ? (
                <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                  {hasUnpublishedDraft ? (
                    <p className="m-0 text-[0.95rem] text-[#f4f0fa]/55">You have an unpublished draft.</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={beginEditNote}
                    className="rounded-xl border border-emerald-400/50 bg-emerald-950/50 px-8 py-3.5 text-[1.1rem] font-semibold text-emerald-100 shadow-[0_4px_16px_rgba(16,80,50,0.25)] transition hover:border-emerald-300/60 hover:bg-emerald-900/55 sm:px-10 sm:py-4 sm:text-[1.2rem]"
                  >
                    {hasUnpublishedDraft ? "Continue draft" : "Add notes"}
                  </button>
                </div>
              ) : (
                <p className="m-0 text-[0.9rem] text-[#f4f0fa]/55">No published notes yet.</p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
