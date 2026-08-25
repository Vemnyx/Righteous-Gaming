import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import {
  CARD_FORMAT_NAMES,
  cardFormatName,
  formatUsesYoungHeroes,
  isValidCardFormatId,
} from "../constants/cardFormat";

/** @typedef {{ id: number, name: string, young?: boolean, card_image_url?: string | null, art_image_url?: string | null, formats?: number[] }} PlayTestingHero */

/** @typedef {{ hero_id: number, side: number, name: string, young?: boolean, card_image_url?: string | null, art_image_url?: string | null }} SessionHero */

/** @typedef {{ id?: number, starts_at: string, ends_at?: string | null, sort_order: number }} SessionTimeframe */

/** @typedef {{ id: number, user_id: number, format: number, created_at: string, heroes_with: SessionHero[], heroes_against: SessionHero[], timeframes: SessionTimeframe[] }} PlayTestingSession */

/** @typedef {{ key: string, mode: "now_open" | "range", startsLocal: string, endsLocal: string }} DraftTimeframe */

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

/**
 * @param {PlayTestingHero | SessionHero} hero
 * @returns {string | null}
 */
function heroPortraitURL(hero) {
  const art = hero?.art_image_url != null ? String(hero.art_image_url).trim() : "";
  if (art) return art;
  const card = hero?.card_image_url != null ? String(hero.card_image_url).trim() : "";
  return card || null;
}

/**
 * @param {PlayTestingHero} hero
 * @param {number} formatId
 */
function heroLegalForFormat(hero, formatId) {
  if (!isValidCardFormatId(formatId)) return false;
  const formats = Array.isArray(hero.formats) ? hero.formats : [];
  if (!formats.includes(formatId)) return false;
  const preferYoung = formatUsesYoungHeroes(formatId);
  if (preferYoung === undefined) return true;
  return preferYoung ? hero.young === true : hero.young !== true;
}

