import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import {
  CARD_FORMAT_NAMES,
  cardFormatName,
  formatUsesYoungHeroes,
  isValidCardFormatId,
} from "../constants/cardFormat";
import {
  PANEL_TABS_BLEED,
  PANEL_TABS_CONTENT_PAD,
  PanelTabList,
  panelTabButton,
} from "./PanelTabs";

const PlayTestingDetailLazy = lazy(() =>
  import("./PlayTestingDetail").then((m) => ({ default: m.PlayTestingDetail })),
);

/** @typedef {{ id: number, name: string, young?: boolean, card_image_url?: string | null, art_image_url?: string | null, formats?: number[] }} PlayTestingHero */

/** @typedef {{ hero_id: number, side: number, name: string, young?: boolean, card_image_url?: string | null, art_image_url?: string | null }} SessionHero */

/** @typedef {{ id?: number, starts_at: string, ends_at?: string | null, sort_order: number }} SessionTimeframe */

/** @typedef {{ id: number, session_id?: number, user_id: number, note?: string, first_name?: string | null, username?: string | null, heroes?: Array<{ hero_id: number, name: string, young?: boolean, card_image_url?: string | null, art_image_url?: string | null }> }} SessionInterestSummary */

/** @typedef {{ id: number, user_id: number, format: number, status?: number, bucket?: string, note?: string, created_at: string, closed_at?: string | null, owner_first_name?: string | null, owner_username?: string | null, heroes_with: SessionHero[], heroes_against: SessionHero[], timeframes: SessionTimeframe[], interests?: SessionInterestSummary[] }} PlayTestingSession */

/** @typedef {{ key: string, mode: "now_open" | "range", startsLocal: string, endsLocal: string }} DraftTimeframe */

/** @typedef {"current" | "upcoming" | "past"} SessionListTab */

/**
 * @param {string | undefined | null} errText
 * @returns {string}
 */
