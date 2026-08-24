import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { canWriteContent } from "../constants/roles";
import { extFromFilename, MAX_UPLOAD_SIZE_LABEL, uploadPublicAsset, uploadSizeError } from "../utils/uploadPublicAsset";

/** @typedef {{ id: number, meeting_at: string, summary: string, video_url?: string | null, created_by_user_id: number, created_at: string, updated_at: string }} MeetingRow */

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

/** @param {string | undefined | null} iso */
function formatMeetingWhen(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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

/** @param {string} summary */
function summaryPreview(summary) {
  const t = String(summary || "").trim().replace(/\s+/g, " ");
  if (t.length <= 140) return t;
  return `${t.slice(0, 137)}…`;
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function Meetings({ isLight, active }) {
  const { user, sessionProfile } = useAuth();
  const canManage = canWriteContent(sessionProfile?.role);

  const [items, setItems] = useState(/** @type {MeetingRow[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [expandedId, setExpandedId] = useState(/** @type {number | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createAt, setCreateAt] = useState(() => toLocalInputValue(new Date()));
  const [createSummary, setCreateSummary] = useState("");
  const [createFile, setCreateFile] = useState(/** @type {File | null} */ (null));
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState(/** @type {string | null} */ (null));
  const [createUploadPct, setCreateUploadPct] = useState(/** @type {number | null} */ (null));

  const [videoTarget, setVideoTarget] = useState(/** @type {MeetingRow | null} */ (null));
  const [videoFile, setVideoFile] = useState(/** @type {File | null} */ (null));
  const [videoSubmitting, setVideoSubmitting] = useState(false);
  const [videoError, setVideoError] = useState(/** @type {string | null} */ (null));
  const [videoUploadPct, setVideoUploadPct] = useState(/** @type {number | null} */ (null));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/meetings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.meetings) ? data.meetings : [];
      /** @type {MeetingRow[]} */
      const next = list.filter((m) => m && typeof m.id === "number");
      setItems(next);
      setExpandedId((prev) => {
        if (next.length === 0) return null;
        if (prev != null && next.some((m) => m.id === prev)) return prev;
        return next[0].id;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load meetings");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active || !user) return undefined;
    void load();
    return undefined;
  }, [active, user, reloadSeq, load]);

  const toggleRow = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const openCreate = () => {
    setCreateAt(toLocalInputValue(new Date()));
    setCreateSummary("");
    setCreateFile(null);
    setCreateError(null);
    setCreateUploadPct(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (createSubmitting) return;
    setCreateOpen(false);
    setCreateError(null);
    setCreateUploadPct(null);
  };

  const openAttachVideo = (row) => {
    setVideoTarget(row);
    setVideoFile(null);
    setVideoError(null);
    setVideoUploadPct(null);
  };

  const closeAttachVideo = () => {
    if (videoSubmitting) return;
    setVideoTarget(null);
    setVideoFile(null);
    setVideoError(null);
    setVideoUploadPct(null);
  };

  const submitCreate = async () => {
    if (!user) return;
    const meetingAtISO = localInputToISO(createAt);
    if (!meetingAtISO) {
      setCreateError("Choose a valid meeting date and time.");
      return;
    }
    const summary = createSummary.trim();
    if (!summary) {
      setCreateError("Enter a meeting summary.");
      return;
    }
    if (createFile) {
      const sizeErr = uploadSizeError(createFile.size);
      if (sizeErr) {
        setCreateError(sizeErr);
        return;
      }
    }

    setCreateSubmitting(true);
    setCreateError(null);
    setCreateUploadPct(createFile ? 0 : null);
    try {
      const token = await user.getIdToken();
      let videoURL = /** @type {string | null} */ (null);
      if (createFile) {
        const ext = extFromFilename(createFile.name);
        const objectPath = `meetings/${crypto.randomUUID()}.${ext}`;
        setCreateUploadPct(15);
        videoURL = await uploadPublicAsset(() => user.getIdToken(), objectPath, createFile, {
          cacheBust: true,
        });
        setCreateUploadPct(80);
      }
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meeting_at: meetingAtISO,
          summary,
          ...(videoURL ? { video_url: videoURL } : {}),
        }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setCreateUploadPct(100);
      setCreateOpen(false);
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create meeting");
    } finally {
      setCreateSubmitting(false);
      setCreateUploadPct(null);
    }
  };

  const submitAttachVideo = async () => {
    if (!user || !videoTarget) return;
    if (!videoFile) {
      setVideoError("Choose a video file to upload.");
      return;
    }
    const sizeErr = uploadSizeError(videoFile.size);
    if (sizeErr) {
      setVideoError(sizeErr);
      return;
    }

    setVideoSubmitting(true);
    setVideoError(null);
    setVideoUploadPct(10);
    try {
      const token = await user.getIdToken();
      const ext = extFromFilename(videoFile.name);
      const objectPath = `meetings/${videoTarget.id}/${crypto.randomUUID()}.${ext}`;
      const videoURL = await uploadPublicAsset(() => user.getIdToken(), objectPath, videoFile, {
        cacheBust: true,
      });
      setVideoUploadPct(80);
      const res = await fetch(`/api/meetings/${videoTarget.id}/video`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ video_url: videoURL }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setVideoUploadPct(100);
      setVideoTarget(null);
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Failed to attach video");
    } finally {
      setVideoSubmitting(false);
      setVideoUploadPct(null);
    }
  };

  const cardShell = isLight
    ? "border border-white/[0.12] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.55)] shadow-[0_12px_40px_rgba(0,0,0,0.35)]";

  const rowHeaderBtn = isLight
    ? "hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/40"
    : "hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/35";

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary =
    "rounded-lg border border-emerald-400/45 bg-emerald-950/45 px-3 py-1.5 text-[0.8125rem] font-semibold text-emerald-100 transition-colors hover:border-emerald-300/55 hover:bg-emerald-900/45 disabled:cursor-not-allowed disabled:opacity-45";
  const btnAddMeeting =
    "rounded-xl border border-emerald-400/50 bg-emerald-950/50 px-5 py-3 text-[1rem] font-semibold text-emerald-50 shadow-[0_8px_24px_rgba(16,185,129,0.18)] transition-colors hover:border-emerald-300/60 hover:bg-emerald-900/55 disabled:cursor-not-allowed disabled:opacity-45 sm:px-6 sm:py-3.5 sm:text-[1.05rem]";

  return (
    <div className="-mx-8 -mt-4 flex min-h-0 flex-1 flex-col gap-3 px-3 text-left sm:-mx-10 sm:-mt-6 sm:px-4" aria-label="Meetings">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Meetings</h2>
          <p className="m-0 mt-1 max-w-2xl text-[0.85rem] leading-snug text-[#f4f0fa]/70">
            Team meeting notes and recordings.
          </p>
        </div>
        {canManage ? (
          <button type="button" className={btnAddMeeting} onClick={openCreate}>
            Add meeting
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100" role="alert">
          {error}
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/60">No meetings yet.</p>
      ) : (
        <ul className="m-0 flex w-full list-none flex-col gap-2 p-0">
          {items.map((row) => {
            const expanded = expandedId === row.id;
            const hasVideo = row.video_url != null && String(row.video_url).trim() !== "";
            return (
              <li key={row.id} className="w-full">
                <div
                  className={`rounded-2xl ${cardShell} ${
                    expanded ? "overflow-x-hidden overflow-y-visible" : "overflow-hidden"
                  }`}
                >
                  {!expanded ? (
                    <button
                      type="button"
                      onClick={() => toggleRow(row.id)}
                      aria-expanded={false}
                      className={`flex w-full min-h-[5.5rem] overflow-hidden p-0 text-left transition-colors sm:min-h-[6rem] ${rowHeaderBtn}`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-5 py-4 sm:px-6 sm:py-5">
                        <p className="m-0 text-[0.95rem] font-semibold text-[#f4f0fa]/9 sm:text-base">
                          {formatMeetingWhen(row.meeting_at)}
                        </p>
                        <p className="m-0 line-clamp-2 text-[0.9rem] leading-snug text-[#f4f0fa]/65 sm:text-[0.95rem]">
                          {summaryPreview(row.summary)}
                        </p>
                        <p className="m-0 text-[0.75rem] text-[#f4f0fa]/45">
                          {hasVideo ? "Recording available" : "No recording yet"}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div role="region" aria-label={`Meeting ${formatMeetingWhen(row.meeting_at)}`} className="px-5 py-4 sm:px-6 sm:py-5">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleRow(row.id)}
                          aria-expanded={true}
                          className="m-0 border-0 bg-transparent p-0 text-left text-[1.05rem] font-semibold text-white hover:text-[#f4f0fa]/9"
                        >
                          {formatMeetingWhen(row.meeting_at)}
                        </button>
                        {!hasVideo && canManage ? (
                          <button type="button" className={`${btnBase} ${btnTheme}`} onClick={() => openAttachVideo(row)}>
                            Add recording
                          </button>
                        ) : null}
                      </div>
                      <p className="m-0 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-[#f4f0fa]/85">
                        {row.summary}
                      </p>
                      <div className="mt-4">
                        {hasVideo ? (
                          <video
                            className="max-h-[28rem] w-full rounded-xl border border-white/15 bg-black/50"
                            controls
                            preload="metadata"
                            src={String(row.video_url)}
                          >
                            Your browser does not support the video tag.
                          </video>
                        ) : (
                          <p className="m-0 rounded-xl border border-dashed border-white/15 bg-black/20 px-3 py-4 text-[0.85rem] text-[#f4f0fa]/5">
                            No recording uploaded for this meeting.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {createOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeCreate();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Add meeting"
                className="max-h-[min(92vh,40rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/20 bg-[#160d22] p-4 shadow-2xl sm:p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="m-0 text-base font-semibold text-[#f4f0fa]">Add meeting</h3>
                  <button type="button" className={`${btnBase} ${btnTheme}`} onClick={closeCreate} disabled={createSubmitting}>
                    Close
                  </button>
                </div>
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-left text-[0.85rem] text-[#f4f0fa]/85">
                    <span className="font-medium">Date &amp; time</span>
                    <input
                      type="datetime-local"
                      className="rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-[#f4f0fa]"
                      value={createAt}
                      onChange={(e) => setCreateAt(e.target.value)}
                      disabled={createSubmitting}
                    />
                  </label>
                  <label className="grid gap-1.5 text-left text-[0.85rem] text-[#f4f0fa]/85">
                    <span className="font-medium">Summary</span>
                    <textarea
                      className="min-h-[8rem] rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-[#f4f0fa]"
                      value={createSummary}
                      onChange={(e) => setCreateSummary(e.target.value)}
                      disabled={createSubmitting}
                      placeholder="What was covered in this meeting?"
                    />
                  </label>
                  <label className="grid gap-1.5 text-left text-[0.85rem] text-[#f4f0fa]/85">
                    <span className="font-medium">
                      Recording <span className="font-normal text-[#f4f0fa]/45">(optional)</span>
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      className="text-[0.8rem] text-[#f4f0fa]/75 file:mr-3 file:rounded-md file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-[#f4f0fa]"
                      onChange={(e) => setCreateFile(e.target.files?.[0] ?? null)}
                      disabled={createSubmitting}
                    />
                    <span className="text-[0.75rem] text-[#f4f0fa]/45">Max {MAX_UPLOAD_SIZE_LABEL}.</span>
                  </label>
                  {createUploadPct != null ? (
                    <p className="m-0 text-[0.8rem] text-[#f4f0fa]/65">Uploading… {createUploadPct}%</p>
                  ) : null}
                  {createError ? (
                    <p className="m-0 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100" role="alert">
                      {createError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={`${btnBase} ${btnTheme}`} onClick={closeCreate} disabled={createSubmitting}>
                      Cancel
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => void submitCreate()} disabled={createSubmitting}>
                      {createSubmitting ? "Saving…" : "Create meeting"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {videoTarget && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[210] flex items-end justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeAttachVideo();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Add meeting recording"
                className="w-full max-w-md overflow-y-auto rounded-2xl border border-white/20 bg-[#160d22] p-4 shadow-2xl sm:p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="m-0 text-base font-semibold text-[#f4f0fa]">Add recording</h3>
                    <p className="m-0 mt-1 text-[0.8rem] text-[#f4f0fa]/55">
                      {formatMeetingWhen(videoTarget.meeting_at)}
                    </p>
                  </div>
                  <button type="button" className={`${btnBase} ${btnTheme}`} onClick={closeAttachVideo} disabled={videoSubmitting}>
                    Close
                  </button>
                </div>
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-left text-[0.85rem] text-[#f4f0fa]/85">
                    <span className="font-medium">Video file</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="text-[0.8rem] text-[#f4f0fa]/75 file:mr-3 file:rounded-md file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-[#f4f0fa]"
                      onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                      disabled={videoSubmitting}
                    />
                    <span className="text-[0.75rem] text-[#f4f0fa]/45">Max {MAX_UPLOAD_SIZE_LABEL}.</span>
                  </label>
                  {videoUploadPct != null ? (
                    <p className="m-0 text-[0.8rem] text-[#f4f0fa]/65">Uploading… {videoUploadPct}%</p>
                  ) : null}
                  {videoError ? (
                    <p className="m-0 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100" role="alert">
                      {videoError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={`${btnBase} ${btnTheme}`} onClick={closeAttachVideo} disabled={videoSubmitting}>
                      Cancel
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => void submitAttachVideo()} disabled={videoSubmitting}>
                      {videoSubmitting ? "Uploading…" : "Save recording"}
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
