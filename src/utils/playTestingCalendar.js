import { cardFormatName } from "../constants/cardFormat";

/** Matches backend open-ended window length for calendar end times. */
const OPEN_ENDED_MS = 24 * 60 * 60 * 1000;

/**
 * @param {number} value
 */
function pad(value) {
  return String(value).padStart(2, "0");
}

/**
 * @param {Date} date
 */
function toIcsUtc(date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * @param {string} value
 */
function escapeIcsText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/**
 * @param {string} line
 */
function foldIcsLine(line) {
  if (line.length <= 75) {
    return line;
  }
  const parts = [line.slice(0, 75)];
  for (let index = 75; index < line.length; index += 74) {
    parts.push(` ${line.slice(index, index + 74)}`);
  }
  return parts.join("\r\n");
}

/**
 * @param {{ owner_first_name?: string | null, owner_username?: string | null }} session
 */
function ownerLabel(session) {
  const first = session?.owner_first_name != null ? String(session.owner_first_name).trim() : "";
  const user = session?.owner_username != null ? String(session.owner_username).trim() : "";
  if (first && user) return `${first} (@${user})`;
  if (first) return first;
  if (user) return `@${user}`;
  return "";
}

/**
 * @param {Array<{ name?: string | null }> | undefined | null} heroes
 */
function heroNames(heroes) {
  return (Array.isArray(heroes) ? heroes : [])
    .map((h) => (h?.name != null ? String(h.name).trim() : ""))
    .filter(Boolean);
}

/**
 * @param {any} session
 * @returns {{ start: Date, end: Date, index: number }[]}
 */
export function sessionCalendarWindows(session) {
  if (!session) return [];
  const tfs = Array.isArray(session.timeframes) ? session.timeframes : [];
  if (tfs.length === 0) {
    const start = new Date(session.created_at);
    if (Number.isNaN(start.getTime())) return [];
    return [{ start, end: new Date(start.getTime() + OPEN_ENDED_MS), index: 0 }];
  }
  /** @type {{ start: Date, end: Date, index: number }[]} */
  const windows = [];
  tfs.forEach((tf, index) => {
    const start = new Date(tf.starts_at);
    if (Number.isNaN(start.getTime())) return;
    const end =
      tf.ends_at != null && tf.ends_at !== ""
        ? new Date(tf.ends_at)
        : new Date(start.getTime() + OPEN_ENDED_MS);
    if (Number.isNaN(end.getTime())) return;
    windows.push({
      start,
      end: end.getTime() < start.getTime() ? new Date(start.getTime() + OPEN_ENDED_MS) : end,
      index,
    });
  });
  return windows;
}

/**
 * Prefer current, else next upcoming, else earliest window.
 * @param {any} session
 */
export function primarySessionCalendarWindow(session) {
  const windows = sessionCalendarWindows(session);
  if (windows.length === 0) return null;
  const now = Date.now();
  const current = windows.find((w) => w.start.getTime() <= now && w.end.getTime() >= now);
  if (current) return current;
  const upcoming = windows
    .filter((w) => w.start.getTime() > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (upcoming[0]) return upcoming[0];
  return [...windows].sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null;
}

/**
 * @param {any} session
 */
export function sessionCalendarTitle(session) {
  const format = cardFormatName(session?.format) ?? `Format ${session?.format ?? ""}`;
  const host = ownerLabel(session);
  return host ? `LFG: ${format} — ${host}` : `LFG: ${format}`;
}

/**
 * @param {any} session
 */
export function sessionPageUrl(session) {
  const id = session?.id;
  if (id == null) return `${window.location.origin}/team/play-testing`;
  return `${window.location.origin}/team/play-testing/${id}`;
}

/**
 * @param {any} session
 */
export function sessionCalendarDetails(session) {
  const lines = [];
  const host = ownerLabel(session);
  if (host) lines.push(`Host: ${host}`);
  const playing = heroNames(session?.heroes_with);
  const requesting = heroNames(session?.heroes_against);
  lines.push(`Playing: ${playing.length > 0 ? playing.join(", ") : "Any / unspecified"}`);
  lines.push(`Requesting: ${requesting.length > 0 ? requesting.join(", ") : "Any"}`);
  const note = session?.note != null ? String(session.note).trim() : "";
  if (note) lines.push(`Note: ${note}`);
  lines.push(sessionPageUrl(session));
  return lines.join("\n");
}

/**
 * @param {any} session
 */
export function googleCalendarUrl(session) {
  const window = primarySessionCalendarWindow(session);
  if (!window) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: sessionCalendarTitle(session),
    dates: `${toIcsUtc(window.start)}/${toIcsUtc(window.end)}`,
    details: sessionCalendarDetails(session),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * @param {any} session
 */
export function buildSessionIcs(session) {
  const windows = sessionCalendarWindows(session);
  if (windows.length === 0) return null;
  const url = sessionPageUrl(session);
  const title = escapeIcsText(sessionCalendarTitle(session));
  const description = escapeIcsText(sessionCalendarDetails(session));
  const stamp = toIcsUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Righteous Gaming//Looking for Games//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const w of windows) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:lfg-session-${session.id}-${w.index}@righteous.gaming`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsUtc(w.start)}`,
      `DTEND:${toIcsUtc(w.end)}`,
      foldIcsLine(`SUMMARY:${title}`),
      foldIcsLine(`DESCRIPTION:${description}`),
      foldIcsLine(`URL:${escapeIcsText(url)}`),
      "STATUS:CONFIRMED",
      "SEQUENCE:0",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isSafari() {
  if (typeof navigator === "undefined") return false;
  return (
    /Safari/.test(navigator.userAgent) &&
    !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(navigator.userAgent)
  );
}

/**
 * @param {string} href
 * @param {{ download?: string, target?: string }} options
 */
function clickCalendarLink(href, options) {
  const link = document.createElement("a");
  link.href = href;
  link.rel = "noopener";
  if (options.target) link.target = options.target;
  if (options.download) link.download = options.download;
  document.body.append(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  link.remove();
}

/**
 * @param {any} session
 */
export function openAppleCalendar(session) {
  const ics = buildSessionIcs(session);
  if (!ics) return;
  // Safari opens Calendar when navigating to ICS; download would only save a file.
  if (isAppleMobile() || isSafari()) {
    window.location.assign(`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`);
    return;
  }
  const objectUrl = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  clickCalendarLink(objectUrl, { target: "_blank" });
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
}

/**
 * @param {any} session
 */
export function downloadSessionCalendar(session) {
  const ics = buildSessionIcs(session);
  if (!ics) return;
  const blob = new Blob([ics], { type: "text/calendar" });
  const objectUrl = URL.createObjectURL(blob);
  clickCalendarLink(objectUrl, { download: `lfg-session-${session.id}.ics` });
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
