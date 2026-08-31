import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { cardFormatName } from "../constants/cardFormat";
import { canWriteDecksAndRecordings, isAdminRole } from "../constants/roles";
import { RichTextEditor } from "./RichTextEditor";
import { RichTextHtml } from "./RichTextHtml";
import {
  PANEL_TABS_BLEED,
  PANEL_TABS_CONTENT_PAD,
  PANEL_TABS_HEADER_PAD,
  PanelTabList,
  panelTabButton,
} from "./PanelTabs";
import { bodyToRichHtml, isEmptyRichHtml } from "../utils/richTextDomPurify";

/** @typedef {{ id: number, name: string, young?: boolean, card_image_url?: string | null, art_image_url?: string | null, formats?: number[] }} ReleaseHero */

/** @typedef {{ id: number, title: string, format: number, set_id?: number | null, set_name?: string | null, status: number, created_at: string, closed_at?: string | null, heroes: ReleaseHero[] }} ReleaseSession */

/** @typedef {{ user_id: number, is_captain: boolean, first_name?: string | null, last_name?: string | null, username?: string | null, email: string }} ReleaseMember */

/** @typedef {{ id: number, user_id: number, body: string, updated_at: string, first_name?: string | null, username?: string | null, email: string }} ReleaseNote */

/** @typedef {{ id: number, deck_id: number, deck_name: string, user_id: number, fabrary_link?: string | null, first_name?: string | null, username?: string | null, email: string }} ReleaseDeck */

/** @typedef {{ id: number, recording_id: number, url: string, label?: string | null, user_id: number, first_name?: string | null, username?: string | null, email: string }} ReleaseRecording */

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
    /* ignore */
  }
  return raw;
}

/** @param {ReleaseHero} hero */
function heroPortraitURL(hero) {
  const art = hero?.art_image_url != null ? String(hero.art_image_url).trim() : "";
  if (art) return art;
  const card = hero?.card_image_url != null ? String(hero.card_image_url).trim() : "";
  return card || null;
}

/** Full card image (not cropped art) for Team tab display. @param {ReleaseHero} hero */
function heroCardImageURL(hero) {
  const card = hero?.card_image_url != null ? String(hero.card_image_url).trim() : "";
  if (card) return card;
  const art = hero?.art_image_url != null ? String(hero.art_image_url).trim() : "";
  return art || null;
}

/** @param {{ first_name?: string | null, last_name?: string | null, username?: string | null, email?: string }} row */
function personLabel(row) {
  const first = row.first_name != null ? String(row.first_name).trim() : "";
  const last = row.last_name != null ? String(row.last_name).trim() : "";
  const name = [first, last].filter(Boolean).join(" ");
  const discord = row.username != null ? String(row.username).trim() : "";
  if (name && discord) return `${name} · ${discord}`;
  if (name) return name;
  if (discord) return discord;
  return row.email || "User";
}

/**
 * @param {{ isLight: boolean, active: boolean, sessionId: string | null, onOpenSession: (id: number) => void }} props
 */
