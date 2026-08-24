import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { canWriteContent } from "../constants/roles";
import { extFromFilename, MAX_UPLOAD_SIZE_LABEL, uploadPublicAsset, uploadSizeError } from "../utils/uploadPublicAsset";

/** @typedef {{ id: number, meeting_at: string, summary: string, video_url?: string | null, created_by_user_id: number, created_at: string, updated_at: string }} MeetingRow */

const CALENDAR_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);
const CALENDAR_HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const CALENDAR_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const CALENDAR_PERIODS = /** @type {const} */ (["AM", "PM"]);

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

/** @param {Date} date */
function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** @param {string} value */
function dateFromInputValue(value) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  return new Date(year, month - 1, day);
}

/** @param {string} value */
function formatSelectedDate(value) {
  if (!value) return "No date selected";
  return dateFromInputValue(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * @param {string} value
 * @param {string} hour
 * @param {string} minute
 * @param {string} period
 */
function formatSelectedDateTime(value, hour, minute, period) {
  if (!value) return "Select a date & time";
  return `${formatSelectedDate(value)} at ${hour}:${minute} ${period}`;
}

/**
 * @param {string} value
 * @param {string} hour
 * @param {string} minute
 * @param {string} period
 */
function meetingDateTimeToISO(value, hour, minute, period) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const baseHour = Number(hour) % 12;
  const hour24 = period === "PM" ? baseHour + 12 : baseHour;
  const d = new Date(year, month - 1, day, hour24, Number(minute), 0, 0);
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
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingHour, setMeetingHour] = useState("7");
  const [meetingMinute, setMeetingMinute] = useState("00");
  const [meetingPeriod, setMeetingPeriod] = useState(/** @type {"AM" | "PM"} */ ("PM"));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => dateFromInputValue(""));
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

  const calendarDays = useMemo(() => {
    const year = calendarMonthDate.getFullYear();
    const month = calendarMonthDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    /** @type {Array<number | null>} */
    const days = [];
    for (let i = 0; i < firstWeekday; i += 1) days.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) days.push(day);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [calendarMonthDate]);

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
    const now = new Date();
    const hours = now.getHours();
    setMeetingDate(toDateInputValue(now));
    setMeetingHour(String(hours % 12 || 12));
    setMeetingMinute(String(now.getMinutes()).padStart(2, "0"));
    setMeetingPeriod(hours >= 12 ? "PM" : "AM");
    setCalendarMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setCalendarOpen(false);
    setCreateSummary("");
    setCreateFile(null);
    setCreateError(null);
    setCreateUploadPct(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (createSubmitting) return;
    setCreateOpen(false);
    setCalendarOpen(false);
    setCreateError(null);
    setCreateUploadPct(null);
  };

  const openCalendarModal = () => {
    setCalendarMonthDate(dateFromInputValue(meetingDate));
    setCalendarOpen(true);
  };

  const selectCalendarDay = (day) => {
    const nextDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth(), day);
    setMeetingDate(toDateInputValue(nextDate));
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
    const meetingAtISO = meetingDateTimeToISO(meetingDate, meetingHour, meetingMinute, meetingPeriod);
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
      setCalendarOpen(false);
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
                      <div className="mb-3">
                        <button
                          type="button"
                          onClick={() => toggleRow(row.id)}
                          aria-expanded={true}
                          className="m-0 border-0 bg-transparent p-0 text-left text-[1.05rem] font-semibold text-white hover:text-[#f4f0fa]/9"
                        >
                          {formatMeetingWhen(row.meeting_at)}
                        </button>
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
                          <div className="flex min-h-[12rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-8 sm:min-h-[14rem]">
                            {canManage ? (
                              <button type="button" className={`${btnBase} ${btnTheme}`} onClick={() => openAttachVideo(row)}>
                                Add recording
                              </button>
                            ) : (
                              <p className="m-0 text-center text-[0.85rem] text-[#f4f0fa]/5">
                                No recording uploaded for this meeting.
                              </p>
                            )}
                          </div>
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
                  <div className="grid gap-1.5 text-left text-[0.85rem] text-[#f4f0fa]/85">
                    <span className="font-medium">Date &amp; time</span>
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 bg-black/35 px-3 py-2.5 text-left text-[#f4f0fa] transition-colors hover:border-white/35 hover:bg-black/45 disabled:opacity-45"
                      onClick={openCalendarModal}
                      disabled={createSubmitting}
                    >
                      {formatSelectedDateTime(meetingDate, meetingHour, meetingMinute, meetingPeriod)}
                    </button>
                  </div>
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

      {calendarOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setCalendarOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Select meeting date and time"
                className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-[#160d22] p-4 shadow-2xl sm:p-5"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="m-0 text-base font-semibold text-[#f4f0fa]">Meeting date &amp; time</h3>
                  <button type="button" className={`${btnBase} ${btnTheme}`} onClick={() => setCalendarOpen(false)}>
                    Close
                  </button>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                    <span>Month</span>
                    <select
                      className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                      value={calendarMonthDate.getMonth()}
                      onChange={(e) => {
                        const month = Number(e.target.value);
                        setCalendarMonthDate((current) => new Date(current.getFullYear(), month, 1));
                      }}
                    >
                      {CALENDAR_MONTHS.map((label, index) => (
                        <option key={label} value={index}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                    <span>Year</span>
                    <select
                      className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                      value={calendarMonthDate.getFullYear()}
                      onChange={(e) => {
                        const year = Number(e.target.value);
                        setCalendarMonthDate((current) => new Date(year, current.getMonth(), 1));
                      }}
                    >
                      {CALENDAR_YEARS.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mb-3 grid grid-cols-3 gap-2">
                  <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                    <span>Hour</span>
                    <select
                      className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                      value={meetingHour}
                      onChange={(e) => setMeetingHour(e.target.value)}
                    >
                      {CALENDAR_HOURS.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                    <span>Minute</span>
                    <select
                      className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                      value={meetingMinute}
                      onChange={(e) => setMeetingMinute(e.target.value)}
                    >
                      {CALENDAR_MINUTES.map((minute) => (
                        <option key={minute} value={minute}>
                          {minute}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                    <span>AM/PM</span>
                    <select
                      className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                      value={meetingPeriod}
                      onChange={(e) => setMeetingPeriod(/** @type {"AM" | "PM"} */ (e.target.value))}
                    >
                      {CALENDAR_PERIODS.map((period) => (
                        <option key={period} value={period}>
                          {period}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[0.72rem] font-medium uppercase tracking-wide text-[#f4f0fa]/45">
                  {CALENDAR_WEEKDAYS.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="mb-4 grid grid-cols-7 gap-1">
                  {calendarDays.map((day, index) => {
                    if (day == null) {
                      return <span key={`empty-${index}`} className="aspect-square" />;
                    }
                    const selected =
                      meetingDate ===
                      toDateInputValue(new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth(), day));
                    return (
                      <button
                        key={`day-${day}`}
                        type="button"
                        className={`aspect-square rounded-lg border text-[0.85rem] font-medium transition-colors ${
                          selected
                            ? "border-emerald-400/55 bg-emerald-950/55 text-emerald-50"
                            : "border-white/15 bg-black/25 text-[#f4f0fa] hover:border-white/30 hover:bg-black/40"
                        }`}
                        onClick={() => selectCalendarDay(day)}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                <p className="mb-3 m-0 text-center text-[0.85rem] text-[#f4f0fa]/70">
                  {formatSelectedDateTime(meetingDate, meetingHour, meetingMinute, meetingPeriod)}
                </p>
                <button type="button" className={`${btnPrimary} w-full`} onClick={() => setCalendarOpen(false)}>
                  Done
                </button>
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
