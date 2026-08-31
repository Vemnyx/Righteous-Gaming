import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import {
  CARD_FORMAT_NAMES,
  cardFormatName,
  formatUsesYoungHeroes,
  isValidCardFormatId,
} from "../constants/cardFormat";
import { canWriteDecksAndRecordings, isAdminRole } from "../constants/roles";

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

/** @param {ReleaseHero} hero @param {number} formatId */
function heroLegalForFormat(hero, formatId) {
  if (!isValidCardFormatId(formatId)) return false;
  const formats = Array.isArray(hero.formats) ? hero.formats : [];
  if (formats.length > 0 && !formats.includes(formatId)) return false;
  const preferYoung = formatUsesYoungHeroes(formatId);
  if (preferYoung === undefined) return true;
  return preferYoung ? hero.young === true : hero.young !== true;
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
 * @param {{ isLight: boolean, active: boolean, sessionId: string | null, onOpenSession: (id: number) => void, onCloseSession: () => void }} props
 */
export function ReleaseTeams({ isLight, active, sessionId, onOpenSession, onCloseSession }) {
  const { user, sessionProfile } = useAuth();
  const isAdmin = isAdminRole(sessionProfile?.role);
  const canSubmitContent = canWriteDecksAndRecordings(sessionProfile?.role);
  const myUserId = sessionProfile?.id;

  const [listTab, setListTab] = useState(/** @type {"current" | "past"} */ ("current"));
  const [sessions, setSessions] = useState(/** @type {ReleaseSession[]} */ ([]));
  const [heroesMeta, setHeroesMeta] = useState(/** @type {ReleaseHero[]} */ ([]));
  const [sets, setSets] = useState(/** @type {Array<{ id: number, name: string }>} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createFormat, setCreateFormat] = useState(/** @type {number | ""} */ (""));
  const [createSetId, setCreateSetId] = useState(/** @type {number | ""} */ (""));
  const [createHeroIds, setCreateHeroIds] = useState(/** @type {number[]} */ ([]));
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState(/** @type {string | null} */ (null));

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

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState(/** @type {string | null} */ (null));
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
  const btnBase =
    "inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-[0.85rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const btnTheme = isLight
    ? "border-[rgba(152,117,207,0.55)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white hover:brightness-110"
    : "border-purple-300/40 bg-purple-900/45 text-[#f4f0fa] hover:bg-purple-800/55";
  const btnGhost =
    "border-white/20 bg-transparent text-[#f4f0fa]/85 hover:border-white/35 hover:bg-white/5";
  const inputCls =
    "w-full rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none focus:border-purple-300/55";

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

  const createLegalHeroes = useMemo(() => {
    if (createFormat === "" || !isValidCardFormatId(createFormat)) return [];
    return heroesMeta.filter((h) => heroLegalForFormat(h, createFormat));
  }, [heroesMeta, createFormat]);

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
        if (isAdmin) {
          const setsRes = await fetch("/api/sets");
          if (cancelled) return;
          if (setsRes.ok) {
            const setsData = await setsRes.json();
            const list = Array.isArray(setsData.sets)
              ? setsData.sets
              : Array.isArray(setsData)
                ? setsData
                : [];
            setSets(
              list
                .filter((s) => s && typeof s.id === "number" && typeof s.name === "string")
                .map((s) => ({ id: s.id, name: s.name })),
            );
          }
        }
      } catch {
        /* ignore meta load errors until create */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, isAdmin]);

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

  const openCreate = () => {
    setCreateTitle("");
    setCreateFormat("");
    setCreateSetId("");
    setCreateHeroIds([]);
    setCreateError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!user) return;
    if (!createTitle.trim()) {
      setCreateError("Enter a title.");
      return;
    }
    if (createFormat === "" || !isValidCardFormatId(createFormat)) {
      setCreateError("Select a format.");
      return;
    }
    if (createHeroIds.length === 0) {
      setCreateError("Select at least one hero.");
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const headers = await authHeaders();
      const body = {
        title: createTitle.trim(),
        format: createFormat,
        hero_ids: createHeroIds,
        set_id: createSetId === "" ? null : createSetId,
      };
      const res = await fetch("/api/release-teams/sessions", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      setCreateOpen(false);
      if (data.session?.id) onOpenSession(data.session.id);
      else setReloadSeq((n) => n + 1);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setCreateSubmitting(false);
    }
  };

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

  const openNoteModal = () => {
    setNoteBody(myNote?.body ?? "");
    setNoteError(null);
    setNoteModalOpen(true);
  };

  const saveNote = async () => {
    if (!user || !sessionId || selectedHeroId == null) return;
    if (!noteBody.trim()) {
      setNoteError("Enter a note.");
      return;
    }
    setNoteSubmitting(true);
    setNoteError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/release-teams/sessions/${sessionId}/heroes/${selectedHeroId}/notes`,
        { method: "POST", headers, body: JSON.stringify({ body: noteBody }) },
      );
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setNoteModalOpen(false);
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

  const tabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => setListTab(id)}
      className={`${btnBase} ${listTab === id ? btnTheme : btnGhost}`}
    >
      {label}
    </button>
  );

  const heroTabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => setHeroTab(id)}
      className={`${btnBase} ${heroTab === id ? btnTheme : btnGhost}`}
    >
      {label}
    </button>
  );

  if (sessionId) {
    return (
      <div className="flex w-full flex-col gap-4 px-1 pb-8 pt-1 sm:px-0">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={`${btnBase} ${btnGhost}`} onClick={onCloseSession}>
            ← Back
          </button>
          {session ? (
            <div className="min-w-0 flex-1">
              <h2 className="m-0 truncate text-[1.15rem] font-semibold text-white">{session.title}</h2>
              <p className="m-0 text-[0.85rem] text-[#f4f0fa]/65">
                {cardFormatName(session.format)}
                {session.set_name ? ` · ${session.set_name}` : ""}
                {isPast ? " · Past (read-only)" : ""}
              </p>
            </div>
          ) : null}
          {isAdmin && isCurrent ? (
            <button type="button" className={`${btnBase} ${btnGhost}`} onClick={() => void closeSession()}>
              Close session
            </button>
          ) : null}
        </div>

        {sessionError ? (
          <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100" role="alert">
            {sessionError}
          </p>
        ) : null}

        {sessionLoading && !session ? (
          <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading session…</p>
        ) : session ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-w-[12rem] flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                Hero
                <select
                  className={inputCls}
                  value={selectedHeroId ?? ""}
                  onChange={(e) => {
                    setSelectedHeroId(Number(e.target.value));
                    setHeroTab("team");
                  }}
                >
                  {(session.heroes || []).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.young ? " (Young)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 self-end">{["team", "decklists", "notes", "recordings"].map((t) =>
                heroTabBtn(t, t === "decklists" ? "Decklists" : t.charAt(0).toUpperCase() + t.slice(1)),
              )}</div>
            </div>

            {heroDataError ? (
              <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100" role="alert">
                {heroDataError}
              </p>
            ) : null}

            {heroDataLoading && members.length === 0 && heroTab === "team" ? (
              <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading…</p>
            ) : null}

            {heroTab === "team" && selectedHero ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className={`rounded-2xl p-4 ${cardShell}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="m-0 text-[1rem] font-semibold text-white">Team</h3>
                    {isCurrent && !isAdmin ? (
                      iAmMember ? (
                        <button type="button" className={`${btnBase} ${btnGhost}`} onClick={() => void leaveTeam()}>
                          Leave team
                        </button>
                      ) : (
                        <button type="button" className={`${btnBase} ${btnTheme}`} onClick={() => void joinTeam()}>
                          Join team
                        </button>
                      )
                    ) : null}
                  </div>
                  {isAdmin && isCurrent ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      <select
                        className={`${inputCls} max-w-[16rem]`}
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
                        className={`${btnBase} ${btnTheme}`}
                        disabled={addUserId === ""}
                        onClick={() => void adminAddMember()}
                      >
                        Add
                      </button>
                    </div>
                  ) : null}
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {members.length === 0 ? (
                      <li className="text-[0.9rem] text-[#f4f0fa]/55">No members yet.</li>
                    ) : (
                      members.map((m) => (
                        <li
                          key={m.user_id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                        >
                          <div>
                            <p className="m-0 text-[0.95rem] font-medium text-[#f4f0fa]">{personLabel(m)}</p>
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
                <div className={`flex items-center justify-center rounded-2xl p-4 ${cardShell}`}>
                  {heroPortraitURL(selectedHero) ? (
                    <img
                      src={heroPortraitURL(selectedHero)}
                      alt={selectedHero.name}
                      className="max-h-[28rem] w-auto max-w-full rounded-xl object-contain"
                      draggable={false}
                    />
                  ) : (
                    <p className="m-0 text-[#f4f0fa]/5">No hero art</p>
                  )}
                </div>
              </div>
            ) : null}

            {heroTab === "decklists" ? (
              <div className="flex flex-col gap-3">
                {canMutateTeam && canSubmitContent ? (
                  <div>
                    <button type="button" className={`${btnBase} ${btnTheme}`} onClick={() => void openDeckImport()}>
                      Submit decklist
                    </button>
                    <p className="mt-1 text-[0.75rem] text-[#f4f0fa]/5">
                      Imports from Fabrary with {cardFormatName(session.format)} / {selectedHero?.name} expected on the
                      deck.
                    </p>
                  </div>
                ) : null}
                <div className={`overflow-x-auto rounded-2xl ${cardShell}`}>
                  <table className="w-full min-w-[28rem] border-collapse text-left text-[0.9rem]">
                    <thead>
                      <tr className="border-b border-white/15 text-[#f4f0fa]/65">
                        <th className="px-4 py-3 font-medium">Deck</th>
                        <th className="px-4 py-3 font-medium">Submitted by</th>
                        <th className="px-4 py-3 font-medium">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decks.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-[#f4f0fa]/5">
                            No decklists yet.
                          </td>
                        </tr>
                      ) : (
                        decks.map((d) => (
                          <tr key={d.id} className="border-b border-white/10">
                            <td className="px-4 py-3">
                              <a
                                className="font-medium text-purple-200 underline-offset-2 hover:underline"
                                href={`/resources/decks/${d.deck_id}`}
                              >
                                {d.deck_name}
                              </a>
                            </td>
                            <td className="px-4 py-3 text-[#f4f0fa]/8">{personLabel(d)}</td>
                            <td className="px-4 py-3">
                              {d.fabrary_link ? (
                                <a
                                  className="text-purple-200 underline-offset-2 hover:underline"
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
                {canMutateTeam ? (
                  <button type="button" className={`${btnBase} ${btnTheme}`} onClick={openNoteModal}>
                    {myNote ? "Update my note" : "Add note"}
                  </button>
                ) : null}
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {notes.length === 0 ? (
                    <li className="text-[0.9rem] text-[#f4f0fa]/55">No notes yet.</li>
                  ) : (
                    notes.map((row) => {
                      const expanded = expandedNoteId === row.id;
                      return (
                        <li key={row.id}>
                          <div className={`rounded-2xl ${cardShell} overflow-hidden`}>
                            {!expanded ? (
                              <button
                                type="button"
                                onClick={() => setExpandedNoteId(row.id)}
                                className="flex w-full flex-col gap-1 px-5 py-4 text-left hover:bg-white/[0.03]"
                              >
                                <p className="m-0 font-semibold text-[#f4f0fa]">{personLabel(row)}</p>
                                <p className="m-0 line-clamp-2 text-[0.9rem] text-[#f4f0fa]/7">{row.body}</p>
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
                                <p className="mt-3 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-[#f4f0fa]/85">
                                  {row.body}
                                </p>
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
                    className={`${btnBase} ${btnTheme}`}
                    onClick={() => {
                      setRecError(null);
                      setRecordingModalOpen(true);
                    }}
                  >
                    Add recording
                  </button>
                ) : null}
                <div className={`overflow-x-auto rounded-2xl ${cardShell}`}>
                  <table className="w-full min-w-[28rem] border-collapse text-left text-[0.9rem]">
                    <thead>
                      <tr className="border-b border-white/15 text-[#f4f0fa]/65">
                        <th className="px-4 py-3 font-medium">Recording</th>
                        <th className="px-4 py-3 font-medium">By</th>
                        <th className="px-4 py-3 font-medium">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordings.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-[#f4f0fa]/5">
                            No recordings yet.
                          </td>
                        </tr>
                      ) : (
                        recordings.map((rec) => (
                          <tr key={rec.id} className="border-b border-white/10">
                            <td className="px-4 py-3 text-[#f4f0fa]">
                              {rec.label?.trim() || "Untitled recording"}
                            </td>
                            <td className="px-4 py-3 text-[#f4f0fa]/8">{personLabel(rec)}</td>
                            <td className="px-4 py-3">
                              <a
                                className="text-purple-200 underline-offset-2 hover:underline"
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
          </>
        ) : null}

        {noteModalOpen
          ? createPortal(
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4"
                role="presentation"
                onClick={(e) => {
                  if (e.target === e.currentTarget && !noteSubmitting) setNoteModalOpen(false);
                }}
              >
                <div role="dialog" aria-modal="true" className={`w-full max-w-lg rounded-2xl p-5 ${cardShell}`}>
                  <h3 className="m-0 text-[1.05rem] font-semibold text-white">
                    {myNote ? "Update note" : "Add note"}
                  </h3>
                  <textarea
                    className={`${inputCls} mt-3 min-h-[10rem]`}
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Team notes for this hero…"
                  />
                  {noteError ? <p className="mt-2 text-[0.85rem] text-red-200">{noteError}</p> : null}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className={`${btnBase} ${btnGhost}`}
                      disabled={noteSubmitting}
                      onClick={() => setNoteModalOpen(false)}
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
              </div>,
              document.body,
            )
          : null}

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
                  <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                    Fabrary URL
                    <input
                      className={inputCls}
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://fabrary.net/decks/…"
                    />
                  </label>
                  <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
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
                  <p className="mt-1 text-[0.8rem] text-[#f4f0fa]/55">
                    Format and first hero are set to {cardFormatName(session?.format)} / {selectedHero?.name}.
                  </p>
                  <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                    URL
                    <input className={inputCls} value={recUrl} onChange={(e) => setRecUrl(e.target.value)} />
                  </label>
                  <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                    Label (optional)
                    <input className={inputCls} value={recLabel} onChange={(e) => setRecLabel(e.target.value)} />
                  </label>
                  <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
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
    <div className="flex w-full flex-col gap-4 px-1 pb-8 pt-1 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabBtn("current", "Current")}
          {tabBtn("past", "Past")}
        </div>
        {isAdmin && listTab === "current" ? (
          <button type="button" className={`${btnBase} ${btnTheme}`} onClick={openCreate}>
            New session
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100" role="alert">
          {error}
        </p>
      ) : null}

      {loading && sessions.length === 0 ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/60">
          {listTab === "current" ? "No current release team sessions." : "No past sessions."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenSession(s.id)}
              className={`rounded-2xl p-4 text-left transition hover:border-purple-300/40 ${cardShell}`}
            >
              <p className="m-0 text-[1.05rem] font-semibold text-white">{s.title}</p>
              <p className="mt-1 text-[0.85rem] text-[#f4f0fa]/65">
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
                      className="size-10 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20"
                    >
                      {url ? (
                        <img src={url} alt={h.name} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[0.7rem] font-semibold">
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

      {createOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !createSubmitting) setCreateOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className={`max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl p-5 ${cardShell}`}
              >
                <h3 className="m-0 text-[1.1rem] font-semibold text-white">New release team session</h3>
                <label className="mt-4 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                  Title
                  <input
                    className={inputCls}
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g. Heavy Hitters release"
                  />
                </label>
                <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                  Format
                  <select
                    className={inputCls}
                    value={createFormat}
                    onChange={(e) => {
                      setCreateFormat(e.target.value === "" ? "" : Number(e.target.value));
                      setCreateHeroIds([]);
                    }}
                  >
                    <option value="">Select format…</option>
                    {CARD_FORMAT_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                  Set (optional)
                  <select
                    className={inputCls}
                    value={createSetId}
                    onChange={(e) => setCreateSetId(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">None</option>
                    {sets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3">
                  <p className="m-0 mb-2 text-[0.8rem] text-[#f4f0fa]/7">Heroes</p>
                  {createFormat === "" ? (
                    <p className="m-0 text-[0.85rem] text-[#f4f0fa]/5">Select a format to choose heroes.</p>
                  ) : createLegalHeroes.length === 0 ? (
                    <p className="m-0 text-[0.85rem] text-[#f4f0fa]/5">No heroes for this format.</p>
                  ) : (
                    <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-lg border border-white/10 p-2">
                      {createLegalHeroes.map((h) => {
                        const selected = createHeroIds.includes(h.id);
                        const url = heroPortraitURL(h);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            title={h.name}
                            aria-pressed={selected}
                            onClick={() =>
                              setCreateHeroIds((ids) =>
                                selected ? ids.filter((x) => x !== h.id) : [...ids, h.id],
                              )
                            }
                            className={`flex items-center gap-2 rounded-full border px-2 py-1 text-[0.8rem] ${
                              selected
                                ? "border-emerald-300/70 bg-emerald-950/40 text-white"
                                : "border-white/20 bg-black/30 text-[#f4f0fa]/8"
                            }`}
                          >
                            <span className="size-7 overflow-hidden rounded-full bg-black/40">
                              {url ? (
                                <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                              ) : null}
                            </span>
                            {h.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {createError ? <p className="mt-3 text-[0.85rem] text-red-200">{createError}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className={`${btnBase} ${btnGhost}`}
                    disabled={createSubmitting}
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    disabled={createSubmitting}
                    onClick={() => void submitCreate()}
                  >
                    {createSubmitting ? "Creating…" : "Create"}
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