export function ReleaseTeams({ isLight, active, sessionId, onOpenSession }) {
  const { user, sessionProfile } = useAuth();
  const isAdmin = isAdminRole(sessionProfile?.role);
  const canSubmitContent = canWriteDecksAndRecordings(sessionProfile?.role);
  const myUserId = sessionProfile?.id;

  const [listTab, setListTab] = useState(/** @type {"current" | "past"} */ ("current"));
  const [sessions, setSessions] = useState(/** @type {ReleaseSession[]} */ ([]));
  const [heroesMeta, setHeroesMeta] = useState(/** @type {ReleaseHero[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [session, setSession] = useState(/** @type {ReleaseSession | null} */ (null));
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(/** @type {string | null} */ (null));
  const [selectedHeroId, setSelectedHeroId] = useState(/** @type {number | null} */ (null));
  const [heroTab, setHeroTab] = useState(/** @type {"team" | "decklists" | "notes" | "recordings"} */ ("team"));

  const [members, setMembers] = useState(/** @type {ReleaseMember[]} */ ([]));
  const [notes, setNotes] = useState(/** @type {ReleaseNote[]} */ ([]));
  const [decks, setDecks] = useState(/** @type {ReleaseDeck[]} */ ([]));
  const [recordings, setRecordings] = useState(/** @type {ReleaseRecording[]} */ ([]));
  const [heroDataLoading, setHeroDataLoading] = useState(false);
  const [heroDataError, setHeroDataError] = useState(/** @type {string | null} */ (null));
  const [heroReload, setHeroReload] = useState(0);

  const [eligibleUsers, setEligibleUsers] = useState(
    /** @type {Array<{ id: number, first_name?: string | null, last_name?: string | null, username?: string | null, email: string }>} */ ([]),
  );
  const [addUserId, setAddUserId] = useState(/** @type {number | ""} */ (""));

  const [noteEditing, setNoteEditing] = useState(false);
  const [noteEditorKey, setNoteEditorKey] = useState(0);
  const [noteInitialHtml, setNoteInitialHtml] = useState("<p></p>");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState(/** @type {string | null} */ (null));
  const noteEditorRef = useRef(
    /** @type {{ getHTML: () => string, isEmpty?: () => boolean } | null} */ (null),
  );
  const [expandedNoteId, setExpandedNoteId] = useState(/** @type {number | null} */ (null));

  const [deckImportOpen, setDeckImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importSourceId, setImportSourceId] = useState("");
  const [deckSources, setDeckSources] = useState(/** @type {Array<{ id: number, source: string }>} */ ([]));
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState(/** @type {string | null} */ (null));

  const [recordingModalOpen, setRecordingModalOpen] = useState(false);
  const [recUrl, setRecUrl] = useState("");
  const [recLabel, setRecLabel] = useState("");
  const [recSecondHeroId, setRecSecondHeroId] = useState(/** @type {number | ""} */ (""));
  const [recSubmitting, setRecSubmitting] = useState(false);
  const [recError, setRecError] = useState(/** @type {string | null} */ (null));

  const cardShell = isLight
    ? "border border-white/15 bg-[rgba(42,37,54,0.88)] shadow-[0_8px_28px_rgb(40_20_70/0.18)]"
    : "border border-white/15 bg-black/35 shadow-[0_8px_28px_rgb(0_0_0/0.35)]";
  const innerShell = "rounded-xl border border-white/12 bg-black/25";
  const btnBase =
    "inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-[0.85rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const btnAction =
    "inline-flex min-w-[11rem] items-center justify-center self-start rounded-lg border px-6 py-2.5 text-[0.95rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const btnTheme = isLight
    ? "border-[rgba(152,117,207,0.55)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white hover:brightness-110"
    : "border-purple-300/40 bg-purple-900/45 text-[#f4f0fa] hover:bg-purple-800/55";
  const btnGhost =
    "border-white/20 bg-transparent text-[#f4f0fa] hover:border-white/35 hover:bg-white/5";
  const inputCls =
    "w-full rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none focus:border-purple-300/55";
  const textMuted = "text-[#f4f0fa]/80";
  const textFaint = "text-[#f4f0fa]/70";

  const isPast = session?.status === 1;
  const isCurrent = session?.status === 0;
  const selectedHero = useMemo(
    () => session?.heroes?.find((h) => h.id === selectedHeroId) ?? null,
    [session, selectedHeroId],
  );
  const iAmMember = useMemo(
    () => members.some((m) => m.user_id === myUserId),
    [members, myUserId],
  );
  const canMutateTeam = Boolean(isCurrent && (isAdmin || iAmMember));
  const myNote = useMemo(() => notes.find((n) => n.user_id === myUserId) ?? null, [notes, myUserId]);

  const loadList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/release-teams/sessions?status=${listTab}`, { headers });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const rows = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(rows.filter((s) => s && typeof s.id === "number"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [user, listTab]);

  useEffect(() => {
    if (!active || !user || sessionId) return undefined;
    void loadList();
    return undefined;
  }, [active, user, sessionId, reloadSeq, loadList]);

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const metaRes = await fetch("/api/release-teams/meta", { headers });
        if (cancelled) return;
        if (metaRes.ok) {
          const meta = await metaRes.json();
          setHeroesMeta(Array.isArray(meta.heroes) ? meta.heroes : []);
        }
      } catch {
        /* ignore meta load errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user]);

  const loadSession = useCallback(async () => {
    if (!user || !sessionId) return;
    setSessionLoading(true);
    setSessionError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/release-teams/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const s = data.session;
      if (!s || typeof s.id !== "number") throw new Error("Invalid session");
      setSession(s);
      setSelectedHeroId((prev) => {
        const heroes = Array.isArray(s.heroes) ? s.heroes : [];
        if (prev != null && heroes.some((h) => h.id === prev)) return prev;
        return heroes[0]?.id ?? null;
      });
    } catch (e) {
      setSession(null);
      setSessionError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setSessionLoading(false);
    }
  }, [user, sessionId]);

  useEffect(() => {
    if (!active || !user || !sessionId) {
      setSession(null);
      return undefined;
    }
    void loadSession();
    return undefined;
  }, [active, user, sessionId, loadSession]);

  const loadHeroData = useCallback(async () => {
    if (!user || !sessionId || selectedHeroId == null) return;
    setHeroDataLoading(true);
    setHeroDataError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const base = `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}`;
      const [mRes, nRes, dRes, rRes] = await Promise.all([
        fetch(`${base}/members`, { headers }),
        fetch(`${base}/notes`, { headers }),
        fetch(`${base}/decks`, { headers }),
        fetch(`${base}/recordings`, { headers }),
      ]);
      if (!mRes.ok) throw new Error(parseApiError(await mRes.text()));
      if (!nRes.ok) throw new Error(parseApiError(await nRes.text()));
      if (!dRes.ok) throw new Error(parseApiError(await dRes.text()));
      if (!rRes.ok) throw new Error(parseApiError(await rRes.text()));
      const [mData, nData, dData, rData] = await Promise.all([
        mRes.json(),
        nRes.json(),
        dRes.json(),
        rRes.json(),
      ]);
      const nextNotes = Array.isArray(nData.notes) ? nData.notes : [];
      setMembers(Array.isArray(mData.members) ? mData.members : []);
      setNotes(nextNotes);
      setDecks(Array.isArray(dData.decks) ? dData.decks : []);
      setRecordings(Array.isArray(rData.recordings) ? rData.recordings : []);
      setExpandedNoteId(nextNotes[0]?.id ?? null);
    } catch (e) {
      setHeroDataError(e instanceof Error ? e.message : "Failed to load team data");
      setMembers([]);
      setNotes([]);
      setDecks([]);
      setRecordings([]);
    } finally {
      setHeroDataLoading(false);
    }
  }, [user, sessionId, selectedHeroId]);

  useEffect(() => {
    if (!active || !sessionId || selectedHeroId == null) return undefined;
    void loadHeroData();
    return undefined;
  }, [active, sessionId, selectedHeroId, heroReload, loadHeroData]);

  useEffect(() => {
    setNoteEditing(false);
    setNoteError(null);
  }, [sessionId, selectedHeroId]);

  useEffect(() => {
    if (!isAdmin || !user || !sessionId || !isCurrent) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/release-teams/eligible-users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setEligibleUsers(Array.isArray(data.users) ? data.users : []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user, sessionId, isCurrent]);

  const authHeaders = useCallback(async () => {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }, [user]);

  const closeSession = async () => {
    if (!user || !sessionId || !isAdmin) return;
    if (!window.confirm("Close this session? It will move to Past and become read-only.")) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/release-teams/sessions/${sessionId}/close`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      await loadSession();
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : "Failed to close session");
    }
  };

  const joinTeam = async () => {
    if (!user || !sessionId || selectedHeroId == null) return;
    const headers = await authHeaders();
    const res = await fetch(
      `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/join`,
      { method: "POST", headers },
    );
    if (!res.ok) {
      setHeroDataError(parseApiError(await res.text()));
      return;
    }
    setHeroReload((n) => n + 1);
  };

  const leaveTeam = async () => {
    if (!user || !sessionId || selectedHeroId == null) return;
    const headers = await authHeaders();
    const res = await fetch(
      `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/leave`,
      { method: "POST", headers },
    );
    if (!res.ok) {
      setHeroDataError(parseApiError(await res.text()));
      return;
    }
    setHeroReload((n) => n + 1);
  };

  const adminAddMember = async () => {
    if (!user || !sessionId || selectedHeroId == null || addUserId === "") return;
    const headers = await authHeaders();
    const res = await fetch(
      `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/members`,
      { method: "POST", headers, body: JSON.stringify({ user_id: addUserId }) },
    );
    if (!res.ok) {
      setHeroDataError(parseApiError(await res.text()));
      return;
    }
    setAddUserId("");
    setHeroReload((n) => n + 1);
  };

  const adminRemoveMember = async (userId) => {
    if (!user || !sessionId || selectedHeroId == null) return;
    const headers = await authHeaders();
    const res = await fetch(
      `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/members/${userId}`,
      { method: "DELETE", headers },
    );
    if (!res.ok) {
      setHeroDataError(parseApiError(await res.text()));
      return;
    }
    setHeroReload((n) => n + 1);
  };

  const setCaptain = async (userId) => {
    if (!user || !sessionId || selectedHeroId == null) return;
    const headers = await authHeaders();
    const res = await fetch(
      `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/captain`,
      { method: "POST", headers, body: JSON.stringify({ user_id: userId }) },
    );
    if (!res.ok) {
      setHeroDataError(parseApiError(await res.text()));
      return;
    }
    setHeroReload((n) => n + 1);
  };

  const openNoteEditor = () => {
    setNoteInitialHtml(bodyToRichHtml(myNote?.body) || "<p></p>");
    setNoteEditorKey((k) => k + 1);
    setNoteError(null);
    setNoteEditing(true);
  };

  const closeNoteEditor = () => {
    if (noteSubmitting) return;
    setNoteEditing(false);
    setNoteError(null);
  };

  const noteUploadPath = useCallback(
    (/** @type {File} */ _file, /** @type {string} */ ext) => {
      const sid = sessionId ?? "unknown";
      const hid = selectedHeroId ?? "hero";
      const uid = myUserId ?? "user";
      return `release-teams/${sid}/heroes/${hid}/notes/${uid}/inline-${Date.now()}.${ext}`;
    },
    [sessionId, selectedHeroId, myUserId],
  );

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not signed in");
    return user.getIdToken();
  }, [user]);

  const saveNote = async () => {
    if (!user || !sessionId || selectedHeroId == null) return;
    const html = noteEditorRef.current?.getHTML() ?? "";
    if (noteEditorRef.current?.isEmpty?.() || isEmptyRichHtml(html)) {
      setNoteError("Enter a note.");
      return;
    }
    setNoteSubmitting(true);
    setNoteError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/notes`,
        { method: "POST", headers, body: JSON.stringify({ body: html }) },
      );
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setNoteEditing(false);
      setHeroReload((n) => n + 1);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Failed to save note");
    } finally {
      setNoteSubmitting(false);
    }
  };

  const openDeckImport = async () => {
    setImportUrl("");
    setImportError(null);
    setImportSubmitting(false);
    setDeckImportOpen(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/deck-sources", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.sources) ? data.sources : [];
      const mapped = list
        .filter((s) => s && typeof s.id === "number")
        .map((s) => ({ id: s.id, source: s.source || `Source ${s.id}` }));
      setDeckSources(mapped);
      const member = mapped.find((s) => s.source.toLowerCase() === "member");
      const pick = member ?? mapped[0];
      setImportSourceId(pick ? String(pick.id) : "");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to load deck sources");
    }
  };

  const submitDeckImport = async () => {
    if (!user || !sessionId || selectedHeroId == null) return;
    if (!importUrl.trim()) {
      setImportError("Enter a Fabrary deck URL.");
      return;
    }
    if (!importSourceId) {
      setImportError("Select a deck source.");
      return;
    }
    setImportSubmitting(true);
    setImportError(null);
    try {
      const headers = await authHeaders();
      const importRes = await fetch("/api/me/decks/import-fabrary", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fabrary_link: importUrl.trim(),
          deck_source_id: Number(importSourceId),
        }),
      });
      if (!importRes.ok) throw new Error(parseApiError(await importRes.text()));
      const imported = await importRes.json();
      const deckId = imported.deck?.id;
      if (typeof deckId !== "number") throw new Error("Import succeeded but deck id missing");
      const linkRes = await fetch(
        `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/decks`,
        { method: "POST", headers, body: JSON.stringify({ deck_id: deckId }) },
      );
      if (!linkRes.ok) throw new Error(parseApiError(await linkRes.text()));
      setDeckImportOpen(false);
      setHeroReload((n) => n + 1);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportSubmitting(false);
    }
  };

  const submitRecording = async () => {
    if (!user || !sessionId || selectedHeroId == null) return;
    if (!recUrl.trim()) {
      setRecError("Enter a recording URL.");
      return;
    }
    if (recSecondHeroId === "") {
      setRecError("Select the opposing hero.");
      return;
    }
    setRecSubmitting(true);
    setRecError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/recordings/create`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            url: recUrl.trim(),
            label: recLabel.trim() || null,
            second_hero_id: recSecondHeroId,
          }),
        },
      );
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setRecordingModalOpen(false);
      setRecUrl("");
      setRecLabel("");
      setRecSecondHeroId("");
      setHeroReload((n) => n + 1);
    } catch (e) {
      setRecError(e instanceof Error ? e.message : "Failed to add recording");
    } finally {
      setRecSubmitting(false);
    }
  };

  if (sessionId) {
    return (
      <div className={PANEL_TABS_BLEED} aria-label="Release team session">
        <div className={`${PANEL_TABS_HEADER_PAD} pb-4`}>
          {sessionLoading && !session ? (
            <p className={`text-[1rem] ${textMuted}`}>Loading session…</p>
          ) : null}

          {session ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1">
                <h2 className="m-0 truncate text-[1.55rem] font-semibold leading-tight text-white sm:text-[1.75rem]">
                  {session.title}
                </h2>
                <p className={`mt-1.5 m-0 text-[0.95rem] sm:text-[1.05rem] ${textMuted}`}>
                  {cardFormatName(session.format)}
                  {session.set_name ? ` · ${session.set_name}` : ""}
                  {isPast ? " · Past (read-only)" : ""}
                </p>
              </div>
              <select
                aria-label="Hero"
                className={`${inputCls} w-auto min-w-[14rem] max-w-full px-4 py-2.5 text-[1.05rem] sm:min-w-[16rem] sm:text-[1.1rem]`}
                value={selectedHeroId ?? ""}
                onChange={(e) => {
                  setSelectedHeroId(Number(e.target.value));
                  setHeroTab("team");
                  setNoteEditing(false);
                }}
              >
                {(session.heroes || []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                    {h.young ? " (Young)" : ""}
                  </option>
                ))}
              </select>
              {isAdmin && isCurrent ? (
                <button type="button" className={`${btnBase} ${btnGhost}`} onClick={() => void closeSession()}>
                  Close session
                </button>
              ) : null}
            </div>
          ) : null}

          {sessionError ? (
            <p
              className="mt-3 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100"
              role="alert"
            >
              {sessionError}
            </p>
          ) : null}
        </div>

        {session && noteEditing ? (
          <div className={PANEL_TABS_CONTENT_PAD} aria-label={myNote ? "Edit note" : "Add note"}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="m-0 text-[1.25rem] font-semibold text-white sm:text-[1.35rem]">
                {myNote ? "Edit note" : "Add note"}
                {selectedHero ? (
                  <span className={`ml-2 text-[0.95rem] font-medium ${textMuted}`}>
                    · {selectedHero.name}
                    {selectedHero.young ? " (Young)" : ""}
                  </span>
                ) : null}
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${btnBase} ${btnGhost}`}
                  disabled={noteSubmitting}
                  onClick={closeNoteEditor}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${btnBase} ${btnTheme}`}
                  disabled={noteSubmitting}
                  onClick={() => void saveNote()}
                >
                  {noteSubmitting ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <RichTextEditor
              key={noteEditorKey}
              ref={noteEditorRef}
              initialHtml={noteInitialHtml}
              getIdToken={getIdToken}
              isLight={isLight}
              placeholder="Team notes for this hero… Add images via Image, paste, or drag & drop."
              minHeightClass="min-h-[22rem]"
              buildUploadPath={noteUploadPath}
            />
            {noteError ? <p className="mt-3 text-[0.85rem] text-red-200">{noteError}</p> : null}
          </div>
        ) : null}

        {session && !noteEditing ? (
          <>
            <PanelTabList ariaLabel="Hero sections">
              {panelTabButton("team", heroTab === "team", "Team", () => setHeroTab("team"))}
              {panelTabButton("decklists", heroTab === "decklists", "Decklists", () => setHeroTab("decklists"))}
              {panelTabButton("notes", heroTab === "notes", "Notes", () => setHeroTab("notes"))}
              {panelTabButton("recordings", heroTab === "recordings", "Recordings", () =>
                setHeroTab("recordings"),
              )}
            </PanelTabList>

            <div className={PANEL_TABS_CONTENT_PAD} role="tabpanel">
                {heroDataError ? (
                  <p
                    className="mb-3 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100"
                    role="alert"
                  >
                    {heroDataError}
                  </p>
                ) : null}

                {heroDataLoading && members.length === 0 && heroTab === "team" ? (
                  <p className={`text-[0.9rem] ${textMuted}`}>Loading…</p>
                ) : null}

            {heroTab === "team" && selectedHero ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className={`p-4 ${innerShell}`}>
                  {isCurrent && !isAdmin ? (
                    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                      {iAmMember ? (
                        <button type="button" className={`${btnBase} ${btnGhost}`} onClick={() => void leaveTeam()}>
                          Leave team
                        </button>
                      ) : (
                        <button type="button" className={`${btnBase} ${btnTheme}`} onClick={() => void joinTeam()}>
                          Join team
                        </button>
                      )}
                    </div>
                  ) : null}
                  {isAdmin && isCurrent ? (
                    <div className="mb-3 flex flex-wrap items-stretch gap-2">
                      <select
                        aria-label="Add user"
                        className={`${inputCls} min-w-[14rem] flex-1 px-4 py-2.5 text-[1.05rem] sm:min-w-[16rem] sm:text-[1.1rem]`}
                        value={addUserId}
                        onChange={(e) => setAddUserId(e.target.value === "" ? "" : Number(e.target.value))}
                      >
                        <option value="">Add user…</option>
                        {eligibleUsers
                          .filter((u) => !members.some((m) => m.user_id === u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {personLabel(u)}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className={`${btnTheme} inline-flex items-center justify-center rounded-lg border px-5 py-2.5 text-[1.05rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:text-[1.1rem]`}
                        disabled={addUserId === ""}
                        onClick={() => void adminAddMember()}
                      >
                        Add
                      </button>
                    </div>
                  ) : null}
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {members.length === 0 ? (
                      <li className={`text-[0.9rem] ${textFaint}`}>No members yet.</li>
                    ) : (
                      members.map((m) => (
                        <li
                          key={m.user_id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                        >
                          <div>
                            <p className="m-0 text-[0.95rem] font-medium text-white">{personLabel(m)}</p>
                            {m.is_captain ? (
                              <p className="m-0 text-[0.75rem] font-semibold uppercase tracking-wide text-emerald-300/90">
                                Team Captain
                              </p>
                            ) : null}
                          </div>
                          {isAdmin && isCurrent ? (
                            <div className="flex flex-wrap gap-1.5">
                              {!m.is_captain ? (
                                <button
                                  type="button"
                                  className={`${btnBase} ${btnGhost}`}
                                  onClick={() => void setCaptain(m.user_id)}
                                >
                                  Make captain
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={`${btnBase} ${btnGhost}`}
                                onClick={() => void adminRemoveMember(m.user_id)}
                              >
                                Remove
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="flex items-center justify-center">
                  {heroCardImageURL(selectedHero) ? (
                    <img
                      src={heroCardImageURL(selectedHero)}
                      alt={selectedHero.name}
                      className="max-h-[28rem] w-auto max-w-full rounded-xl object-contain"
                      draggable={false}
                    />
                  ) : (
                    <p className={`m-0 ${textFaint}`}>No card image</p>
                  )}
                </div>
              </div>
            ) : null}

            {heroTab === "decklists" ? (
              <div className="flex flex-col gap-3">
                {canMutateTeam && canSubmitContent ? (
                  <div>
                    <button type="button" className={`${btnAction} ${btnTheme}`} onClick={() => void openDeckImport()}>
                      Submit decklist
                    </button>
                    <p className={`mt-1.5 text-[0.8rem] ${textFaint}`}>
                      Imports from Fabrary with {cardFormatName(session.format)} / {selectedHero?.name} expected on the
                      deck.
                    </p>
                  </div>
                ) : null}
                <div className={`overflow-x-auto ${innerShell}`}>
                  <table className="w-full min-w-[28rem] border-collapse text-left text-[0.9rem] text-[#f4f0fa]">
                    <thead>
                      <tr className={`border-b border-white/15 ${textMuted}`}>
                        <th className="px-4 py-3 font-medium">Deck</th>
                        <th className="px-4 py-3 font-medium">Submitted by</th>
                        <th className="px-4 py-3 font-medium">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decks.length === 0 ? (
                        <tr>
                          <td colSpan={3} className={`px-4 py-6 ${textFaint}`}>
                            No decklists yet.
                          </td>
                        </tr>
                      ) : (
                        decks.map((d) => (
                          <tr key={d.id} className="border-b border-white/10">
                            <td className="px-4 py-3">
                              <a
                                className="font-medium text-purple-100 underline-offset-2 hover:underline"
                                href={`/resources/decks/${d.deck_id}`}
                              >
                                {d.deck_name}
                              </a>
                            </td>
                            <td className="px-4 py-3 text-[#f4f0fa]">{personLabel(d)}</td>
                            <td className="px-4 py-3">
                              {d.fabrary_link ? (
                                <a
                                  className="text-purple-100 underline-offset-2 hover:underline"
                                  href={d.fabrary_link}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Fabrary
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {heroTab === "notes" ? (
              <div className="flex flex-col gap-3">
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {canMutateTeam && !myNote ? (
                    <li>
                      <div
                        className={`${innerShell} flex min-h-[9rem] items-center justify-center px-5 py-8`}
                      >
                        <button
                          type="button"
                          className={`${btnAction} ${btnTheme}`}
                          onClick={openNoteEditor}
                        >
                          Add Notes
                        </button>
                      </div>
                    </li>
                  ) : null}
                  {notes.length === 0 && !(canMutateTeam && !myNote) ? (
                    <li className={`text-[0.9rem] ${textFaint}`}>No notes yet.</li>
                  ) : (
                    notes.map((row) => {
                      const canEditMine = Boolean(canMutateTeam && row.user_id === myUserId);
                      const expanded = !canEditMine && expandedNoteId === row.id;
                      return (
                        <li key={row.id}>
                          <div className={`${innerShell} overflow-hidden`}>
                            {!expanded ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (canEditMine) openNoteEditor();
                                  else setExpandedNoteId(row.id);
                                }}
                                className="flex w-full flex-col gap-1 px-5 py-4 text-left hover:bg-white/[0.03]"
                              >
                                <p className="m-0 font-semibold text-white">
                                  {personLabel(row)}
                                  {canEditMine ? (
                                    <span className={`ml-2 text-[0.8rem] font-medium ${textFaint}`}>
                                      · Click to edit
                                    </span>
                                  ) : null}
                                </p>
                                <div className="max-h-[3.2rem] overflow-hidden text-[0.9rem] text-[#f4f0fa] [&_img]:hidden">
                                  <RichTextHtml html={row.body} />
                                </div>
                              </button>
                            ) : (
                              <div className="px-5 py-4">
                                <button
                                  type="button"
                                  onClick={() => setExpandedNoteId(null)}
                                  className="m-0 border-0 bg-transparent p-0 text-left text-[1rem] font-semibold text-white"
                                >
                                  {personLabel(row)}
                                </button>
                                <div className="mt-3 text-[#f4f0fa]">
                                  <RichTextHtml html={row.body} />
                                </div>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            ) : null}

            {heroTab === "recordings" ? (
              <div className="flex flex-col gap-3">
                {canMutateTeam && canSubmitContent ? (
                  <button
                    type="button"
                    className={`${btnAction} ${btnTheme}`}
                    onClick={() => {
                      setRecError(null);
                      setRecordingModalOpen(true);
                    }}
                  >
                    Add recording
                  </button>
                ) : null}
                <div className={`overflow-x-auto ${innerShell}`}>
                  <table className="w-full min-w-[28rem] border-collapse text-left text-[0.9rem] text-[#f4f0fa]">
                    <thead>
                      <tr className={`border-b border-white/15 ${textMuted}`}>
                        <th className="px-4 py-3 font-medium">Recording</th>
                        <th className="px-4 py-3 font-medium">By</th>
                        <th className="px-4 py-3 font-medium">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordings.length === 0 ? (
                        <tr>
                          <td colSpan={3} className={`px-4 py-6 ${textFaint}`}>
                            No recordings yet.
                          </td>
                        </tr>
                      ) : (
                        recordings.map((rec) => (
                          <tr key={rec.id} className="border-b border-white/10">
                            <td className="px-4 py-3 text-[#f4f0fa]">
                              {rec.label?.trim() || "Untitled recording"}
                            </td>
                            <td className="px-4 py-3 text-[#f4f0fa]">{personLabel(rec)}</td>
                            <td className="px-4 py-3">
                              <a
                                className="text-purple-100 underline-offset-2 hover:underline"
                                href={`/resources/recordings/${rec.recording_id}`}
                              >
                                View
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            </div>
          </>
        ) : null}

        {deckImportOpen
          ? createPortal(
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4"
                role="presentation"
                onClick={(e) => {
                  if (e.target === e.currentTarget && !importSubmitting) setDeckImportOpen(false);
                }}
              >
                <div role="dialog" aria-modal="true" className={`w-full max-w-md rounded-2xl p-5 ${cardShell}`}>
                  <h3 className="m-0 text-[1.05rem] font-semibold text-white">Submit decklist</h3>
                  <label className={`mt-3 flex flex-col gap-1 text-[0.85rem] ${textMuted}`}>
                    Fabrary URL
                    <input
                      className={inputCls}
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://fabrary.net/decks/…"
                    />
                  </label>
                  <label className={`mt-3 flex flex-col gap-1 text-[0.85rem] ${textMuted}`}>
                    Deck source
                    <select
                      className={inputCls}
                      value={importSourceId}
                      onChange={(e) => setImportSourceId(e.target.value)}
                    >
                      {deckSources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.source}
                        </option>
                      ))}
                    </select>
                  </label>
                  {importError ? <p className="mt-2 text-[0.85rem] text-red-200">{importError}</p> : null}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className={`${btnBase} ${btnGhost}`}
                      disabled={importSubmitting}
                      onClick={() => setDeckImportOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`${btnBase} ${btnTheme}`}
                      disabled={importSubmitting}
                      onClick={() => void submitDeckImport()}
                    >
                      {importSubmitting ? "Importing…" : "Import & submit"}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

        {recordingModalOpen
          ? createPortal(
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4"
                role="presentation"
                onClick={(e) => {
                  if (e.target === e.currentTarget && !recSubmitting) setRecordingModalOpen(false);
                }}
              >
                <div role="dialog" aria-modal="true" className={`w-full max-w-md rounded-2xl p-5 ${cardShell}`}>
                  <h3 className="m-0 text-[1.05rem] font-semibold text-white">Add recording</h3>
                  <p className={`mt-1 text-[0.85rem] ${textMuted}`}>
                    Format and first hero are set to {cardFormatName(session?.format)} / {selectedHero?.name}.
                  </p>
                  <label className={`mt-3 flex flex-col gap-1 text-[0.85rem] ${textMuted}`}>
                    URL
                    <input className={inputCls} value={recUrl} onChange={(e) => setRecUrl(e.target.value)} />
                  </label>
                  <label className={`mt-3 flex flex-col gap-1 text-[0.85rem] ${textMuted}`}>
                    Label (optional)
                    <input className={inputCls} value={recLabel} onChange={(e) => setRecLabel(e.target.value)} />
                  </label>
                  <label className={`mt-3 flex flex-col gap-1 text-[0.85rem] ${textMuted}`}>
                    Opposing hero
                    <select
                      className={inputCls}
                      value={recSecondHeroId}
                      onChange={(e) => setRecSecondHeroId(e.target.value === "" ? "" : Number(e.target.value))}
                    >
                      <option value="">Select…</option>
                      {heroesMeta
                        .filter((h) => h.id !== selectedHeroId)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                            {h.young ? " (Young)" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  {recError ? <p className="mt-2 text-[0.85rem] text-red-200">{recError}</p> : null}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className={`${btnBase} ${btnGhost}`}
                      disabled={recSubmitting}
                      onClick={() => setRecordingModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`${btnBase} ${btnTheme}`}
                      disabled={recSubmitting}
                      onClick={() => void submitRecording()}
                    >
                      {recSubmitting ? "Saving…" : "Save"}
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

  return (
    <div className={PANEL_TABS_BLEED} aria-label="Release Teams">
      <PanelTabList ariaLabel="Release Teams sections">
        {panelTabButton("current", listTab === "current", "Current", () => setListTab("current"))}
        {panelTabButton("past", listTab === "past", "Past", () => setListTab("past"))}
      </PanelTabList>

      <div className={PANEL_TABS_CONTENT_PAD} role="tabpanel">
          {error ? (
            <p
              className="mb-3 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {loading && sessions.length === 0 ? (
            <p className={`text-[0.9rem] ${textMuted}`}>Loading…</p>
          ) : sessions.length === 0 ? (
            <p className={`text-[0.9rem] ${textMuted}`}>
              {listTab === "current" ? "No current release team sessions." : "No past sessions."}
              {isAdmin && listTab === "current" ? (
                <>
                  {" "}
                  Create sessions from the Admin → Release Teams tab.
                </>
              ) : null}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSession(s.id)}
                  className={`${innerShell} p-4 text-left transition hover:border-purple-300/40 hover:bg-black/35`}
                >
                  <p className="m-0 text-[1.05rem] font-semibold text-white">{s.title}</p>
                  <p className={`mt-1 text-[0.85rem] ${textMuted}`}>
                    {cardFormatName(s.format)}
                    {s.set_name ? ` · ${s.set_name}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(s.heroes || []).map((h) => {
                      const url = heroPortraitURL(h);
                      return (
                        <span
                          key={h.id}
                          title={h.name}
                          className="size-14 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20 sm:size-16"
                        >
                          {url ? (
                            <img src={url} alt={h.name} className="h-full w-full object-cover" draggable={false} />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[0.85rem] font-semibold sm:text-[0.95rem]">
                              {(h.name || "?").charAt(0)}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
