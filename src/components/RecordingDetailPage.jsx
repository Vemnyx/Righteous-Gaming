import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { canWriteContent, isAdminRole } from "../constants/roles";
import { CARD_FORMAT_NAMES } from "../constants/cardFormat";
import { resolveRecordingPlayback, youtubeEmbedSrc } from "../utils/recordingMedia";

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

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** @param {{ owner_username?: string | null, owner_email?: string }} row */
function uploaderLabel(row) {
  const username = row.owner_username != null ? String(row.owner_username).trim() : "";
  if (username) return username;
  const email = row.owner_email != null ? String(row.owner_email).trim() : "";
  return email || "Unknown";
}

/**
 * @param {{ url: string, startSeconds?: number | null, className?: string }} props
 */
function RecordingPlayback({ url, startSeconds, className = "" }) {
  const playback = useMemo(
    () => resolveRecordingPlayback(url, startSeconds ?? undefined),
    [url, startSeconds],
  );
  const shell = `overflow-hidden rounded-xl border border-white/[0.12] bg-black/35 ${className}`.trim();

  if (playback.kind === "none") {
    return (
      <div className={`flex aspect-video items-center justify-center ${shell}`}>
        <p className="m-0 text-[0.875rem] text-[#f4f0fa]/60">No video URL</p>
      </div>
    );
  }

  if (playback.kind === "youtube") {
    return (
      <div className={shell}>
        <iframe
          className="aspect-video h-auto w-full min-w-0 border-0"
          src={youtubeEmbedSrc(playback.videoId, playback.startSeconds)}
          title="Recording video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  if (playback.kind === "video") {
    return (
      <div className={shell}>
        <video className="aspect-video w-full bg-black" src={playback.src} controls playsInline preload="metadata">
          <track kind="captions" />
        </video>
      </div>
    );
  }

  return (
    <div className={shell}>
      <iframe
        className="aspect-video h-auto w-full min-w-0 border-0"
        src={playback.src}
        title="Recording embed"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/**
 * @param {{
 *   isLight: boolean,
 *   recordingId: string,
 *   active: boolean,
 *   onBack?: () => void,
 *   onRecordingDeleted?: () => void,
 * }} props
 */
export function RecordingDetailPage({ isLight, recordingId, active, onBack, onRecordingDeleted }) {
  const { user, sessionProfile } = useAuth();
  const myUserId = typeof sessionProfile?.id === "number" ? sessionProfile.id : null;
  const isAdmin = isAdminRole(sessionProfile?.role);
  const canWrite = canWriteContent(sessionProfile?.role);
  const [meta, setMeta] = useState(
    /** @type {{ id: number, user_id: number, url: string, label?: string | null, format: number, start_seconds?: number | null, created_at: string, owner_username?: string | null, owner_email?: string, first_hero_name?: string | null, first_hero_art_image_url?: string | null, second_hero_name?: string | null, second_hero_art_image_url?: string | null } | null} */ (
      null,
    ),
  );
  const [comments, setComments] = useState(
    /** @type {{ id: number, user_id: number, comment: string, created_at: string, owner_username?: string | null, owner_email?: string }[]} */ ([]),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [notFound, setNotFound] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState(/** @type {string | null} */ (null));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(async () => {
    if (!active || !user) return;
    const id = parseInt(String(recordingId).trim(), 10);
    if (!Number.isFinite(id) || id <= 0) {
      setNotFound(true);
      setMeta(null);
      setComments([]);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/recordings/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setNotFound(true);
        setMeta(null);
        setComments([]);
        return;
      }
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const r = data?.recording;
      if (!r || typeof r.id !== "number" || typeof r.url !== "string") {
        throw new Error("Invalid recording response");
      }
      setMeta({
        id: r.id,
        user_id: typeof r.user_id === "number" ? r.user_id : 0,
        url: String(r.url).trim(),
        label:
          r.label != null && String(r.label).trim() !== "" ? String(r.label).trim() : null,
        format: typeof r.format === "number" ? r.format : 0,
        start_seconds:
          typeof r.start_seconds === "number" && r.start_seconds > 0 ? r.start_seconds : null,
        created_at: typeof r.created_at === "string" ? r.created_at : "",
        owner_username:
          r.owner_username != null && String(r.owner_username).trim() !== ""
            ? String(r.owner_username).trim()
            : null,
        owner_email: typeof r.owner_email === "string" ? r.owner_email : "",
        first_hero_name:
          r.first_hero_name != null && String(r.first_hero_name).trim() !== ""
            ? String(r.first_hero_name).trim()
            : null,
        first_hero_art_image_url:
          r.first_hero_art_image_url != null && String(r.first_hero_art_image_url).trim() !== ""
            ? String(r.first_hero_art_image_url).trim()
            : null,
        second_hero_name:
          r.second_hero_name != null && String(r.second_hero_name).trim() !== ""
            ? String(r.second_hero_name).trim()
            : null,
        second_hero_art_image_url:
          r.second_hero_art_image_url != null && String(r.second_hero_art_image_url).trim() !== ""
            ? String(r.second_hero_art_image_url).trim()
            : null,
      });
      const list = Array.isArray(data.comments) ? data.comments : [];
      setComments(
        list
          .filter((c) => c && typeof c.id === "number" && typeof c.comment === "string")
          .map((c) => ({
            id: c.id,
            user_id: typeof c.user_id === "number" ? c.user_id : 0,
            comment: String(c.comment).trim(),
            created_at: typeof c.created_at === "string" ? c.created_at : "",
            owner_username:
              c.owner_username != null && String(c.owner_username).trim() !== ""
                ? String(c.owner_username).trim()
                : null,
            owner_email: typeof c.owner_email === "string" ? c.owner_email : "",
          })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recording");
      setMeta(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [active, user, recordingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitComment = useCallback(async () => {
    if (!user || !meta) return;
    const text = commentDraft.trim();
    if (text === "") {
      setCommentError("Enter a comment.");
      return;
    }
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/recordings/${meta.id}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment: text }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const c = data?.comment;
      if (!c || typeof c.id !== "number" || typeof c.comment !== "string") {
        throw new Error("Invalid comment response");
      }
      setComments((prev) => [
        ...prev,
        {
          id: c.id,
          user_id: typeof c.user_id === "number" ? c.user_id : 0,
          comment: String(c.comment).trim(),
          created_at: typeof c.created_at === "string" ? c.created_at : new Date().toISOString(),
          owner_username:
            c.owner_username != null && String(c.owner_username).trim() !== ""
              ? String(c.owner_username).trim()
              : null,
          owner_email: typeof c.owner_email === "string" ? c.owner_email : "",
        },
      ]);
      setCommentDraft("");
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : "Failed to post comment");
    } finally {
      setCommentSubmitting(false);
    }
  }, [user, meta, commentDraft]);

  const canDelete =
    canWrite && meta != null && myUserId != null && (meta.user_id === myUserId || isAdmin);

  const closeDeleteModal = useCallback(() => {
    setDeleteOpen(false);
    setDeleteError(null);
  }, []);

  const confirmDeleteRecording = useCallback(async () => {
    if (!user || !meta || !canDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/recordings/${meta.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      closeDeleteModal();
      if (typeof onRecordingDeleted === "function") {
        onRecordingDeleted();
      } else if (typeof onBack === "function") {
        onBack();
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteSubmitting(false);
    }
  }, [user, meta, canDelete, closeDeleteModal, onRecordingDeleted, onBack]);

  useEffect(() => {
    if (!deleteOpen) return undefined;
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key === "Escape" && !deleteSubmitting) closeDeleteModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleteSubmitting, closeDeleteModal]);

  const title = meta?.label ?? (meta ? `Recording #${meta.id}` : "Recording");
  const formatLabel = meta ? (CARD_FORMAT_NAMES[meta.format] ?? `Format ${meta.format}`) : "";
  const heroMatch =
    meta && (meta.first_hero_name || meta.second_hero_name)
      ? `${meta.first_hero_name ?? "?"} vs ${meta.second_hero_name ?? "?"}`
      : "";

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";
  const btnDanger =
    "rounded-lg border border-red-400/45 bg-red-950/50 px-3 py-1.5 text-[0.875rem] font-medium text-red-100 transition-colors hover:border-red-300/55 hover:bg-red-900/45 disabled:cursor-not-allowed disabled:opacity-45";
  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";
  const inputCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/35 focus:border-purple-400/55";
  const cardChromeBorder = isLight
    ? "border-white/[0.12] bg-black/25"
    : "border-white/[0.20] bg-black/20 ring-1 ring-white/[0.05]";
  const muted = "text-[#f4f0fa]/70";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {typeof onBack === "function" ? (
            <button type="button" className={`mb-2 ${btnBase} ${btnTheme}`} onClick={onBack}>
              ← Back to recordings
            </button>
          ) : null}
          <h2 className="m-0 text-left text-2xl font-semibold tracking-tight text-[#f4f0fa] sm:text-3xl">{title}</h2>
          {meta ? (
            <p className="m-0 mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[1rem] leading-relaxed text-[#f4f0fa]/88 sm:text-[1.0625rem]">
              {heroMatch ? <span>{heroMatch}</span> : null}
              {heroMatch ? (
                <span className="text-[#f4f0fa]/40" aria-hidden>
                  ·
                </span>
              ) : null}
              <span>{formatLabel}</span>
              <span className="text-[#f4f0fa]/40" aria-hidden>
                ·
              </span>
              <span>Uploaded {formatDateTime(meta.created_at)}</span>
              <span className="text-[#f4f0fa]/40" aria-hidden>
                ·
              </span>
              <span>{uploaderLabel(meta)}</span>
            </p>
          ) : null}
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
            Delete recording
          </button>
        ) : null}
      </header>

      {loading ? <p className={`m-0 text-[0.875rem] ${muted}`}>Loading recording…</p> : null}

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

      {notFound ? (
        <div className={`rounded-xl border px-4 py-8 text-center text-[0.875rem] ${muted} ${cardChromeBorder}`}>
          Recording not found.
        </div>
      ) : null}

      {meta && !notFound ? (
        <>
          <RecordingPlayback url={meta.url} startSeconds={meta.start_seconds} />

          <section className={`rounded-xl border p-4 sm:p-5 ${cardChromeBorder}`} aria-label="Comments">
            <h3 className="m-0 text-left text-lg font-semibold text-[#f4f0fa]">Comments</h3>

            {comments.length === 0 ? (
              <p className={`m-0 mt-3 text-[0.875rem] ${muted}`}>No comments yet.</p>
            ) : (
              <ul className="m-0 mt-3 list-none space-y-3 p-0">
                {comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2.5 text-left sm:px-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                      <span className="text-[0.8125rem] font-semibold text-[#f4f0fa]/90">
                        {uploaderLabel(c)}
                      </span>
                      <time className="text-[0.75rem] text-[#f4f0fa]/50" dateTime={c.created_at}>
                        {formatDateTime(c.created_at)}
                      </time>
                    </div>
                    <p className="m-0 mt-1 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-[#f4f0fa]/85">
                      {c.comment}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {canWrite ? (
              <div className="mt-4 flex flex-col gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                    Add a comment
                  </span>
                  <textarea
                    className={`${inputCls} min-h-[5rem] resize-y`}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Share notes about this recording…"
                    disabled={commentSubmitting || !user}
                    rows={3}
                  />
                </label>
                {commentError ? (
                  <p className="m-0 text-[0.85rem] text-red-200/95" role="alert">
                    {commentError}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={commentSubmitting || !user}
                    onClick={() => void submitComment()}
                  >
                    {commentSubmitting ? "Posting…" : "Post comment"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </>
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
                aria-labelledby="recording-delete-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="recording-delete-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  Delete “{title}”?
                </h3>
                <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/75">
                  This will permanently remove the recording and all of its comments.
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
                    onClick={() => void confirmDeleteRecording()}
                  >
                    {deleteSubmitting ? "Deleting…" : "Delete recording"}
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