export function parseApiError(errText) {
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
export function heroLegalForFormat(hero, formatId) {
  if (!isValidCardFormatId(formatId)) return false;
  const formats = Array.isArray(hero.formats) ? hero.formats : [];
  if (!formats.includes(formatId)) return false;
  const preferYoung = formatUsesYoungHeroes(formatId);
  if (preferYoung === undefined) return true;
  return preferYoung ? hero.young === true : hero.young !== true;
}

/** @param {string | undefined | null} startsAt @param {string | undefined | null} endsAt */
export function formatTimeframeLabel(startsAt, endsAt) {
  const start = startsAt ? new Date(startsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return "—";
  const startLabel = start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (endsAt == null || endsAt === "") {
    return startLabel;
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

/**
 * @param {{ owner_first_name?: string | null, owner_username?: string | null }} session
 */
export function sessionOwnerLabel(session) {
  const first = session.owner_first_name != null ? String(session.owner_first_name).trim() : "";
  const discord = session.owner_username != null ? String(session.owner_username).trim() : "";
  if (first && discord) return `${first} · ${discord}`;
  if (first) return first;
  if (discord) return discord;
  return "";
}

/**
 * @param {{ first_name?: string | null, username?: string | null, user_id?: number }} row
 */
export function interestPlayerLabel(row) {
  const first = row?.first_name != null ? String(row.first_name).trim() : "";
  const user = row?.username != null ? String(row.username).trim() : "";
  if (first && user) return `${first} · ${user}`;
  if (first) return first;
  if (user) return user;
  if (typeof row?.user_id === "number") return `User ${row.user_id}`;
  return "Player";
}

const OPEN_ENDED_MS = 24 * 60 * 60 * 1000;
const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
const CALENDAR_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);
const CALENDAR_HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const CALENDAR_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const CALENDAR_PERIODS = /** @type {const} */ (["AM", "PM"]);

/** Stable per-owner palette for calendar chips / day accents (dark UI). */
const OWNER_CALENDAR_COLORS = Object.freeze([
  {
    chip: "border-emerald-400/45 bg-emerald-950/70 text-emerald-50",
    day: "border-emerald-400/50 bg-emerald-950/35",
    dayHover: "hover:border-emerald-300/60 hover:bg-emerald-950/45",
    dot: "bg-emerald-400",
    legend: "bg-emerald-400",
  },
  {
    chip: "border-sky-400/45 bg-sky-950/70 text-sky-50",
    day: "border-sky-400/50 bg-sky-950/35",
    dayHover: "hover:border-sky-300/60 hover:bg-sky-950/45",
    dot: "bg-sky-400",
    legend: "bg-sky-400",
  },
  {
    chip: "border-amber-400/45 bg-amber-950/70 text-amber-50",
    day: "border-amber-400/50 bg-amber-950/35",
    dayHover: "hover:border-amber-300/60 hover:bg-amber-950/45",
    dot: "bg-amber-400",
    legend: "bg-amber-400",
  },
  {
    chip: "border-rose-400/45 bg-rose-950/70 text-rose-50",
    day: "border-rose-400/50 bg-rose-950/35",
    dayHover: "hover:border-rose-300/60 hover:bg-rose-950/45",
    dot: "bg-rose-400",
    legend: "bg-rose-400",
  },
  {
    chip: "border-teal-400/45 bg-teal-950/70 text-teal-50",
    day: "border-teal-400/50 bg-teal-950/35",
    dayHover: "hover:border-teal-300/60 hover:bg-teal-950/45",
    dot: "bg-teal-400",
    legend: "bg-teal-400",
  },
  {
    chip: "border-orange-400/45 bg-orange-950/70 text-orange-50",
    day: "border-orange-400/50 bg-orange-950/35",
    dayHover: "hover:border-orange-300/60 hover:bg-orange-950/45",
    dot: "bg-orange-400",
    legend: "bg-orange-400",
  },
  {
    chip: "border-lime-400/45 bg-lime-950/70 text-lime-50",
    day: "border-lime-400/50 bg-lime-950/35",
    dayHover: "hover:border-lime-300/60 hover:bg-lime-950/45",
    dot: "bg-lime-400",
    legend: "bg-lime-400",
  },
  {
    chip: "border-cyan-400/45 bg-cyan-950/70 text-cyan-50",
    day: "border-cyan-400/50 bg-cyan-950/35",
    dayHover: "hover:border-cyan-300/60 hover:bg-cyan-950/45",
    dot: "bg-cyan-400",
    legend: "bg-cyan-400",
  },
  {
    chip: "border-fuchsia-400/40 bg-fuchsia-950/65 text-fuchsia-50",
    day: "border-fuchsia-400/45 bg-fuchsia-950/30",
    dayHover: "hover:border-fuchsia-300/55 hover:bg-fuchsia-950/40",
    dot: "bg-fuchsia-400",
    legend: "bg-fuchsia-400",
  },
  {
    chip: "border-indigo-400/45 bg-indigo-950/70 text-indigo-50",
    day: "border-indigo-400/50 bg-indigo-950/35",
    dayHover: "hover:border-indigo-300/60 hover:bg-indigo-950/45",
    dot: "bg-indigo-400",
    legend: "bg-indigo-400",
  },
]);

/**
 * @param {number | null | undefined} userId
 * @returns {(typeof OWNER_CALENDAR_COLORS)[number]}
 */
function ownerCalendarColor(userId) {
  const n = typeof userId === "number" && Number.isFinite(userId) ? userId : 0;
  const idx = ((n % OWNER_CALENDAR_COLORS.length) + OWNER_CALENDAR_COLORS.length) % OWNER_CALENDAR_COLORS.length;
  return OWNER_CALENDAR_COLORS[idx];
}

/** @param {Date} d */
function toDateKey(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * @param {Date} start
 * @param {Date} end
 * @param {(key: string) => void} visit
 */
function forEachLocalDayKey(start, end, visit) {
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return;
  while (cur <= last) {
    visit(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
}

/**
 * Local calendar day keys a session should appear on.
 * @param {PlayTestingSession} session
 * @returns {Set<string>}
 */
function sessionCalendarDayKeys(session) {
  const keys = new Set();
  const tfs = session.timeframes || [];
  if (tfs.length === 0) {
    const created = session.created_at ? new Date(session.created_at) : null;
    if (created && !Number.isNaN(created.getTime())) {
      forEachLocalDayKey(created, new Date(created.getTime() + OPEN_ENDED_MS), (k) => keys.add(k));
    }
    return keys;
  }
  for (const tf of tfs) {
    const start = tf.starts_at ? new Date(tf.starts_at) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    let end;
    if (tf.ends_at != null && tf.ends_at !== "") {
      end = new Date(tf.ends_at);
      if (Number.isNaN(end.getTime())) end = new Date(start.getTime() + OPEN_ENDED_MS);
    } else {
      end = new Date(start.getTime() + OPEN_ENDED_MS);
    }
    forEachLocalDayKey(start, end, (k) => keys.add(k));
  }
  return keys;
}

/**
 * @param {unknown} raw
 * @returns {PlayTestingSession[]}
 */
function normalizePlayTestingSessions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((s) => s && typeof s.id === "number" && typeof s.format === "number")
    .map((s) => ({
      ...s,
      owner_first_name:
        s.owner_first_name != null && String(s.owner_first_name).trim() !== ""
          ? String(s.owner_first_name).trim()
          : null,
      owner_username:
        s.owner_username != null && String(s.owner_username).trim() !== ""
          ? String(s.owner_username).trim()
          : null,
    }));
}

/**
 * @param {{
 *   session: PlayTestingSession,
 *   canClose: boolean,
 *   whenEmptyLabel: string,
 *   closingId: number | null,
 *   onClose: (id: number) => void,
 *   btnBase: string,
 *   btnTheme: string,
 * }} props
 */
export function SessionCard({ session, canClose, whenEmptyLabel, closingId, onClose, onOpen, btnBase, btnTheme }) {
  const ownerLabel = sessionOwnerLabel(session);
  const hasTimeframes = (session.timeframes || []).length > 0;
  const interests = Array.isArray(session.interests) ? session.interests : [];
  const open = () => {
    if (typeof onOpen === "function") onOpen(session.id);
  };
  return (
    <li className="list-none">
      <div
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen ? open : undefined}
        onKeyDown={
          onOpen
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open();
                }
              }
            : undefined
        }
        className={`rounded-xl border border-white/[0.14] bg-black/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6 ${
          onOpen ? "cursor-pointer transition hover:border-white/30 hover:bg-black/40" : ""
        }`}
      >
      <div className="mb-5 flex items-start justify-between gap-3">
        <span className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[1rem] font-semibold tracking-wide text-[#f4f0fa]">
          {cardFormatName(session.format) ?? `Format ${session.format}`}
        </span>
        <div className="flex max-w-[65%] flex-col items-end gap-1.5">
          {ownerLabel ? (
            <span className="text-right text-[1rem] font-medium leading-snug text-[#f4f0fa]">{ownerLabel}</span>
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
          {canClose ? (
            <button
              type="button"
              className={`${btnBase} ${btnTheme}`}
              disabled={closingId === session.id}
              onClick={(e) => {
                e.stopPropagation();
                onClose(session.id);
              }}
            >
              {closingId === session.id ? "Closing…" : "Close session"}
            </button>
          ) : null}
        </div>
      </div>

      {typeof session.note === "string" && session.note.trim() !== "" ? (
        <p className="mb-4 mt-0 whitespace-pre-wrap text-left text-[0.95rem] leading-snug text-[#f4f0fa]/85">
          {session.note.trim()}
        </p>
      ) : null}

      {interests.length > 0 ? (
        <div className="mb-4 max-w-md text-left">
          <p className="mb-2 mt-0 text-[0.9rem] font-semibold uppercase tracking-[0.12em] text-[#f4f0fa]/90">
            Interested
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {interests.map((row) => (
              <li key={row.id ?? row.user_id} className="text-[0.9rem] text-[#f4f0fa]/85">
                {interestPlayerLabel(row)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <p className="mb-2.5 mt-0 text-[0.9rem] font-semibold uppercase tracking-[0.12em] text-[#f4f0fa]/90">
            Playing
          </p>
          <HeroAvatarRow heroes={session.heroes_with || []} emptyLabel="Any / unspecified" size="xl" />
        </div>
        <div className="min-w-0 flex-1 sm:text-right">
          <p className="mb-2.5 mt-0 text-[0.9rem] font-semibold uppercase tracking-[0.12em] text-[#f4f0fa]/90">
            Requesting
          </p>
          <HeroAvatarRow
            heroes={session.heroes_against || []}
            emptyLabel="Any"
            size="xl"
            align="end"
          />
        </div>
      </div>
      </div>
    </li>
  );
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
 * @param {string} hour
 * @param {string} minute
 * @param {"AM" | "PM"} period
 */
function formatClock(hour, minute, period) {
  return `${hour}:${minute} ${period}`;
}

/**
 * @param {string} date
 * @param {string} hour
 * @param {string} minute
 * @param {"AM" | "PM"} period
 */
function formatSelectedDateTime(date, hour, minute, period) {
  if (!date) return "Select a start";
  return `${formatSelectedDate(date)} at ${formatClock(hour, minute, period)}`;
}

/**
 * @param {string} startDate
 * @param {string} startHour
 * @param {string} startMinute
 * @param {"AM" | "PM"} startPeriod
 * @param {string} endDate
 * @param {string} endHour
 * @param {string} endMinute
 * @param {"AM" | "PM"} endPeriod
 */
function formatSelectedRange(
  startDate,
  startHour,
  startMinute,
  startPeriod,
  endDate,
  endHour,
  endMinute,
  endPeriod,
) {
  const startLabel = formatSelectedDateTime(startDate, startHour, startMinute, startPeriod);
  if (!endDate) return startLabel;
  return `${startLabel} – ${formatSelectedDateTime(endDate, endHour, endMinute, endPeriod)}`;
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {string} hour
 * @param {string} minute
 * @param {"AM" | "PM"} period
 * @returns {string | null} datetime-local value
 */
function combineLocalDateTime(date, hour, minute, period) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const baseHour = Number(hour) % 12;
  const hour24 = period === "PM" ? baseHour + 12 : baseHour;
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour24)}:${pad(Number(minute))}`;
}

/**
 * @param {string | undefined | null} localValue
 * @returns {{ date: string, hour: string, minute: string, period: "AM" | "PM" } | null}
 */
function parseLocalParts(localValue) {
  const raw = (localValue ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const hours = d.getHours();
  return {
    date: toDateInputValue(d),
    hour: String(hours % 12 || 12),
    minute: String(d.getMinutes()).padStart(2, "0"),
    period: hours >= 12 ? "PM" : "AM",
  };
}

/** @returns {{ date: string, hour: string, minute: string, period: "AM" | "PM" }} */
function partsFromNow() {
  const now = new Date();
  const hours = now.getHours();
  return {
    date: toDateInputValue(now),
    hour: String(hours % 12 || 12),
    minute: String(now.getMinutes()).padStart(2, "0"),
    period: hours >= 12 ? "PM" : "AM",
  };
}

/** @param {string} date YYYY-MM-DD */
function isCalendarDateBeforeToday(date) {
  if (!date) return false;
  return date < toDateInputValue(new Date());
}

/**
 * @param {string | undefined | null} localOrIso
 * @returns {boolean}
 */
function isDateTimeInPast(localOrIso) {
  const raw = (localOrIso ?? "").trim();
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

/** @param {string} startsLocal @param {string} endsLocal */
function formatDraftRangeLabel(startsLocal, endsLocal) {
  const start = parseLocalParts(startsLocal);
  if (!start) return "Select a date range";
  const end = endsLocal.trim() ? parseLocalParts(endsLocal) : null;
  if (!end) return formatSelectedDateTime(start.date, start.hour, start.minute, start.period);
  return formatSelectedRange(
    start.date,
    start.hour,
    start.minute,
    start.period,
    end.date,
    end.hour,
    end.minute,
    end.period,
  );
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
 * @param {{ hero: PlayTestingHero | SessionHero, selected?: boolean, onClick?: () => void, size?: "sm" | "md" | "lg" | "xl" }} props
 */
export function HeroAvatar({ hero, selected = false, onClick, size = "md" }) {
  const url = heroPortraitURL(hero);
  const name = (hero.name || "").trim() || "Unknown hero";
  const dim =
    size === "xl"
      ? "size-[4.75rem] sm:size-[5.5rem]"
      : size === "lg"
        ? "size-16 sm:size-[4.5rem]"
        : size === "sm"
          ? "size-9"
          : "size-12";
  const ring = selected
    ? "ring-2 ring-emerald-300/90 ring-offset-2 ring-offset-[#120818]"
    : "ring-1 ring-white/20";
  const base = `group relative ${dim} shrink-0 overflow-visible rounded-full bg-black/40 ${ring}`;
  const initialSize = size === "xl" ? "text-[1.2rem]" : size === "lg" ? "text-[1.05rem]" : "text-[0.7rem]";
  const portrait = (
    <span className="block h-full w-full overflow-hidden rounded-full">
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover object-center" draggable={false} />
      ) : (
        <span className={`flex h-full w-full items-center justify-center ${initialSize} font-semibold text-[#f4f0fa]/75`}>
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
  const tooltip = (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/20 bg-[#1a1028] px-2 py-1 text-[0.75rem] font-medium text-[#f4f0fa] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {name}
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        title={name}
        aria-label={name}
        aria-pressed={selected}
        onClick={onClick}
        className={`${base} transition hover:ring-white/45`}
      >
        {portrait}
        {tooltip}
      </button>
    );
  }
  return (
    <span title={name} aria-label={name} className={base}>
      {portrait}
      {tooltip}
    </span>
  );
}

/**
 * @param {{ heroes: Array<PlayTestingHero | SessionHero>, emptyLabel: string, size?: "sm" | "md" | "lg" | "xl", align?: "start" | "end" }} props
 */
export function HeroAvatarRow({ heroes, emptyLabel, size = "sm", align = "start" }) {
  if (!heroes.length) {
    return (
      <p className={`m-0 text-[1rem] text-[#f4f0fa]/55 ${align === "end" ? "text-right" : ""}`}>
        {emptyLabel}
      </p>
    );
  }
  const gap = size === "xl" || size === "lg" ? "gap-3" : "gap-1.5";
  return (
    <div className={`flex flex-wrap ${gap} ${align === "end" ? "justify-end" : ""}`}>
      {heroes.map((h) => (
        <HeroAvatar key={h.hero_id ?? h.id} hero={h} size={size} />
      ))}
    </div>
  );
}

/**
 * @param {{
 *   isLight: boolean,
 *   active: boolean,
 *   sessionId?: string | null,
 *   onOpenSession?: (id: number) => void,
 *   onCloseSession?: () => void,
 * }} props
 */
export function PlayTesting({ isLight, active, sessionId = null, onOpenSession, onCloseSession }) {
  if (sessionId) {
    return (
      <Suspense
        fallback={
          <div className={PANEL_TABS_BLEED}>
            <div className={PANEL_TABS_CONTENT_PAD}>
              <p className="m-0 text-[0.9rem] text-[#f4f0fa]/65">Loading session…</p>
            </div>
          </div>
        }
      >
        <PlayTestingDetailLazy
          isLight={isLight}
          active={active}
          sessionId={sessionId}
          onBack={onCloseSession}
        />
      </Suspense>
    );
  }

  return <PlayTestingList isLight={isLight} active={active} onOpenSession={onOpenSession} />;
}

/**
 * @param {{
 *   isLight: boolean,
 *   active: boolean,
 *   onOpenSession?: (id: number) => void,
 * }} props
 */
function PlayTestingList({ isLight, active, onOpenSession }) {
  const { user, sessionProfile } = useAuth();
  const myUserId = typeof sessionProfile?.id === "number" ? sessionProfile.id : null;
  const [listTab, setListTab] = useState(/** @type {SessionListTab} */ ("current"));
  const [calendarView, setCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDayKey, setSelectedDayKey] = useState(/** @type {string | null} */ (null));
  const [sessions, setSessions] = useState(/** @type {PlayTestingSession[]} */ ([]));
  const [heroes, setHeroes] = useState(/** @type {PlayTestingHero[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);
  const [closingId, setClosingId] = useState(/** @type {number | null} */ (null));

  const [modalOpen, setModalOpen] = useState(false);
  const [formatId, setFormatId] = useState(/** @type {number | ""} */ (""));
  const [withIds, setWithIds] = useState(/** @type {number[]} */ ([]));
  const [againstIds, setAgainstIds] = useState(/** @type {number[]} */ ([]));
  const [sessionNote, setSessionNote] = useState("");
  const [timeframes, setTimeframes] = useState(/** @type {DraftTimeframe[]} */ ([]));
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(/** @type {string | null} */ (null));

  const [rangePickerKey, setRangePickerKey] = useState(/** @type {string | null} */ (null));
  const [rangePickerMonth, setRangePickerMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [rangeStartDate, setRangeStartDate] = useState("");
  const [rangeEndDate, setRangeEndDate] = useState("");
  const [rangeStartHour, setRangeStartHour] = useState("7");
  const [rangeStartMinute, setRangeStartMinute] = useState("00");
  const [rangeStartPeriod, setRangeStartPeriod] = useState(/** @type {"AM" | "PM"} */ ("PM"));
  const [rangeEndHour, setRangeEndHour] = useState("9");
  const [rangeEndMinute, setRangeEndMinute] = useState("00");
  const [rangeEndPeriod, setRangeEndPeriod] = useState(/** @type {"AM" | "PM"} */ ("PM"));
  const [rangePickerError, setRangePickerError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      if (calendarView) {
        const [resCurrent, resUpcoming, resPast, resMeta] = await Promise.all([
          fetch("/api/play-testing/sessions?status=current", { headers }),
          fetch("/api/play-testing/sessions?status=upcoming", { headers }),
          fetch("/api/play-testing/sessions?status=past", { headers }),
          fetch("/api/play-testing/meta", { headers }),
        ]);
        for (const res of [resCurrent, resUpcoming, resPast, resMeta]) {
          if (!res.ok) throw new Error(parseApiError(await res.text()));
        }
        const [currentData, upcomingData, pastData, metaData] = await Promise.all([
          resCurrent.json(),
          resUpcoming.json(),
          resPast.json(),
          resMeta.json(),
        ]);
        /** @type {Map<number, PlayTestingSession>} */
        const byId = new Map();
        for (const s of [
          ...normalizePlayTestingSessions(currentData.sessions),
          ...normalizePlayTestingSessions(upcomingData.sessions),
          ...normalizePlayTestingSessions(pastData.sessions),
        ]) {
          byId.set(s.id, s);
        }
        setSessions([...byId.values()].sort((a, b) => b.id - a.id));
        setHeroes(
          (Array.isArray(metaData.heroes) ? metaData.heroes : []).filter(
            (h) => h && typeof h.id === "number" && typeof h.name === "string",
          ),
        );
      } else {
        const [resSessions, resMeta] = await Promise.all([
          fetch(`/api/play-testing/sessions?status=${listTab}`, { headers }),
          fetch("/api/play-testing/meta", { headers }),
        ]);
        if (!resSessions.ok) throw new Error(parseApiError(await resSessions.text()));
        if (!resMeta.ok) throw new Error(parseApiError(await resMeta.text()));
        const sessionsData = await resSessions.json();
        const metaData = await resMeta.json();
        setSessions(normalizePlayTestingSessions(sessionsData.sessions));
        setHeroes(
          (Array.isArray(metaData.heroes) ? metaData.heroes : []).filter(
            (h) => h && typeof h.id === "number" && typeof h.name === "string",
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Looking for Games");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [user, listTab, calendarView]);

  useEffect(() => {
    if (!active || !user) return undefined;
    void load();
    return undefined;
  }, [active, user, reloadSeq, load]);

  const legalHeroes = useMemo(() => {
    if (formatId === "" || !isValidCardFormatId(formatId)) return [];
    return heroes.filter((h) => heroLegalForFormat(h, formatId));
  }, [heroes, formatId]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    /** @type {Array<number | null>} */
    const days = [];
    for (let i = 0; i < firstWeekday; i += 1) days.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) days.push(day);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [calendarMonth]);

  const sessionsByDay = useMemo(() => {
    /** @type {Map<string, PlayTestingSession[]>} */
    const map = new Map();
    for (const session of sessions) {
      for (const key of sessionCalendarDayKeys(session)) {
        const list = map.get(key);
        if (list) list.push(session);
        else map.set(key, [session]);
      }
    }
    return map;
  }, [sessions]);

  const calendarOwnerLegend = useMemo(() => {
    /** @type {Map<number, { userId: number, label: string, color: (typeof OWNER_CALENDAR_COLORS)[number] }>} */
    const byUser = new Map();
    for (const daySessions of sessionsByDay.values()) {
      for (const session of daySessions) {
        const uid = session.user_id;
        if (typeof uid !== "number" || byUser.has(uid)) continue;
        const label = sessionOwnerLabel(session) || `User ${uid}`;
        byUser.set(uid, { userId: uid, label, color: ownerCalendarColor(uid) });
      }
    }
    return [...byUser.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [sessionsByDay]);

  const selectedDaySessions = useMemo(() => {
    if (!selectedDayKey) return [];
    return sessionsByDay.get(selectedDayKey) || [];
  }, [selectedDayKey, sessionsByDay]);

  const calendarMonthLabel = calendarMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const todayKey = toDateKey(new Date());

  /** @param {boolean} next */
  const setCalendarEnabled = (next) => {
    setCalendarView(next);
    if (next) {
      const now = new Date();
      setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      setSelectedDayKey(toDateKey(now));
    } else {
      setSelectedDayKey(null);
    }
  };

  /** @param {number} delta */
  const shiftCalendarMonth = (delta) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    setSelectedDayKey(null);
  };

  /**
   * @param {PlayTestingSession} session
   */
  const sessionWhenEmptyLabel = (session) => {
    if (calendarView) {
      return session.bucket === "past" || session.status === 1 ? "Not now" : "Now";
    }
    return listTab === "past" ? "Not now" : "Now";
  };

  /**
   * @param {PlayTestingSession} session
   */
  const sessionCanClose = (session) => {
    if (calendarView) {
      return (
        myUserId != null &&
        session.user_id === myUserId &&
        session.status !== 1 &&
        session.bucket !== "past"
      );
    }
    return listTab !== "past" && myUserId != null && session.user_id === myUserId && session.status !== 1;
  };

  const openModal = () => {
    setFormatId("");
    setWithIds([]);
    setAgainstIds([]);
    setSessionNote("");
    setTimeframes([]);
    setModalError(null);
    setRangePickerKey(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setModalError(null);
    setRangePickerKey(null);
    setRangePickerError(null);
  };

  /**
   * @param {DraftTimeframe} tf
   */
  const openRangePicker = (tf) => {
    let start = parseLocalParts(tf.startsLocal) || partsFromNow();
    if (isDateTimeInPast(combineLocalDateTime(start.date, start.hour, start.minute, start.period) || "")) {
      start = partsFromNow();
    }
    let end = tf.endsLocal.trim() ? parseLocalParts(tf.endsLocal) : null;
    if (end && isDateTimeInPast(combineLocalDateTime(end.date, end.hour, end.minute, end.period) || "")) {
      end = null;
    }
    setRangePickerKey(tf.key);
    setRangePickerError(null);
    setRangePickerMonth(new Date(dateFromInputValue(start.date).getFullYear(), dateFromInputValue(start.date).getMonth(), 1));
    setRangeStartDate(start.date);
    setRangeEndDate(end?.date ?? "");
    setRangeStartHour(start.hour);
    setRangeStartMinute(start.minute);
    setRangeStartPeriod(start.period);
    setRangeEndHour(end?.hour ?? "9");
    setRangeEndMinute(end?.minute ?? "00");
    setRangeEndPeriod(end?.period ?? "PM");
  };

  const closeRangePicker = () => {
    setRangePickerKey(null);
    setRangePickerError(null);
  };

  const rangePickerDays = useMemo(() => {
    const year = rangePickerMonth.getFullYear();
    const month = rangePickerMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    /** @type {Array<number | null>} */
    const days = [];
    for (let i = 0; i < firstWeekday; i += 1) days.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) days.push(day);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [rangePickerMonth]);

  /**
   * @param {number} day
   */
  const selectRangePickerDay = (day) => {
    const value = toDateInputValue(new Date(rangePickerMonth.getFullYear(), rangePickerMonth.getMonth(), day));
    if (isCalendarDateBeforeToday(value)) {
      setRangePickerError("Pick a day that isn’t in the past.");
      return;
    }
    setRangePickerError(null);
    if (!rangeStartDate || (rangeStartDate && rangeEndDate)) {
      setRangeStartDate(value);
      setRangeEndDate("");
      return;
    }
    if (value < rangeStartDate) {
      setRangeEndDate(rangeStartDate);
      setRangeStartDate(value);
      return;
    }
    setRangeEndDate(value);
  };

  const applyRangePicker = () => {
    if (rangePickerKey == null) return;
    if (!rangeStartDate) return;
    if (isCalendarDateBeforeToday(rangeStartDate)) {
      setRangePickerError("Start day can’t be in the past.");
      return;
    }
    if (rangeEndDate && isCalendarDateBeforeToday(rangeEndDate)) {
      setRangePickerError("End day can’t be in the past.");
      return;
    }
    const startsLocal = combineLocalDateTime(rangeStartDate, rangeStartHour, rangeStartMinute, rangeStartPeriod);
    if (!startsLocal) return;
    if (isDateTimeInPast(startsLocal)) {
      setRangePickerError("Start time can’t be in the past.");
      return;
    }
    const endsLocal =
      rangeEndDate.trim() !== ""
        ? combineLocalDateTime(rangeEndDate, rangeEndHour, rangeEndMinute, rangeEndPeriod)
        : "";
    if (rangeEndDate.trim() !== "" && !endsLocal) return;
    if (endsLocal && isDateTimeInPast(endsLocal)) {
      setRangePickerError("End time can’t be in the past.");
      return;
    }
    if (endsLocal && new Date(endsLocal).getTime() < new Date(startsLocal).getTime()) {
      setRangePickerError("End time must be on or after start time.");
      return;
    }
    setTimeframes((prev) =>
      prev.map((row) =>
        row.key === rangePickerKey
          ? { ...row, mode: "range", startsLocal, endsLocal: endsLocal || "" }
          : row,
      ),
    );
    setRangePickerKey(null);
    setRangePickerError(null);
  };

  const toggleId = (list, setList, id) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const closeSession = async (sessionId) => {
    if (!user || closingId != null) return;
    if (!window.confirm("Close this session? It will move to Past.")) return;
    setClosingId(sessionId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/play-testing/sessions/${sessionId}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close session");
    } finally {
      setClosingId(null);
    }
  };

  const submit = async () => {
    if (!user) return;
    if (formatId === "" || !isValidCardFormatId(formatId)) {
      setModalError("Select a format.");
      return;
    }
    const note = sessionNote.trim();
    if ([...note].length > 500) {
      setModalError("Session note must be at most 500 characters.");
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
      if (isDateTimeInPast(startsISO)) {
        setModalError("Timeframes can’t start in the past.");
        return;
      }
      if (endsISO && isDateTimeInPast(endsISO)) {
        setModalError("Timeframes can’t end in the past.");
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
          note,
          heroes_with: withIds,
          heroes_against: againstIds,
          timeframes: payloadTimeframes,
        }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setModalOpen(false);
      setListTab("current");
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
  const btnModalAction =
    "rounded-xl border px-5 py-3 text-[1rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:px-6 sm:py-3.5 sm:text-[1.05rem]";
  const btnModalPrimary =
    "rounded-xl border border-emerald-400/50 bg-emerald-950/50 px-5 py-3 text-[1rem] font-semibold text-emerald-50 shadow-[0_8px_24px_rgba(16,185,129,0.18)] transition-colors hover:border-emerald-300/60 hover:bg-emerald-900/55 disabled:cursor-not-allowed disabled:opacity-45 sm:px-6 sm:py-3.5 sm:text-[1.05rem]";

  const emptyCopy =
    listTab === "current"
      ? "No current Play Testing sessions."
      : listTab === "upcoming"
        ? "No upcoming sessions."
        : "No past sessions.";

  /** @param {SessionListTab} tab */
  const selectListTab = (tab) => {
    setListTab(tab);
    if (calendarView) {
      setCalendarView(false);
      setSelectedDayKey(null);
    }
  };

  return (
    <div className={PANEL_TABS_BLEED} aria-label="Looking for Games">
      <PanelTabList
        ariaLabel="Session status"
        endSlot={
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <span className="text-[0.95rem] font-semibold text-[#f4f0fa]">Calendar</span>
            <button
              type="button"
              role="switch"
              aria-checked={calendarView}
              aria-label="Calendar"
              onClick={() => setCalendarEnabled(!calendarView)}
              className={`relative h-7 w-12 shrink-0 rounded-full border p-0.5 transition-colors ${
                calendarView
                  ? "border-violet-400/55 bg-violet-600/90"
                  : isLight
                    ? "border-white/20 bg-[#4a4658]/95"
                    : "border-white/[0.22] bg-black/45"
              }`}
            >
              <span
                aria-hidden
                className={`block size-6 rounded-full bg-white shadow transition-transform ${
                  calendarView ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        }
      >
        {panelTabButton("current", !calendarView && listTab === "current", "Current", () =>
          selectListTab("current"),
        )}
        {panelTabButton("upcoming", !calendarView && listTab === "upcoming", "Upcoming", () =>
          selectListTab("upcoming"),
        )}
        {panelTabButton("past", !calendarView && listTab === "past", "Past", () => selectListTab("past"))}
      </PanelTabList>

      <div className={PANEL_TABS_CONTENT_PAD} role="tabpanel">
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-xl border border-emerald-400/50 bg-emerald-950/50 px-6 py-3 text-[1.05rem] font-semibold text-emerald-100 shadow-[0_4px_16px_rgba(16,80,50,0.25)] transition hover:border-emerald-300/60 hover:bg-emerald-900/55 sm:px-8 sm:py-3.5 sm:text-[1.15rem]"
            onClick={openModal}
          >
            New session
          </button>
        </div>

        {error ? (
          <div
            className="mt-3 rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-4">
          {loading && sessions.length === 0 ? (
            <p className="m-0 text-[0.9rem] text-[#f4f0fa]/65">Loading sessions…</p>
          ) : calendarView ? (
            <div className="grid gap-4">
              <div className="rounded-xl border border-white/[0.14] bg-black/30 p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    onClick={() => shiftCalendarMonth(-1)}
                    aria-label="Previous month"
                  >
                    ←
                  </button>
                  <h3 className="m-0 text-center text-[1.05rem] font-semibold text-[#f4f0fa]">
                    {calendarMonthLabel}
                  </h3>
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    onClick={() => shiftCalendarMonth(1)}
                    aria-label="Next month"
                  >
                    →
                  </button>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-1">
                  {CALENDAR_WEEKDAYS.map((label) => (
                    <div
                      key={label}
                      className="px-0.5 py-1 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55"
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, index) => {
                    if (day == null) {
                      return <div key={`empty-${index}`} className="min-h-[5.5rem] rounded-lg bg-transparent" />;
                    }
                    const key = toDateKey(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day),
                    );
                    const daySessions = sessionsByDay.get(key) || [];
                    const hasSessions = daySessions.length > 0;
                    const selected = selectedDayKey === key;
                    const isToday = key === todayKey;
                    const preview = daySessions.slice(0, 2);
                    const overflow = daySessions.length - preview.length;
                    const ownerIds = [...new Set(daySessions.map((s) => s.user_id).filter((id) => typeof id === "number"))];
                    const primaryColor = hasSessions ? ownerCalendarColor(ownerIds[0]) : null;
                    let dayClass =
                      "border-white/10 bg-black/25 hover:border-white/25 hover:bg-black/35";
                    if (selected) {
                      dayClass = "border-violet-300/55 bg-violet-950/45";
                    } else if (hasSessions && primaryColor) {
                      dayClass = `${primaryColor.day} ${primaryColor.dayHover}`;
                    } else if (isToday) {
                      dayClass = "border-white/25 bg-black/35 hover:border-white/35 hover:bg-black/40";
                    }
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDayKey(key)}
                        className={`flex min-h-[5.5rem] flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors sm:min-h-[6.5rem] sm:p-2 ${dayClass}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span
                            className={`text-[0.8rem] font-semibold ${
                              hasSessions ? "text-[#f4f0fa]" : isToday ? "text-[#f4f0fa]/90" : "text-[#f4f0fa]/85"
                            }`}
                          >
                            {day}
                          </span>
                          {ownerIds.length > 0 ? (
                            <span className="flex items-center gap-0.5" aria-hidden>
                              {ownerIds.slice(0, 4).map((uid) => (
                                <span
                                  key={uid}
                                  className={`size-1.5 rounded-full ${ownerCalendarColor(uid).dot}`}
                                />
                              ))}
                            </span>
                          ) : null}
                        </span>
                        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                          {preview.map((session) => {
                            const owner = sessionOwnerLabel(session);
                            const format =
                              cardFormatName(session.format) ?? `Format ${session.format}`;
                            const color = ownerCalendarColor(session.user_id);
                            return (
                              <span
                                key={session.id}
                                className={`truncate rounded border px-1 py-0.5 text-[0.65rem] leading-tight ${color.chip}`}
                                title={owner ? `${format} · ${owner}` : format}
                              >
                                {format}
                                {owner ? ` · ${owner}` : ""}
                              </span>
                            );
                          })}
                          {overflow > 0 ? (
                            <span className="text-[0.65rem] font-medium text-[#f4f0fa]/55">
                              +{overflow} more
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {calendarOwnerLegend.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-white/10 pt-3">
                    {calendarOwnerLegend.map((entry) => (
                      <span
                        key={entry.userId}
                        className="inline-flex max-w-full items-center gap-1.5 text-[0.75rem] text-[#f4f0fa]/75"
                        title={entry.label}
                      >
                        <span className={`size-2.5 shrink-0 rounded-full ${entry.color.legend}`} aria-hidden />
                        <span className="truncate">{entry.label}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {selectedDayKey ? (
                <div className="grid gap-3">
                  <h4 className="m-0 text-[0.95rem] font-semibold text-[#f4f0fa]">
                    {new Date(`${selectedDayKey}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </h4>
                  {selectedDaySessions.length === 0 ? (
                    <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 px-4 text-center">
                      <p className="m-0 text-[0.9rem] text-[#f4f0fa]/55">No sessions on this day.</p>
                    </div>
                  ) : (
                    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
                      {selectedDaySessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          canClose={sessionCanClose(session)}
                          whenEmptyLabel={sessionWhenEmptyLabel(session)}
                          closingId={closingId}
                          onClose={(id) => void closeSession(id)}
                          onOpen={onOpenSession}
                          btnBase={btnBase}
                          btnTheme={btnTheme}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex min-h-[12rem] flex-1 items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 px-4 text-center">
              <p className="m-0 text-[0.9rem] text-[#f4f0fa]/55">{emptyCopy}</p>
            </div>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  canClose={sessionCanClose(session)}
                  whenEmptyLabel={sessionWhenEmptyLabel(session)}
                  closingId={closingId}
                  onClose={(id) => void closeSession(id)}
                  onOpen={onOpenSession}
                  btnBase={btnBase}
                  btnTheme={btnTheme}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

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
                aria-label="New Looking for Games session"
                className="max-h-[min(94vh,64rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/20 bg-[#160d22] p-4 shadow-2xl sm:max-w-4xl sm:p-6 lg:max-w-5xl lg:p-7"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="m-0 text-base font-semibold text-[#f4f0fa]">New Looking for Games session</h3>
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

                  <label className="grid gap-1.5 text-left text-[0.85rem] text-[#f4f0fa]/85">
                    <span className="font-medium">
                      Note <span className="font-normal text-[#f4f0fa]/45">(optional)</span>
                    </span>
                    <textarea
                      className="min-h-[4.5rem] resize-y rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-[#f4f0fa]"
                      value={sessionNote}
                      maxLength={500}
                      onChange={(e) => setSessionNote(e.target.value)}
                      disabled={submitting}
                      placeholder="Anything people should know about this session…"
                    />
                    <span className="text-[0.75rem] text-[#f4f0fa]/45">{[...sessionNote].length}/500</span>
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
                          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-2 sm:max-h-64 sm:grid-cols-2 lg:max-h-72 lg:grid-cols-3">
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
                          Heroes to play against
                        </h4>
                        {legalHeroes.length === 0 ? (
                          <p className="m-0 text-[0.8rem] text-[#f4f0fa]/5">No legal heroes for this format.</p>
                        ) : (
                          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-2 sm:max-h-64 sm:grid-cols-2 lg:max-h-72 lg:grid-cols-3">
                            <button
                              type="button"
                              onClick={() => setAgainstIds([])}
                              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition sm:col-span-2 lg:col-span-3 ${
                                againstIds.length === 0
                                  ? "border-rose-300/40 bg-rose-950/30"
                                  : "border-transparent hover:border-white/15 hover:bg-white/[0.04]"
                              }`}
                              aria-pressed={againstIds.length === 0}
                            >
                              <span
                                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold ${
                                  againstIds.length === 0
                                    ? "bg-rose-900/50 text-rose-100 ring-2 ring-rose-300/70 ring-offset-2 ring-offset-[#120818]"
                                    : "bg-black/40 text-[#f4f0fa]/75 ring-1 ring-white/20"
                                }`}
                                aria-hidden
                              >
                                Any
                              </span>
                              <span className="min-w-0 truncate text-[0.8rem] text-[#f4f0fa]/88">
                                Any opponent
                              </span>
                            </button>
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
                      <h4 className="m-0 text-[0.85rem] font-semibold text-[#f4f0fa]/9">
                        Timeframes{" "}
                        <span className="font-normal text-[#f4f0fa]/45">(optional — blank means now)</span>
                      </h4>
                      <button
                        type="button"
                        className={`${btnBase} ${btnTheme}`}
                        onClick={() => {
                          const next = newDraftTimeframe("range");
                          setTimeframes((prev) => [...prev, next]);
                          openRangePicker(next);
                        }}
                      >
                        Add timeframe
                      </button>
                    </div>
                    {timeframes.length === 0 ? (
                      <p className="m-0 rounded-xl border border-dashed border-white/12 bg-black/20 px-3 py-3 text-[0.8rem] text-[#f4f0fa]/55">
                        No timeframe added — this session is treated as now (or until you close it).
                      </p>
                    ) : (
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
                                  Now
                                </button>
                                <button
                                  type="button"
                                  className={`${btnBase} ${tf.mode === "range" ? "border-emerald-400/40 bg-emerald-950/40 text-emerald-100" : btnTheme}`}
                                  onClick={() => {
                                    const next = { ...tf, mode: "range" };
                                    setTimeframes((prev) =>
                                      prev.map((row) => (row.key === tf.key ? next : row)),
                                    );
                                    openRangePicker(next);
                                  }}
                                >
                                  Calendar range
                                </button>
                              </div>
                              <button
                                type="button"
                                className={`${btnBase} ${btnTheme}`}
                                onClick={() => setTimeframes((prev) => prev.filter((row) => row.key !== tf.key))}
                              >
                                Remove
                              </button>
                            </div>
                            {tf.mode === "range" ? (
                              <button
                                type="button"
                                className="rounded-lg border border-white/20 bg-black/35 px-3 py-2.5 text-left text-[0.85rem] text-[#f4f0fa] transition-colors hover:border-white/35 hover:bg-black/45"
                                onClick={() => openRangePicker(tf)}
                              >
                                {formatDraftRangeLabel(tf.startsLocal, tf.endsLocal)}
                              </button>
                            ) : (
                              <p className="m-0 text-[0.78rem] text-[#f4f0fa]/55">
                                Starts now (or until closed).
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {modalError ? (
                    <p className="m-0 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100" role="alert">
                      {modalError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      className={`${btnModalAction} ${btnTheme}`}
                      onClick={closeModal}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={btnModalPrimary}
                      onClick={() => void submit()}
                      disabled={submitting}
                    >
                      {submitting ? "Creating…" : "Create session"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {rangePickerKey != null && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeRangePicker();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Select date range"
                className="max-h-[min(92vh,44rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/20 bg-[#160d22] p-4 shadow-2xl sm:p-5"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="m-0 text-base font-semibold text-[#f4f0fa]">Select date range</h3>
                  <button type="button" className={`${btnBase} ${btnTheme}`} onClick={closeRangePicker}>
                    Close
                  </button>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                    <span>Month</span>
                    <select
                      className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                      value={rangePickerMonth.getMonth()}
                      onChange={(e) => {
                        const month = Number(e.target.value);
                        setRangePickerMonth((current) => new Date(current.getFullYear(), month, 1));
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
                      value={rangePickerMonth.getFullYear()}
                      onChange={(e) => {
                        const year = Number(e.target.value);
                        setRangePickerMonth((current) => new Date(year, current.getMonth(), 1));
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

                <div className="mb-3">
                  <p className="mb-1.5 mt-0 text-[0.8rem] font-medium text-[#f4f0fa]/8">Start time</p>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                      <span>Hour</span>
                      <select
                        className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                        value={rangeStartHour}
                        onChange={(e) => setRangeStartHour(e.target.value)}
                      >
                        {CALENDAR_HOURS.map((hour) => (
                          <option key={`start-h-${hour}`} value={hour}>
                            {hour}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                      <span>Minute</span>
                      <select
                        className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                        value={rangeStartMinute}
                        onChange={(e) => setRangeStartMinute(e.target.value)}
                      >
                        {CALENDAR_MINUTES.map((minute) => (
                          <option key={`start-m-${minute}`} value={minute}>
                            {minute}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                      <span>AM/PM</span>
                      <select
                        className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa]"
                        value={rangeStartPeriod}
                        onChange={(e) => setRangeStartPeriod(/** @type {"AM" | "PM"} */ (e.target.value))}
                      >
                        {CALENDAR_PERIODS.map((period) => (
                          <option key={`start-p-${period}`} value={period}>
                            {period}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="m-0 text-[0.8rem] font-medium text-[#f4f0fa]/8">
                      End time <span className="font-normal text-[#f4f0fa]/45">(optional)</span>
                    </p>
                    {rangeEndDate ? (
                      <button
                        type="button"
                        className={`${btnBase} ${btnTheme}`}
                        onClick={() => setRangeEndDate("")}
                      >
                        Clear end
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                      <span>Hour</span>
                      <select
                        className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa] disabled:opacity-40"
                        value={rangeEndHour}
                        onChange={(e) => setRangeEndHour(e.target.value)}
                        disabled={!rangeEndDate}
                      >
                        {CALENDAR_HOURS.map((hour) => (
                          <option key={`end-h-${hour}`} value={hour}>
                            {hour}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                      <span>Minute</span>
                      <select
                        className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa] disabled:opacity-40"
                        value={rangeEndMinute}
                        onChange={(e) => setRangeEndMinute(e.target.value)}
                        disabled={!rangeEndDate}
                      >
                        {CALENDAR_MINUTES.map((minute) => (
                          <option key={`end-m-${minute}`} value={minute}>
                            {minute}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[0.8rem] text-[#f4f0fa]/75">
                      <span>AM/PM</span>
                      <select
                        className="rounded-lg border border-white/20 bg-black/35 px-2 py-2 text-[#f4f0fa] disabled:opacity-40"
                        value={rangeEndPeriod}
                        onChange={(e) => setRangeEndPeriod(/** @type {"AM" | "PM"} */ (e.target.value))}
                        disabled={!rangeEndDate}
                      >
                        {CALENDAR_PERIODS.map((period) => (
                          <option key={`end-p-${period}`} value={period}>
                            {period}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <p className="mb-2 mt-0 text-[0.75rem] text-[#f4f0fa]/5">
                  Tap a start day, then an end day. End is optional. Past days can’t be selected.
                </p>

                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[0.72rem] font-medium uppercase tracking-wide text-[#f4f0fa]/45">
                  {CALENDAR_WEEKDAYS.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="mb-4 grid grid-cols-7 gap-1">
                  {rangePickerDays.map((day, index) => {
                    if (day == null) {
                      return <span key={`empty-${index}`} className="aspect-square" />;
                    }
                    const value = toDateInputValue(
                      new Date(rangePickerMonth.getFullYear(), rangePickerMonth.getMonth(), day),
                    );
                    const isPast = isCalendarDateBeforeToday(value);
                    const isStart = rangeStartDate === value;
                    const isEnd = rangeEndDate === value;
                    const inMiddle =
                      Boolean(rangeStartDate) &&
                      Boolean(rangeEndDate) &&
                      value > rangeStartDate &&
                      value < rangeEndDate;
                    const selected = isStart || isEnd;
                    return (
                      <button
                        key={`range-day-${day}`}
                        type="button"
                        disabled={isPast}
                        className={`aspect-square rounded-lg border text-[0.85rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                          selected
                            ? "border-emerald-400/55 bg-emerald-950/55 text-emerald-50"
                            : inMiddle
                              ? "border-emerald-400/25 bg-emerald-950/30 text-emerald-100"
                              : "border-white/15 bg-black/25 text-[#f4f0fa] hover:border-white/30 hover:bg-black/40"
                        }`}
                        onClick={() => selectRangePickerDay(day)}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                <p className="mb-3 m-0 text-center text-[0.85rem] text-[#f4f0fa]/70">
                  {formatSelectedRange(
                    rangeStartDate,
                    rangeStartHour,
                    rangeStartMinute,
                    rangeStartPeriod,
                    rangeEndDate,
                    rangeEndHour,
                    rangeEndMinute,
                    rangeEndPeriod,
                  )}
                </p>
                {rangePickerError ? (
                  <p className="mb-3 m-0 rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-center text-[0.8rem] text-red-100" role="alert">
                    {rangePickerError}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={`${btnPrimary} w-full`}
                  onClick={applyRangePicker}
                  disabled={!rangeStartDate}
                >
                  Done
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