/** @param {string | undefined | null} iso */
function formatTimeframeLabel(startsAt, endsAt) {
  const start = startsAt ? new Date(startsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return "—";
  const startLabel = start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (endsAt == null || endsAt === "") {
    return `${startLabel} → open`;
  }
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${startLabel} → open`;
  const sameDay = start.toDateString() === end.toDateString();
  const endLabel = end.toLocaleString(undefined, {
    month: sameDay ? undefined : "short",
    day: sameDay ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}

/** @returns {string} datetime-local value */
function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** @param {string} localValue */
function localInputToISO(localValue) {
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

let timeframeKeySeq = 0;
function newDraftTimeframe(mode = "now_open") {
  timeframeKeySeq += 1;
  const nowLocal = toLocalInputValue(new Date());
  return {
    key: `tf-${timeframeKeySeq}`,
    mode,
    startsLocal: nowLocal,
    endsLocal: "",
  };
}

/**
 * @param {{ hero: PlayTestingHero | SessionHero, selected?: boolean, onClick?: () => void, size?: "sm" | "md" | "lg" }} props
 */
function HeroAvatar({ hero, selected = false, onClick, size = "md" }) {
  const url = heroPortraitURL(hero);
  const dim = size === "lg" ? "size-16 sm:size-[4.5rem]" : size === "sm" ? "size-9" : "size-12";
  const ring = selected
    ? "ring-2 ring-emerald-300/90 ring-offset-2 ring-offset-[#120818]"
    : "ring-1 ring-white/20";
  const base = `${dim} shrink-0 overflow-hidden rounded-full bg-black/40 ${ring}`;
  const initialSize = size === "lg" ? "text-[1.05rem]" : "text-[0.7rem]";
  const inner = url ? (
    <img
      src={url}
      alt=""
      className="h-full w-full object-cover object-center"
      draggable={false}
    />
  ) : (
    <span className={`flex h-full w-full items-center justify-center ${initialSize} font-semibold text-[#f4f0fa]/75`}>
      {(hero.name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        title={hero.name}
        aria-pressed={selected}
        onClick={onClick}
        className={`${base} transition hover:ring-white/45`}
      >
        {inner}
      </button>
    );
  }
  return (
    <span title={hero.name} className={base}>
      {inner}
    </span>
  );
}

/**
 * @param {{ heroes: Array<PlayTestingHero | SessionHero>, emptyLabel: string, size?: "sm" | "md" | "lg" }} props
 */
function HeroAvatarRow({ heroes, emptyLabel, size = "sm" }) {
  if (!heroes.length) {
    return <p className="m-0 text-[0.9rem] text-[#f4f0fa]/55">{emptyLabel}</p>;
  }
  return (
    <div className={`flex flex-wrap ${size === "lg" ? "gap-2.5" : "gap-1.5"}`}>
      {heroes.map((h) => (
        <HeroAvatar key={h.hero_id ?? h.id} hero={h} size={size} />
      ))}
    </div>
  );
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function PlayTesting({ isLight, active }) {
  const { user } = useAuth();
  const [viewTab, setViewTab] = useState(/** @type {"looking-for-games" | "notes"} */ ("looking-for-games"));
  const [sessions, setSessions] = useState(/** @type {PlayTestingSession[]} */ ([]));
  const [heroes, setHeroes] = useState(/** @type {PlayTestingHero[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [formatId, setFormatId] = useState(/** @type {number | ""} */ (""));
  const [withIds, setWithIds] = useState(/** @type {number[]} */ ([]));
  const [againstIds, setAgainstIds] = useState(/** @type {number[]} */ ([]));
  const [timeframes, setTimeframes] = useState(/** @type {DraftTimeframe[]} */ (() => [newDraftTimeframe("now_open")]));
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [resSessions, resMeta] = await Promise.all([
        fetch("/api/play-testing/sessions", { headers }),
        fetch("/api/play-testing/meta", { headers }),
      ]);
      if (!resSessions.ok) throw new Error(parseApiError(await resSessions.text()));
      if (!resMeta.ok) throw new Error(parseApiError(await resMeta.text()));
      const sessionsData = await resSessions.json();
      const metaData = await resMeta.json();
      const nextSessions = Array.isArray(sessionsData.sessions) ? sessionsData.sessions : [];
      const nextHeroes = Array.isArray(metaData.heroes) ? metaData.heroes : [];
      setSessions(
        nextSessions.filter((s) => s && typeof s.id === "number" && typeof s.format === "number"),
      );
      setHeroes(
        nextHeroes.filter((h) => h && typeof h.id === "number" && typeof h.name === "string"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load play testing");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active || !user) return undefined;
    void load();
    return undefined;
  }, [active, user, reloadSeq, load]);

  const legalHeroes = useMemo(() => {
    if (formatId === "" || !isValidCardFormatId(formatId)) return [];
    return heroes.filter((h) => heroLegalForFormat(h, formatId));
  }, [heroes, formatId]);

  const openModal = () => {
    setFormatId("");
    setWithIds([]);
    setAgainstIds([]);
    setTimeframes([newDraftTimeframe("now_open")]);
    setModalError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setModalError(null);
  };

  const toggleId = (list, setList, id) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const submit = async () => {
    if (!user) return;
    if (formatId === "" || !isValidCardFormatId(formatId)) {
      setModalError("Select a format.");
      return;
    }
    if (timeframes.length === 0) {
      setModalError("Add at least one timeframe.");
      return;
    }

    /** @type {Array<{ mode: string, starts_at?: string, ends_at?: string }>} */
    const payloadTimeframes = [];
    for (const tf of timeframes) {
      if (tf.mode === "now_open") {
        payloadTimeframes.push({ mode: "now_open" });
        continue;
      }
      const startsISO = localInputToISO(tf.startsLocal);
      if (!startsISO) {
        setModalError("Each range timeframe needs a valid start time.");
        return;
      }
      const endsISO = tf.endsLocal.trim() ? localInputToISO(tf.endsLocal) : null;
      if (tf.endsLocal.trim() && !endsISO) {
        setModalError("Each range timeframe needs a valid end time (or leave end empty).");
        return;
      }
      if (endsISO && new Date(endsISO).getTime() < new Date(startsISO).getTime()) {
        setModalError("End time must be on or after start time.");
        return;
      }
      payloadTimeframes.push({
        mode: "range",
        starts_at: startsISO,
        ...(endsISO ? { ends_at: endsISO } : {}),
      });
    }

    setSubmitting(true);
    setModalError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/play-testing/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          format: formatId,
          heroes_with: withIds,
          heroes_against: againstIds,
          timeframes: payloadTimeframes,
        }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setModalOpen(false);
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setSubmitting(false);
    }
  };

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary =
    "rounded-lg border border-emerald-400/45 bg-emerald-950/45 px-3 py-1.5 text-[0.8125rem] font-semibold text-emerald-100 transition-colors hover:border-emerald-300/55 hover:bg-emerald-900/45 disabled:cursor-not-allowed disabled:opacity-45";

  /**
   * @param {"looking-for-games" | "notes"} id
   * @param {string} label
   */
  const viewTabBtn = (id, label) => {
    const on = viewTab === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        className={`rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition ${
          on ? "bg-white/10 text-[#f4f0fa]" : "text-[#f4f0fa]/55 hover:bg-white/[0.06] hover:text-[#f4f0fa]/85"
        }`}
        onClick={() => setViewTab(id)}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2" aria-label="Play Testing">
      <div>
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Play Testing</h2>
        <div className="mt-3 inline-flex flex-wrap gap-0.5 rounded-lg bg-black/15 p-0.5" role="tablist" aria-label="Play Testing sections">
          {viewTabBtn("looking-for-games", "Looking For Games")}
          {viewTabBtn("notes", "Notes")}
        </div>
      </div>

      {viewTab === "looking-for-games" ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="m-0 max-w-2xl text-[0.85rem] leading-snug text-[#f4f0fa]/70">
              Schedule sessions with heroes to test and opponents to face.
            </p>
            <button type="button" className={btnPrimary} onClick={openModal}>
              New session
            </button>
          </div>

          {error ? (
            <div
              className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {loading && sessions.length === 0 ? (
            <p className="m-0 text-[0.9rem] text-[#f4f0fa]/65">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <div className="flex min-h-[12rem] flex-1 items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 px-4 text-center">
              <p className="m-0 text-[0.9rem] text-[#f4f0fa]/55">No play testing sessions yet.</p>
            </div>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="rounded-xl border border-white/[0.14] bg-black/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6"
                >
                  <div className="mb-4">
                    <span className="rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[0.875rem] font-semibold tracking-wide text-[#f4f0fa]">
                      {cardFormatName(session.format) ?? `Format ${session.format}`}
                    </span>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <p className="mb-2 mt-0 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-[#f4f0fa]/7">
                        Test with
                      </p>
                      <HeroAvatarRow heroes={session.heroes_with || []} emptyLabel="Any / unspecified" size="lg" />
                    </div>
                    <div>
                      <p className="mb-2 mt-0 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-[#f4f0fa]/7">
                        Against
                      </p>
                      <HeroAvatarRow heroes={session.heroes_against || []} emptyLabel="Any / unspecified" size="lg" />
                    </div>
                    <div>
                      <p className="mb-2 mt-0 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-[#f4f0fa]/7">
                        When
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(session.timeframes || []).map((tf, idx) => (
                          <span
                            key={tf.id ?? idx}
                            className="rounded-md border border-white/12 bg-black/35 px-2.5 py-1.5 text-[0.875rem] text-[#f4f0fa]"
                          >
                            {formatTimeframeLabel(tf.starts_at, tf.ends_at)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {viewTab === "notes" ? <div className="min-h-0 flex-1" aria-label="Notes" /> : null}

      {modalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeModal();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="New play testing session"
                className="max-h-[min(92vh,52rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/20 bg-[#160d22] p-4 shadow-2xl sm:p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="m-0 text-base font-semibold text-[#f4f0fa]">New play testing session</h3>
                  <button type="button" className={`${btnBase} ${btnTheme}`} onClick={closeModal} disabled={submitting}>
                    Close
                  </button>
                </div>

                <div className="grid gap-5">
                  <label className="grid gap-1.5 text-left text-[0.85rem] text-[#f4f0fa]/85">
                    <span className="font-medium">Format</span>
                    <select
                      className="rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-[#f4f0fa]"
                      value={formatId === "" ? "" : String(formatId)}
                      onChange={(e) => {
                        const next = e.target.value === "" ? "" : Number(e.target.value);
                        setFormatId(next);
                        setWithIds([]);
                        setAgainstIds([]);
                      }}
                    >
                      <option value="">Select format…</option>
                      {CARD_FORMAT_NAMES.map((name, id) => (
                        <option key={name} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {formatId !== "" ? (
                    <>
                      <section className="grid gap-2">
                        <h4 className="m-0 text-[0.85rem] font-semibold text-[#f4f0fa]/9">
                          Heroes to test with <span className="font-normal text-[#f4f0fa]/45">(optional)</span>
                        </h4>
                        {legalHeroes.length === 0 ? (
                          <p className="m-0 text-[0.8rem] text-[#f4f0fa]/5">No legal heroes for this format.</p>
                        ) : (
                          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-2 sm:grid-cols-2">
                            {legalHeroes.map((hero) => {
                              const selected = withIds.includes(hero.id);
                              return (
                                <button
                                  key={`with-${hero.id}`}
                                  type="button"
                                  onClick={() => toggleId(withIds, setWithIds, hero.id)}
                                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                                    selected
                                      ? "border-emerald-400/45 bg-emerald-950/35"
                                      : "border-transparent hover:border-white/15 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <HeroAvatar hero={hero} selected={selected} size="sm" />
                                  <span className="min-w-0 truncate text-[0.8rem] text-[#f4f0fa]/88">{hero.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      <section className="grid gap-2">
                        <h4 className="m-0 text-[0.85rem] font-semibold text-[#f4f0fa]/9">
                          Heroes to play against <span className="font-normal text-[#f4f0fa]/45">(optional)</span>
                        </h4>
                        {legalHeroes.length === 0 ? (
                          <p className="m-0 text-[0.8rem] text-[#f4f0fa]/5">No legal heroes for this format.</p>
                        ) : (
                          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-2 sm:grid-cols-2">
                            {legalHeroes.map((hero) => {
                              const selected = againstIds.includes(hero.id);
                              return (
                                <button
                                  key={`against-${hero.id}`}
                                  type="button"
                                  onClick={() => toggleId(againstIds, setAgainstIds, hero.id)}
                                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                                    selected
                                      ? "border-rose-300/40 bg-rose-950/30"
                                      : "border-transparent hover:border-white/15 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <HeroAvatar hero={hero} selected={selected} size="sm" />
                                  <span className="min-w-0 truncate text-[0.8rem] text-[#f4f0fa]/88">{hero.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    </>
                  ) : (
                    <p className="m-0 text-[0.85rem] text-[#f4f0fa]/55">Select a format to choose heroes.</p>
                  )}

                  <section className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="m-0 text-[0.85rem] font-semibold text-[#f4f0fa]/9">Timeframes</h4>
                      <button
                        type="button"
                        className={`${btnBase} ${btnTheme}`}
                        onClick={() => setTimeframes((prev) => [...prev, newDraftTimeframe("range")])}
                      >
                        Add timeframe
                      </button>
                    </div>
                    <div className="grid gap-2">
                      {timeframes.map((tf) => (
                        <div
                          key={tf.key}
                          className="grid gap-2 rounded-xl border border-white/12 bg-black/25 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={`${btnBase} ${tf.mode === "now_open" ? "border-emerald-400/40 bg-emerald-950/40 text-emerald-100" : btnTheme}`}
                                onClick={() =>
                                  setTimeframes((prev) =>
                                    prev.map((row) => (row.key === tf.key ? { ...row, mode: "now_open" } : row)),
                                  )
                                }
                              >
                                Now → open
                              </button>
                              <button
                                type="button"
                                className={`${btnBase} ${tf.mode === "range" ? "border-emerald-400/40 bg-emerald-950/40 text-emerald-100" : btnTheme}`}
                                onClick={() =>
                                  setTimeframes((prev) =>
                                    prev.map((row) => (row.key === tf.key ? { ...row, mode: "range" } : row)),
                                  )
                                }
                              >
                                Calendar range
                              </button>
                            </div>
                            {timeframes.length > 1 ? (
                              <button
                                type="button"
                                className={`${btnBase} ${btnTheme}`}
                                onClick={() => setTimeframes((prev) => prev.filter((row) => row.key !== tf.key))}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                          {tf.mode === "range" ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="grid gap-1 text-[0.78rem] text-[#f4f0fa]/75">
                                From
                                <input
                                  type="datetime-local"
                                  className="rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 text-[#f4f0fa]"
                                  value={tf.startsLocal}
                                  onChange={(e) =>
                                    setTimeframes((prev) =>
                                      prev.map((row) =>
                                        row.key === tf.key ? { ...row, startsLocal: e.target.value } : row,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-[0.78rem] text-[#f4f0fa]/75">
                                To <span className="text-[#f4f0fa]/45">(optional / open-ended)</span>
                                <input
                                  type="datetime-local"
                                  className="rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 text-[#f4f0fa]"
                                  value={tf.endsLocal}
                                  onChange={(e) =>
                                    setTimeframes((prev) =>
                                      prev.map((row) =>
                                        row.key === tf.key ? { ...row, endsLocal: e.target.value } : row,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            </div>
                          ) : (
                            <p className="m-0 text-[0.78rem] text-[#f4f0fa]/55">
                              Starts now with no end time (open-ended).
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {modalError ? (
                    <p className="m-0 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100" role="alert">
                      {modalError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={`${btnBase} ${btnTheme}`} onClick={closeModal} disabled={submitting}>
                      Cancel
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => void submit()} disabled={submitting}>
                      {submitting ? "Creating…" : "Create session"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
