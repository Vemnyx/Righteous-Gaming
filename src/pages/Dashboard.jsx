import * as Tabs from "@radix-ui/react-tabs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { EventsAdmin } from "../components/EventsAdmin";
import { EventsList } from "../components/EventsList";
import { EventDetailPage } from "../components/EventDetailPage";
import { UsersAdminTable } from "../components/UsersAdminTable";
import { CardsCatalog } from "../components/CardsCatalog";
import { CardRanker } from "../components/CardRanker";
import { CardDetailPage } from "../components/CardDetailPage";
import { AnnouncementsFeed } from "../components/AnnouncementsFeed";
import { AnnouncementsAdmin } from "../components/AnnouncementsAdmin";
import { CardRaterAdmin } from "../components/CardRaterAdmin";
import { CardRaterRedirect } from "../components/CardRaterRedirect";
import { CardRaterAnalytics } from "../components/CardRaterAnalytics";
import { CardRaterCompare } from "../components/CardRaterCompare";
import { CardRatingsList } from "../components/CardRatingsList";
import { RunawaysDraftsAnalytics } from "../components/RunawaysDraftsAnalytics";
import { DecksList } from "../components/DecksList";
import { DeckDetailPage } from "../components/DeckDetailPage";
import { RecordingsList } from "../components/RecordingsList";
import { RecordingDetailPage } from "../components/RecordingDetailPage";
import { SetsAdmin } from "../components/SetsAdmin";
import { UserAccountMenu } from "../components/UserAccountMenu";
import { UserSettings } from "../components/UserSettings";
import { sessionProfileDisplayName } from "../auth/sessionProfile";

/** Persisted before opening Invite User so Back restores the dashboard URL (e.g. `/admin/users`). */
const SESSION_INVITE_RETURN_KEY = "rg-dashboard-return-url";

const RESOURCES_TAB_ID = "resources";
const DATA_TAB_ID = "data";
const ADMIN_TAB_ID = "admin";
const SETTINGS_TAB_ID = "settings";

/** Default Data sub-path when opening the Data tab from the UI. */
const DEFAULT_DATA_SEGMENT = "card-ratings";

/** Default Admin sub-path when opening the Admin tab from the UI (not from the address bar). */
const DEFAULT_ADMIN_SEGMENT = "users";

/** Default Resources sub-path when opening the Resources tab from the UI (not from the address bar). */
const DEFAULT_RESOURCES_SEGMENT = "cards";

const FALLBACK_TAB_ID = "announcements";

/** Admin announcements sub-route: list (`null`), create (`'new'`), or edit numeric id */
/** @typedef {null | "new" | number} AnnouncementAdminForm */

/** @typedef {{ segment: string, label: string, path: string }} ResourceSubLink */
/** @type {ResourceSubLink[]} */
const RESOURCE_SUB_LINKS = [
  { segment: "cards", label: "Cards", path: "/resources/cards" },
  { segment: "decks", label: "Decks", path: "/resources/decks" },
  { segment: "recordings", label: "Recordings", path: "/resources/recordings" },
  { segment: "events", label: "Events", path: "/resources/events" },
  { segment: "card-rater", label: "Card Rater", path: "/resources/card-rater" },
];

/** @type {ResourceSubLink[]} */
const DATA_SUB_LINKS = [
  { segment: "card-ratings", label: "Card Ratings", path: "/data/card-ratings" },
  { segment: "runaways-drafts", label: "Runaways Drafts", path: "/data/runaways-drafts" },
];

/** @type {ResourceSubLink[]} */
const ADMIN_SUB_LINKS = [
  { segment: "users", label: "Users", path: "/admin/users" },
  { segment: "sets", label: "Sets", path: "/admin/sets" },
  { segment: "announcements", label: "Announcements", path: "/admin/announcements" },
  { segment: "card-rater", label: "Card Rater", path: "/admin/card-rater" },
  { segment: "events", label: "Events", path: "/admin/events" },
];

/**
 * @param {string} tabId
 * @param {string | null} resourcesChild — segment after `/resources/`, e.g. `cards`
 * @param {string | null} [resourcesCardIdentifier] — Fab `card_identifier` for `/resources/cards/:id`
 * @param {string | null} [resourcesCardRaterId] — numeric id for `/resources/card-rater/:id` analytics
 * @param {string | null} [adminChild] — segment after `/admin/`, e.g. `users`
 * @param {AnnouncementAdminForm} [announcementForm] — announcements list vs `/new` vs `/:id/edit`
 * @param {string | null} [dataChild] — segment after `/data/`, e.g. `card-ratings`
 * @param {string | null} [dataCardRaterId] — numeric id for `/data/card-ratings/:id` analytics
 * @param {string | null} [resourcesDeckId] — numeric id for `/resources/decks/:id`
 * @param {string | null} [resourcesRecordingId] — numeric id for `/resources/recordings/:id`
 * @param {string | null} [resourcesEventId] — numeric id for `/resources/events/:id`
 * @param {string | null} [dataCardRaterCompareBaselineId] — baseline session for `/data/card-ratings/:id/compare/:baselineId`
 * @param {string | null} [resourcesCardRaterCompareBaselineId] — baseline session for `/resources/card-rater/:id/compare/:baselineId`
 */
function buildDashboardPathname(
  tabId,
  resourcesChild,
  resourcesCardIdentifier,
  resourcesCardRaterId,
  adminChild,
  announcementForm = null,
  dataChild = null,
  dataCardRaterId = null,
  resourcesDeckId = null,
  resourcesRecordingId = null,
  dataCardRaterCompareBaselineId = null,
  resourcesCardRaterCompareBaselineId = null,
  resourcesEventId = null,
) {
  if (tabId === SETTINGS_TAB_ID) return "/settings";
  if (tabId === DATA_TAB_ID) {
    const seg =
      dataChild === "card-ratings" || dataChild === "runaways-drafts"
        ? dataChild
        : DEFAULT_DATA_SEGMENT;
    if (seg === "card-ratings") {
      const rawId = dataCardRaterId != null ? String(dataCardRaterId).trim() : "";
      if (rawId !== "") {
        const rid = parseInt(rawId, 10);
        if (Number.isFinite(rid) && rid > 0 && String(rid) === rawId) {
          const rawBaseline =
            dataCardRaterCompareBaselineId != null ? String(dataCardRaterCompareBaselineId).trim() : "";
          if (rawBaseline !== "") {
            const bid = parseInt(rawBaseline, 10);
            if (Number.isFinite(bid) && bid > 0 && String(bid) === rawBaseline) {
              return `/data/card-ratings/${rid}/compare/${bid}`;
            }
          }
          return `/data/card-ratings/${rid}`;
        }
      }
      return "/data/card-ratings";
    }
    if (seg === "runaways-drafts") {
      return "/data/runaways-drafts";
    }
    return `/data/${DEFAULT_DATA_SEGMENT}`;
  }
  if (tabId === ADMIN_TAB_ID) {
    const seg =
      adminChild === "users" ||
      adminChild === "sets" ||
      adminChild === "announcements" ||
      adminChild === "card-rater" ||
      adminChild === "events"
        ? adminChild
        : DEFAULT_ADMIN_SEGMENT;
    if (seg === "announcements") {
      if (announcementForm === "new") return "/admin/announcements/new";
      if (typeof announcementForm === "number" && announcementForm > 0)
        return `/admin/announcements/${announcementForm}/edit`;
      return "/admin/announcements";
    }
    return `/admin/${seg}`;
  }
  if (tabId === RESOURCES_TAB_ID) {
    const seg =
      resourcesChild === "cards" ||
      resourcesChild === "decks" ||
      resourcesChild === "recordings" ||
      resourcesChild === "events" ||
      resourcesChild === "card-rater" ||
      resourcesChild === "card-rater-play"
        ? resourcesChild
        : DEFAULT_RESOURCES_SEGMENT;
    if (
      seg === "cards" &&
      resourcesCardIdentifier != null &&
      String(resourcesCardIdentifier).trim() !== ""
    ) {
      return `/resources/cards/${encodeURIComponent(String(resourcesCardIdentifier).trim())}`;
    }
    if (seg === "card-rater-play") {
      return "/resources/card-rater/play";
    }
    if (seg === "card-rater") {
      const rawId = resourcesCardRaterId != null ? String(resourcesCardRaterId).trim() : "";
      if (rawId !== "") {
        const rid = parseInt(rawId, 10);
        if (Number.isFinite(rid) && rid > 0 && String(rid) === rawId) {
          const rawBaseline =
            resourcesCardRaterCompareBaselineId != null
              ? String(resourcesCardRaterCompareBaselineId).trim()
              : "";
          if (rawBaseline !== "") {
            const bid = parseInt(rawBaseline, 10);
            if (Number.isFinite(bid) && bid > 0 && String(bid) === rawBaseline) {
              return `/resources/card-rater/${rid}/compare/${bid}`;
            }
          }
          return `/resources/card-rater/${rid}`;
        }
      }
      return "/resources/card-rater";
    }
    if (seg === "decks") {
      const rawId = resourcesDeckId != null ? String(resourcesDeckId).trim() : "";
      if (rawId !== "") {
        const did = parseInt(rawId, 10);
        if (Number.isFinite(did) && did > 0 && String(did) === rawId) {
          return `/resources/decks/${did}`;
        }
      }
      return "/resources/decks";
    }
    if (seg === "recordings") {
      const rawId = resourcesRecordingId != null ? String(resourcesRecordingId).trim() : "";
      if (rawId !== "") {
        const rid = parseInt(rawId, 10);
        if (Number.isFinite(rid) && rid > 0 && String(rid) === rawId) {
          return `/resources/recordings/${rid}`;
        }
      }
      return "/resources/recordings";
    }
    if (seg === "events") {
      const rawId = resourcesEventId != null ? String(resourcesEventId).trim() : "";
      if (rawId !== "") {
        const eid = parseInt(rawId, 10);
        if (Number.isFinite(eid) && eid > 0 && String(eid) === rawId) {
          return `/resources/events/${eid}`;
        }
      }
      return "/resources/events";
    }
    return `/resources/${seg}`;
  }
  return `/${tabId}`;
}

function replaceDashboardUrl(
  tabId,
  resourcesChild,
  resourcesCardIdentifier,
  resourcesCardRaterId,
  adminChild,
  announcementForm = null,
  dataChild = null,
  dataCardRaterId = null,
  resourcesDeckId = null,
  resourcesRecordingId = null,
  dataCardRaterCompareBaselineId = null,
  resourcesCardRaterCompareBaselineId = null,
  resourcesEventId = null,
) {
  try {
    const u = new URL(window.location.href);
    u.pathname = buildDashboardPathname(
      tabId,
      resourcesChild,
      resourcesCardIdentifier,
      resourcesCardRaterId,
      adminChild,
      announcementForm,
      dataChild,
      dataCardRaterId,
      resourcesDeckId,
      resourcesRecordingId,
      dataCardRaterCompareBaselineId,
      resourcesCardRaterCompareBaselineId,
      resourcesEventId,
    );
    u.search = "";
    const next = `${u.pathname}${u.search}${u.hash}`;
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== cur) window.history.replaceState({}, "", next);
  } catch {
    /* ignore */
  }
}

function pushDashboardUrl(
  tabId,
  resourcesChild,
  resourcesCardIdentifier,
  resourcesCardRaterId,
  adminChild,
  announcementForm = null,
  dataChild = null,
  dataCardRaterId = null,
  resourcesDeckId = null,
  resourcesRecordingId = null,
  dataCardRaterCompareBaselineId = null,
  resourcesCardRaterCompareBaselineId = null,
  resourcesEventId = null,
) {
  try {
    const u = new URL(window.location.href);
    u.pathname = buildDashboardPathname(
      tabId,
      resourcesChild,
      resourcesCardIdentifier,
      resourcesCardRaterId,
      adminChild,
      announcementForm,
      dataChild,
      dataCardRaterId,
      resourcesDeckId,
      resourcesRecordingId,
      dataCardRaterCompareBaselineId,
      resourcesCardRaterCompareBaselineId,
      resourcesEventId,
    );
    u.search = "";
    const next = `${u.pathname}${u.search}${u.hash}`;
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== cur) window.history.pushState({}, "", next);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} pathname
 * @returns {{ kind: "empty" } | { kind: "invalid" } | { kind: "ok", tabId: string, resourcesChild: string | null, resourcesCardIdentifier: string | null, resourcesCardRaterId: string | null, adminChild: string | null, adminAnnouncementForm: AnnouncementAdminForm, dataChild?: string | null, dataCardRaterId?: string | null }}
 */
function parseDashboardPathname(pathname) {
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "empty" };

  const [a, b, c, ...rest] = parts;

  if (a === "resources") {
    if (b === "cards") {
      if (c === undefined && rest.length > 0) return { kind: "invalid" };
      if (c === undefined) {
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "cards",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      return {
        kind: "ok",
        tabId: RESOURCES_TAB_ID,
        resourcesChild: "cards",
        resourcesCardIdentifier: decodeURIComponent(c),
        resourcesCardRaterId: null,
        adminChild: null,
        adminAnnouncementForm: null,
      };
    }
    if (b === "card-rater" || b === "card-ranker") {
      if (c === undefined && rest.length > 0) return { kind: "invalid" };
      if (c === undefined) {
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "card-rater",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      if (c === "play") {
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "card-rater-play",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      const rid = parseInt(String(c), 10);
      if (Number.isFinite(rid) && rid > 0 && String(rid) === String(c)) {
        if (rest[0] === "compare" && rest.length === 2) {
          const bid = parseInt(String(rest[1]), 10);
          if (Number.isFinite(bid) && bid > 0 && String(bid) === String(rest[1])) {
            return {
              kind: "ok",
              tabId: RESOURCES_TAB_ID,
              resourcesChild: "card-rater",
              resourcesCardIdentifier: null,
              resourcesCardRaterId: String(rid),
              resourcesCardRaterCompareBaselineId: String(bid),
              adminChild: null,
              adminAnnouncementForm: null,
            };
          }
          return { kind: "invalid" };
        }
        if (rest.length > 0) return { kind: "invalid" };
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "card-rater",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: String(rid),
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      return { kind: "invalid" };
    }
    if (b === "decks") {
      if (c === undefined && rest.length > 0) return { kind: "invalid" };
      if (c === undefined) {
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "decks",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          resourcesDeckId: null,
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      const did = parseInt(String(c), 10);
      if (Number.isFinite(did) && did > 0 && String(did) === String(c)) {
        if (rest.length > 0) return { kind: "invalid" };
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "decks",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          resourcesDeckId: String(did),
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      return { kind: "invalid" };
    }
    if (b === "recordings") {
      if (c === undefined && rest.length > 0) return { kind: "invalid" };
      if (c === undefined) {
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "recordings",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          resourcesDeckId: null,
          resourcesRecordingId: null,
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      const rid = parseInt(String(c), 10);
      if (Number.isFinite(rid) && rid > 0 && String(rid) === String(c)) {
        if (rest.length > 0) return { kind: "invalid" };
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "recordings",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          resourcesDeckId: null,
          resourcesRecordingId: String(rid),
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      return { kind: "invalid" };
    }
    if (b === "events") {
      if (c === undefined && rest.length > 0) return { kind: "invalid" };
      if (c === undefined) {
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "events",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          resourcesDeckId: null,
          resourcesRecordingId: null,
          resourcesEventId: null,
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      const eid = parseInt(String(c), 10);
      if (Number.isFinite(eid) && eid > 0 && String(eid) === String(c)) {
        if (rest.length > 0) return { kind: "invalid" };
        return {
          kind: "ok",
          tabId: RESOURCES_TAB_ID,
          resourcesChild: "events",
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          resourcesDeckId: null,
          resourcesRecordingId: null,
          resourcesEventId: String(eid),
          adminChild: null,
          adminAnnouncementForm: null,
        };
      }
      return { kind: "invalid" };
    }
    return { kind: "invalid" };
  }

  if (a === "admin") {
    if (b === undefined) {
      return {
        kind: "ok",
        tabId: ADMIN_TAB_ID,
        resourcesChild: null,
        resourcesCardIdentifier: null,
        resourcesCardRaterId: null,
        adminChild: "users",
        adminAnnouncementForm: null,
      };
    }
    if (b === "users") {
      if (c !== undefined || rest.length > 0) return { kind: "invalid" };
      return {
        kind: "ok",
        tabId: ADMIN_TAB_ID,
        resourcesChild: null,
        resourcesCardIdentifier: null,
        resourcesCardRaterId: null,
        adminChild: "users",
        adminAnnouncementForm: null,
      };
    }
    if (b === "sets") {
      if (c !== undefined || rest.length > 0) return { kind: "invalid" };
      return {
        kind: "ok",
        tabId: ADMIN_TAB_ID,
        resourcesChild: null,
        resourcesCardIdentifier: null,
        resourcesCardRaterId: null,
        adminChild: "sets",
        adminAnnouncementForm: null,
      };
    }
    if (b === "card-rater") {
      if (c !== undefined || rest.length > 0) return { kind: "invalid" };
      return {
        kind: "ok",
        tabId: ADMIN_TAB_ID,
        resourcesChild: null,
        resourcesCardIdentifier: null,
        resourcesCardRaterId: null,
        adminChild: "card-rater",
        adminAnnouncementForm: null,
      };
    }
    if (b === "events") {
      if (c !== undefined || rest.length > 0) return { kind: "invalid" };
      return {
        kind: "ok",
        tabId: ADMIN_TAB_ID,
        resourcesChild: null,
        resourcesCardIdentifier: null,
        resourcesCardRaterId: null,
        adminChild: "events",
        adminAnnouncementForm: null,
      };
    }
    if (b === "announcements") {
      const trail = c === undefined && rest.length === 0 ? [] : [c, ...rest];
      if (trail.length === 0) {
        return {
          kind: "ok",
          tabId: ADMIN_TAB_ID,
          resourcesChild: null,
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: "announcements",
          adminAnnouncementForm: null,
        };
      }
      if (trail.length === 1 && trail[0] === "new") {
        return {
          kind: "ok",
          tabId: ADMIN_TAB_ID,
          resourcesChild: null,
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: "announcements",
          adminAnnouncementForm: "new",
        };
      }
      if (
        trail.length === 2 &&
        trail[1] === "edit" &&
        String(trail[0]) !== "" &&
        String(trail[0]) !== "new"
      ) {
        const editId = parseInt(String(trail[0]), 10);
        if (!Number.isFinite(editId) || editId <= 0 || String(editId) !== String(trail[0])) {
          return { kind: "invalid" };
        }
        return {
          kind: "ok",
          tabId: ADMIN_TAB_ID,
          resourcesChild: null,
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: "announcements",
          adminAnnouncementForm: editId,
        };
      }
      return { kind: "invalid" };
    }
    return { kind: "invalid" };
  }

  if (a === "settings" && b === undefined && c === undefined && rest.length === 0) {
    return {
      kind: "ok",
      tabId: SETTINGS_TAB_ID,
      resourcesChild: null,
      resourcesCardIdentifier: null,
      resourcesCardRaterId: null,
      adminChild: null,
      adminAnnouncementForm: null,
    };
  }

  /** Legacy dashboard URL before Admin submenu (`/users` → `/admin/users`). */
  if (a === "users" && b === undefined && c === undefined && rest.length === 0) {
    return {
      kind: "ok",
      tabId: ADMIN_TAB_ID,
      resourcesChild: null,
      resourcesCardIdentifier: null,
      resourcesCardRaterId: null,
      adminChild: "users",
      adminAnnouncementForm: null,
    };
  }

  if (a === "data") {
    if (b === undefined && rest.length > 0) return { kind: "invalid" };
    if (b === undefined) {
      return {
        kind: "ok",
        tabId: DATA_TAB_ID,
        resourcesChild: null,
        resourcesCardIdentifier: null,
        resourcesCardRaterId: null,
        adminChild: null,
        adminAnnouncementForm: null,
        dataChild: DEFAULT_DATA_SEGMENT,
        dataCardRaterId: null,
      };
    }
    if (b === "card-ratings") {
      if (c === undefined && rest.length > 0) return { kind: "invalid" };
      if (c === undefined) {
        return {
          kind: "ok",
          tabId: DATA_TAB_ID,
          resourcesChild: null,
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: null,
          adminAnnouncementForm: null,
          dataChild: "card-ratings",
          dataCardRaterId: null,
        };
      }
      const rid = parseInt(String(c), 10);
      if (!Number.isFinite(rid) || rid <= 0 || String(rid) !== String(c)) {
        return { kind: "invalid" };
      }
      if (rest[0] === "compare" && rest.length === 2) {
        const bid = parseInt(String(rest[1]), 10);
        if (!Number.isFinite(bid) || bid <= 0 || String(bid) !== String(rest[1])) {
          return { kind: "invalid" };
        }
        return {
          kind: "ok",
          tabId: DATA_TAB_ID,
          resourcesChild: null,
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: null,
          adminAnnouncementForm: null,
          dataChild: "card-ratings",
          dataCardRaterId: String(rid),
          dataCardRaterCompareBaselineId: String(bid),
        };
      }
      if (rest.length > 0) return { kind: "invalid" };
      return {
        kind: "ok",
        tabId: DATA_TAB_ID,
        resourcesChild: null,
        resourcesCardIdentifier: null,
        resourcesCardRaterId: null,
        adminChild: null,
        adminAnnouncementForm: null,
        dataChild: "card-ratings",
        dataCardRaterId: String(rid),
      };
    }
    if (b === "runaways-drafts" && c === undefined && rest.length === 0) {
      return {
        kind: "ok",
        tabId: DATA_TAB_ID,
        resourcesChild: null,
        resourcesCardIdentifier: null,
        resourcesCardRaterId: null,
        adminChild: null,
        adminAnnouncementForm: null,
        dataChild: "runaways-drafts",
        dataCardRaterId: null,
      };
    }
    return { kind: "invalid" };
  }

  if (b !== undefined || c !== undefined) return { kind: "invalid" };

  return {
    kind: "ok",
    tabId: a,
    resourcesChild: null,
    resourcesCardIdentifier: null,
    resourcesCardRaterId: null,
    adminChild: null,
    adminAnnouncementForm: null,
  };
}

/**
 * @param {string} pathname
 * @param {string} search
 * @param {{ id: string }[]} tabsAllowed
 * @returns {{ tabId: string, resourcesChild: string | null, resourcesCardIdentifier: string | null, resourcesCardRaterId: string | null, adminChild: string | null, adminAnnouncementForm: AnnouncementAdminForm, dataChild: string | null, dataCardRaterId: string | null }}
 */
/** @param {string} tabId @param {{ kind: string, dataChild?: string | null, dataCardRaterId?: string | null }} parsed */
function resolveDataFields(tabId, parsed) {
  if (tabId === DATA_TAB_ID && parsed.kind === "ok") {
    return {
      dataChild: parsed.dataChild ?? DEFAULT_DATA_SEGMENT,
      dataCardRaterId: parsed.dataCardRaterId ?? null,
      dataCardRaterCompareBaselineId: parsed.dataCardRaterCompareBaselineId ?? null,
    };
  }
  return { dataChild: null, dataCardRaterId: null, dataCardRaterCompareBaselineId: null };
}

function resolveDashboardLocation(pathname, search, tabsAllowed) {
  const parsed = parseDashboardPathname(pathname);

  if (parsed.kind === "invalid") {
    return {
      tabId: FALLBACK_TAB_ID,
      resourcesChild: null,
      resourcesCardIdentifier: null,
      resourcesCardRaterId: null,
      adminChild: null,
      adminAnnouncementForm: null,
      dataChild: null,
      dataCardRaterId: null,
    };
  }

  if (parsed.kind === "empty") {
    try {
      const raw = new URLSearchParams(search).get("tab");
      if (raw === RESOURCES_TAB_ID || raw === ADMIN_TAB_ID) {
        return {
          tabId: FALLBACK_TAB_ID,
          resourcesChild: null,
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: null,
          adminAnnouncementForm: null,
          dataChild: null,
          dataCardRaterId: null,
        };
      }
      if (raw && tabsAllowed.some((t) => t.id === raw)) {
        const tabId = raw;
        const dataDefaults =
          tabId === DATA_TAB_ID
            ? { dataChild: DEFAULT_DATA_SEGMENT, dataCardRaterId: null }
            : { dataChild: null, dataCardRaterId: null };
        return {
          tabId,
          resourcesChild: null,
          resourcesCardIdentifier: null,
          resourcesCardRaterId: null,
          adminChild: null,
          adminAnnouncementForm: null,
          ...dataDefaults,
        };
      }
    } catch {
      /* ignore */
    }
    return {
      tabId: FALLBACK_TAB_ID,
      resourcesChild: null,
      resourcesCardIdentifier: null,
      resourcesCardRaterId: null,
      adminChild: null,
      adminAnnouncementForm: null,
      dataChild: null,
      dataCardRaterId: null,
    };
  }

  let {
    tabId,
    resourcesChild,
    resourcesCardIdentifier,
    resourcesCardRaterId,
    adminChild,
    adminAnnouncementForm,
  } = parsed;

  if (tabId === SETTINGS_TAB_ID) {
    return {
      tabId: SETTINGS_TAB_ID,
      resourcesChild: null,
      resourcesCardIdentifier: null,
      resourcesCardRaterId: null,
      adminChild: null,
      adminAnnouncementForm: null,
      dataChild: null,
      dataCardRaterId: null,
    };
  }

  if (!tabsAllowed.some((t) => t.id === tabId)) {
    return {
      tabId: FALLBACK_TAB_ID,
      resourcesChild: null,
      resourcesCardIdentifier: null,
      resourcesCardRaterId: null,
      adminChild: null,
      adminAnnouncementForm: null,
      dataChild: null,
      dataCardRaterId: null,
    };
  }

  const { dataChild, dataCardRaterId, dataCardRaterCompareBaselineId } = resolveDataFields(tabId, parsed);

  return {
    tabId,
    resourcesChild,
    resourcesCardIdentifier,
    resourcesCardRaterId,
    resourcesCardRaterCompareBaselineId: parsed.resourcesCardRaterCompareBaselineId ?? null,
    resourcesDeckId: parsed.resourcesDeckId ?? null,
    resourcesRecordingId: parsed.resourcesRecordingId ?? null,
    resourcesEventId: parsed.resourcesEventId ?? null,
    adminChild,
    adminAnnouncementForm,
    dataChild,
    dataCardRaterId,
    dataCardRaterCompareBaselineId,
  };
}

/** Matches backend/domain: RoleAdmin = 0, RoleMember = 1 */
const ROLE_ADMIN = 0;

/**
 * Admin tab requires admin (`role === 0`). Omit `requiresAdmin` for member-visible tabs.
 * @typedef {{ id: string, label: string, requiresAdmin?: boolean }} DashboardTabSpec
 */
const ALL_TABS = [
  { id: "announcements", label: "Announcements" },
  { id: "data", label: "Data" },
  { id: "resources", label: "Resources" },
  { id: ADMIN_TAB_ID, label: "Admin", requiresAdmin: true },
];

const MD_UP = "(min-width: 768px)";
const THEME_STORAGE_KEY = "rg-dashboard-theme";

const DASHBOARD_LOGO_URL = "https://storage.googleapis.com/righteous-assets/righteous-logo-horizontal.png";

const shellDark =
  "bg-shell-dashboard box-border flex min-h-screen flex-col px-4 pb-6 pt-3 text-[#f4f0fa] sm:px-5";

/* Light: pale lavender page + radial glow; UI chrome matches dark styling (screenshot reference). */
const shellLight =
  "bg-shell-light-fog box-border flex min-h-screen flex-col px-4 pb-6 pt-3 text-[#f4f0fa] sm:px-5";

const tabsRootSharedWidth =
  "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 lg:max-w-6xl xl:max-w-7xl";

const tabsRootDark = tabsRootSharedWidth;

/** Wide layout only; no extra surface (matches pre–purple-card light look). */
const tabsRootLight = tabsRootSharedWidth;

/** Tab row only (border/background live on `navRail*` wrapper with logo). `overflow-visible` so Resources dropdown is not clipped. */
const desktopTabListShared =
  "hidden min-w-0 md:flex md:flex-1 md:flex-nowrap md:items-stretch md:gap-1 md:overflow-visible";

/** One bar: logo + tabs (desktop); logo only surface on mobile while list is hidden. */
const navRailDark =
  "box-border flex min-h-[2.875rem] min-w-0 flex-1 items-center gap-1 overflow-visible rounded-lg border border-white/[0.24] bg-black/30 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:min-h-12 md:min-h-0 md:items-stretch";

const navRailLight =
  "box-border flex min-h-[2.875rem] min-w-0 flex-1 items-center gap-1 overflow-visible rounded-lg border border-white/[0.12] bg-[rgba(42,37,54,0.9)] p-1 backdrop-blur-sm sm:min-h-12 md:min-h-0 md:items-stretch";

/** Every top-level tab occupies one equal flex column; triggers fill width (`w-full`) so short labels don’t shrink the cell. */
const desktopTabSlot =
  "relative z-20 flex min-h-12 min-w-0 flex-1 basis-0 flex-col items-stretch justify-center self-stretch";

/* ~30% taller bar vs min-h-9; ~50% wider hit area vs px-3. Equal-width tabs on desktop: flex-1 + basis-0 + w-full */
const desktopTriggerDark =
  "flex min-h-12 w-full min-w-0 basis-0 cursor-pointer select-none items-center justify-center rounded-md border border-transparent px-[1.125rem] py-2.5 text-[0.875rem] font-semibold tracking-wide text-[#f4f0fa]/85 outline-none transition-colors hover:border-purple-300/45 hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(16,8,28,0.92)] data-[state=active]:border-[rgba(142,90,200,0.75)] data-[state=active]:bg-gradient-to-br data-[state=active]:from-[rgba(80,40,120,0.55)] data-[state=active]:to-[rgba(40,20,70,0.65)] data-[state=active]:text-white data-[state=active]:shadow-[0_3px_16px_rgba(90,40,140,0.22)] md:flex-1 md:whitespace-normal md:text-center md:leading-snug md:break-words";

/* Active/hover purples track Login gradient: from-[#7b4cb8] to-[#5a2f8f] */
const desktopTriggerLight =
  "flex min-h-12 w-full min-w-0 basis-0 cursor-pointer select-none items-center justify-center rounded-md border border-transparent px-[1.125rem] py-2.5 text-[0.875rem] font-semibold tracking-wide text-[#f4f0fa]/85 outline-none transition-colors hover:border-[#b998e8]/55 hover:text-white focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(42,37,54,0.92)] data-[state=active]:border-[rgba(152,117,207,0.9)] data-[state=active]:bg-gradient-to-b data-[state=active]:from-[#7b4cb8] data-[state=active]:to-[#5a2f8f] data-[state=active]:text-white data-[state=active]:shadow-[0_4px_18px_rgb(103_61_154/0.42)] md:flex-1 md:whitespace-normal md:text-center md:leading-snug md:break-words";

/** Single-option tabs use the same rail row height as expandable tabs. */
const mobileNavRowMin =
  "flex min-h-[3.25rem] w-full items-center rounded-lg px-[1.125rem] py-3.5 text-left text-[0.95rem] font-semibold outline-none transition-colors";

/** @param {boolean} selected */
function mobileNavItemSurface(selected, isLight) {
  if (selected) {
    return isLight
      ? "border border-[rgba(152,117,207,0.9)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white shadow-[0_4px_18px_rgb(103_61_154/0.42)] focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/70"
      : "border border-[rgba(142,90,200,0.75)] bg-gradient-to-br from-[rgba(80,40,120,0.55)] to-[rgba(40,20,70,0.65)] text-white shadow-[0_3px_16px_rgba(90,40,140,0.22)] focus-visible:ring-2 focus-visible:ring-purple-500/65";
  }
  return isLight
    ? "border border-transparent bg-black/25 text-[#f4f0fa]/88 hover:border-[#b998e8]/35 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/60"
    : "border border-transparent bg-black/25 text-[#f4f0fa]/88 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-purple-500/65";
}

/** Logo sits inside `navRail*`. Mobile: no right divider (tabs hidden); logo centered in rail. */
const logoInRailBase =
  "box-border flex min-w-0 flex-1 items-center justify-center px-2 py-0.5 md:flex-none md:shrink-0 md:justify-start md:border-r md:px-2 md:py-0 md:pl-2 md:pr-3";

const comingSoonTitle =
  "relative z-[1] m-0 mb-2.5 bg-[length:200%_auto] bg-gradient-to-r from-white from-0% via-violet-300 via-40% via-purple-500 via-70% to-fuchsia-100 to-100% bg-clip-text text-[clamp(1.75rem,6vw,2.75rem)] font-bold uppercase tracking-[0.06em] text-transparent [animation:dashboard-shimmer_8s_ease-in-out_infinite]";

const comingSoonGlow =
  "pointer-events-none absolute left-1/2 top-1/2 size-[min(18rem,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(150,90,210,0.22)_0%,transparent_68%)]";

/**
 * Flush under the tab trigger (`-translate-y-px`, no margin gap). `before:` extends an invisible
 * hit area upward so the cursor can reach items without leaving hover. `rounded-t-none` + trigger
 * `rounded-b-none` read as one expanded surface.
 */
const resourcesMenuDark =
  "absolute left-0 right-0 top-full z-30 flex min-w-0 -translate-y-px flex-col gap-0.5 rounded-b-md rounded-t-none border border-t-0 border-white/[0.24] bg-[rgba(16,8,28,0.97)] p-1 pt-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm before:pointer-events-auto before:absolute before:inset-x-0 before:bottom-full before:z-[1] before:h-5 before:content-['']";

const resourcesMenuLight =
  "absolute left-0 right-0 top-full z-30 flex min-w-0 -translate-y-px flex-col gap-0.5 rounded-b-md rounded-t-none border border-t-0 border-white/[0.12] bg-[rgba(42,37,54,0.98)] p-1 pt-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm before:pointer-events-auto before:absolute before:inset-x-0 before:bottom-full before:z-[1] before:h-5 before:content-['']";

const resourcesMenuItemDark =
  "w-full rounded-md px-3 py-2.5 text-left text-[0.8125rem] font-semibold tracking-wide text-[#f4f0fa]/90 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500/65";

const resourcesMenuItemLight =
  "w-full rounded-md px-3 py-2.5 text-left text-[0.8125rem] font-semibold tracking-wide text-[#f4f0fa]/90 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/60";

const resourcesMenuItemActiveDark =
  "border border-[rgba(142,90,200,0.75)] bg-gradient-to-br from-[rgba(80,40,120,0.55)] to-[rgba(40,20,70,0.65)] text-white shadow-[0_2px_12px_rgba(90,40,140,0.22)]";

const resourcesMenuItemActiveLight =
  "border border-[rgba(152,117,207,0.85)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white shadow-[0_2px_14px_rgb(103_61_154/0.35)]";

function HamburgerIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

/**
 * @param {{ onNavigate?: (path: string) => void }} props
 */
export default function Dashboard({ onNavigate }) {
  const { signOut, sessionProfile } = useAuth();
  const [activeTab, setActiveTab] = useState(ALL_TABS[0].id);
  /** When `activeTab === resources`, which sub-route is shown (`/resources/...`). */
  const [resourcesChild, setResourcesChild] = useState(/** @type {string | null} */ (null));
  /** Fab `card_identifier` when URL is `/resources/cards/:identifier`. */
  const [resourcesCardIdentifier, setResourcesCardIdentifier] = useState(
    /** @type {string | null} */ (null),
  );
  /** Numeric `card_rater.id` when URL is `/resources/card-rater/:id` (analytics). */
  const [resourcesCardRaterId, setResourcesCardRaterId] = useState(/** @type {string | null} */ (null));
  /** Numeric `decks.id` when URL is `/resources/decks/:id`. */
  const [resourcesDeckId, setResourcesDeckId] = useState(/** @type {string | null} */ (null));
  /** Numeric `recordings.id` when URL is `/resources/recordings/:id`. */
  const [resourcesRecordingId, setResourcesRecordingId] = useState(/** @type {string | null} */ (null));
  /** Numeric `events.id` when URL is `/resources/events/:id`. */
  const [resourcesEventId, setResourcesEventId] = useState(/** @type {string | null} */ (null));
  /** True while showing CardRanker at `/resources/card-rater` (active session; no id in URL). */
  const [cardRaterPlayAtRoot, setCardRaterPlayAtRoot] = useState(false);
  /** When `activeTab === admin`, which sub-route is shown (`/admin/...`). */
  const [adminChild, setAdminChild] = useState(/** @type {string | null} */ (null));
  /** Sub-route under `/admin/announcements` (list vs create vs edit). */
  const [adminAnnouncementForm, setAdminAnnouncementForm] = useState(
    /** @type {AnnouncementAdminForm} */ (null),
  );
  /** When `activeTab === data`, which sub-route is shown (`/data/...`). */
  const [dataChild, setDataChild] = useState(/** @type {string | null} */ (null));
  /** Numeric `card_rater.id` when URL is `/data/card-ratings/:id` (analytics). */
  const [dataCardRaterId, setDataCardRaterId] = useState(/** @type {string | null} */ (null));
  /** Baseline session id when URL is `/data/card-ratings/:id/compare/:baselineId`. */
  const [dataCardRaterCompareBaselineId, setDataCardRaterCompareBaselineId] = useState(
    /** @type {string | null} */ (null),
  );
  /** Baseline session id when URL is `/resources/card-rater/:id/compare/:baselineId`. */
  const [resourcesCardRaterCompareBaselineId, setResourcesCardRaterCompareBaselineId] = useState(
    /** @type {string | null} */ (null),
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(false);
  const [mobileDataOpen, setMobileDataOpen] = useState(false);
  const [resourcesHovered, setResourcesHovered] = useState(false);
  const [adminHovered, setAdminHovered] = useState(false);
  const [dataHovered, setDataHovered] = useState(false);

  const tabs = useMemo(() => {
    const isAdmin = Number(sessionProfile?.role) === ROLE_ADMIN;
    return ALL_TABS.filter((t) => !t.requiresAdmin || isAdmin);
  }, [sessionProfile]);

  const resourcesTabLabel = useMemo(() => {
    if (activeTab !== RESOURCES_TAB_ID) {
      return ALL_TABS.find((t) => t.id === RESOURCES_TAB_ID)?.label ?? "Resources";
    }
    const hit = RESOURCE_SUB_LINKS.find(
      (l) =>
        l.segment === resourcesChild ||
        (l.segment === "card-rater" &&
          (resourcesChild === "card-rater-play" || (resourcesChild === "card-rater" && cardRaterPlayAtRoot))),
    );
    return hit?.label ?? "Resources";
  }, [activeTab, resourcesChild, cardRaterPlayAtRoot]);

  const adminTabLabel = useMemo(() => {
    if (activeTab !== ADMIN_TAB_ID) {
      return ALL_TABS.find((t) => t.id === ADMIN_TAB_ID)?.label ?? "Admin";
    }
    const hit = ADMIN_SUB_LINKS.find((l) => l.segment === adminChild);
    return hit?.label ?? "Admin";
  }, [activeTab, adminChild]);

  const dataTabLabel = useMemo(() => {
    if (activeTab !== DATA_TAB_ID) {
      return ALL_TABS.find((t) => t.id === DATA_TAB_ID)?.label ?? "Data";
    }
    const hit = DATA_SUB_LINKS.find((l) => l.segment === dataChild);
    return hit?.label ?? "Data";
  }, [activeTab, dataChild]);

  const handleTabNavigate = useCallback((tabId) => {
    setActiveTab(tabId);
    if (tabId === RESOURCES_TAB_ID) {
      setResourcesChild(DEFAULT_RESOURCES_SEGMENT);
      setResourcesCardIdentifier(null);
      setResourcesCardRaterId(null);
      setResourcesDeckId(null);
      setResourcesRecordingId(null);
      setCardRaterPlayAtRoot(false);
      setAdminChild(null);
      setAdminAnnouncementForm(null);
      setDataChild(null);
      setDataCardRaterId(null);
      replaceDashboardUrl(RESOURCES_TAB_ID, DEFAULT_RESOURCES_SEGMENT, null, null, null, null);
    } else if (tabId === ADMIN_TAB_ID) {
      setAdminChild(DEFAULT_ADMIN_SEGMENT);
      setResourcesChild(null);
      setResourcesCardIdentifier(null);
      setResourcesCardRaterId(null);
      setResourcesDeckId(null);
      setResourcesRecordingId(null);
      setCardRaterPlayAtRoot(false);
      setAdminAnnouncementForm(null);
      setDataChild(null);
      setDataCardRaterId(null);
      replaceDashboardUrl(ADMIN_TAB_ID, null, null, null, DEFAULT_ADMIN_SEGMENT, null);
    } else if (tabId === DATA_TAB_ID) {
      setDataChild(DEFAULT_DATA_SEGMENT);
      setDataCardRaterId(null);
      setResourcesChild(null);
      setResourcesCardIdentifier(null);
      setResourcesCardRaterId(null);
      setResourcesDeckId(null);
      setResourcesRecordingId(null);
      setCardRaterPlayAtRoot(false);
      setAdminChild(null);
      setAdminAnnouncementForm(null);
      replaceDashboardUrl(DATA_TAB_ID, null, null, null, null, null, DEFAULT_DATA_SEGMENT, null);
    } else {
      setResourcesChild(null);
      setResourcesCardIdentifier(null);
      setResourcesCardRaterId(null);
      setResourcesDeckId(null);
      setResourcesRecordingId(null);
      setCardRaterPlayAtRoot(false);
      setAdminChild(null);
      setAdminAnnouncementForm(null);
      setDataChild(null);
      setDataCardRaterId(null);
      replaceDashboardUrl(tabId, null, null, null, null, null);
      setMobileResourcesOpen(false);
      setMobileAdminOpen(false);
      setMobileDataOpen(false);
    }
  }, []);

  const goResourcesSub = useCallback((segment) => {
    setActiveTab(RESOURCES_TAB_ID);
    setResourcesChild(segment);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setResourcesDeckId(null);
    setResourcesRecordingId(null);
    setResourcesEventId(null);
    if (segment === "card-rater") setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    setDataChild(null);
    setDataCardRaterId(null);
    replaceDashboardUrl(RESOURCES_TAB_ID, segment, null, null, null, null);
  }, []);

  const goDataSub = useCallback((segment) => {
    setActiveTab(DATA_TAB_ID);
    setDataChild(segment);
    setDataCardRaterId(null);
    setResourcesChild(null);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    replaceDashboardUrl(DATA_TAB_ID, null, null, null, null, null, segment, null);
  }, []);

  const goAdminSub = useCallback((segment) => {
    setActiveTab(ADMIN_TAB_ID);
    setAdminChild(segment);
    setResourcesChild(null);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setCardRaterPlayAtRoot(false);
    setAdminAnnouncementForm(null);
    setDataChild(null);
    setDataCardRaterId(null);
    replaceDashboardUrl(ADMIN_TAB_ID, null, null, null, segment, null);
  }, []);

  const navigateAdminAnnouncementForm = useCallback(
    (/** @type {AnnouncementAdminForm} */ next, options) => {
      setAdminAnnouncementForm(next);
      const useReplace = options?.replace === true;
      if (useReplace) {
        replaceDashboardUrl(ADMIN_TAB_ID, null, null, null, "announcements", next);
      } else {
        pushDashboardUrl(ADMIN_TAB_ID, null, null, null, "announcements", next);
      }
    },
    [],
  );

  const openCardDetail = useCallback((identifier) => {
    const id = String(identifier).trim();
    if (!id) return;
    setActiveTab(RESOURCES_TAB_ID);
    setResourcesChild("cards");
    setResourcesCardIdentifier(id);
    setResourcesCardRaterId(null);
    setResourcesDeckId(null);
    setResourcesRecordingId(null);
    setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    setDataChild(null);
    setDataCardRaterId(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "cards", id, null, null, null);
  }, []);

  const openDeckDetail = useCallback((deckId) => {
    const sid = String(deckId).trim();
    if (!/^\d+$/.test(sid)) return;
    setActiveTab(RESOURCES_TAB_ID);
    setResourcesChild("decks");
    setResourcesDeckId(sid);
    setResourcesRecordingId(null);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    setDataChild(null);
    setDataCardRaterId(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "decks", null, null, null, null, null, null, sid);
  }, []);

  const closeDeckDetail = useCallback(() => {
    setResourcesChild("decks");
    setResourcesDeckId(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "decks", null, null, null, null, null, null, null, null);
  }, []);

  const openRecordingDetail = useCallback((recordingId) => {
    const sid = String(recordingId).trim();
    if (!/^\d+$/.test(sid)) return;
    setActiveTab(RESOURCES_TAB_ID);
    setResourcesChild("recordings");
    setResourcesRecordingId(sid);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setResourcesDeckId(null);
    setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    setDataChild(null);
    setDataCardRaterId(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "recordings", null, null, null, null, null, null, null, sid);
  }, []);

  const closeRecordingDetail = useCallback(() => {
    setResourcesChild("recordings");
    setResourcesRecordingId(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "recordings", null, null, null, null, null, null, null, null);
  }, []);

  const openEventDetail = useCallback((eventId) => {
    const eid = String(eventId).trim();
    if (!/^\d+$/.test(eid)) return;
    setActiveTab(RESOURCES_TAB_ID);
    setResourcesChild("events");
    setResourcesEventId(eid);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setResourcesDeckId(null);
    setResourcesRecordingId(null);
    setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    setDataChild(null);
    setDataCardRaterId(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "events", null, null, null, null, null, null, null, null, null, null, eid);
  }, []);

  const closeEventDetail = useCallback(() => {
    setResourcesChild("events");
    setResourcesEventId(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "events", null, null, null, null, null, null, null, null, null, null, null);
  }, []);

  const openDataCardRaterAnalytics = useCallback((raterId) => {
    const sid = String(raterId).trim();
    if (!/^\d+$/.test(sid)) return;
    setActiveTab(DATA_TAB_ID);
    setDataChild("card-ratings");
    setDataCardRaterId(sid);
    setDataCardRaterCompareBaselineId(null);
    setResourcesChild(null);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setResourcesCardRaterCompareBaselineId(null);
    setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    pushDashboardUrl(DATA_TAB_ID, null, null, null, null, null, "card-ratings", sid);
    setMobileNavOpen(false);
  }, []);

  const openDataCardRaterCompare = useCallback((raterId, baselineId) => {
    const sid = String(raterId).trim();
    const bid = String(baselineId).trim();
    if (!/^\d+$/.test(sid) || !/^\d+$/.test(bid)) return;
    setActiveTab(DATA_TAB_ID);
    setDataChild("card-ratings");
    setDataCardRaterId(sid);
    setDataCardRaterCompareBaselineId(bid);
    setResourcesChild(null);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setResourcesCardRaterCompareBaselineId(null);
    setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    pushDashboardUrl(DATA_TAB_ID, null, null, null, null, null, "card-ratings", sid, null, null, bid);
    setMobileNavOpen(false);
  }, []);

  const closeDataCardRaterCompare = useCallback(() => {
    if (dataCardRaterId == null) return;
    setDataCardRaterCompareBaselineId(null);
    pushDashboardUrl(
      DATA_TAB_ID,
      null,
      null,
      null,
      null,
      null,
      "card-ratings",
      dataCardRaterId,
    );
  }, [dataCardRaterId]);

  const openCardRaterAnalytics = useCallback((raterId) => {
    const sid = String(raterId).trim();
    if (!/^\d+$/.test(sid)) return;
    setCardRaterPlayAtRoot(false);
    setActiveTab(RESOURCES_TAB_ID);
    setResourcesChild("card-rater");
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(sid);
    setResourcesCardRaterCompareBaselineId(null);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "card-rater", null, sid, null, null);
    setMobileNavOpen(false);
  }, []);

  const openResourcesCardRaterCompare = useCallback((raterId, baselineId) => {
    const sid = String(raterId).trim();
    const bid = String(baselineId).trim();
    if (!/^\d+$/.test(sid) || !/^\d+$/.test(bid)) return;
    setCardRaterPlayAtRoot(false);
    setActiveTab(RESOURCES_TAB_ID);
    setResourcesChild("card-rater");
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(sid);
    setResourcesCardRaterCompareBaselineId(bid);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "card-rater", null, sid, null, null, null, null, null, null, null, bid);
    setMobileNavOpen(false);
  }, []);

  const closeResourcesCardRaterCompare = useCallback(() => {
    if (resourcesCardRaterId == null) return;
    setResourcesCardRaterCompareBaselineId(null);
    pushDashboardUrl(RESOURCES_TAB_ID, "card-rater", null, resourcesCardRaterId, null, null);
  }, [resourcesCardRaterId]);

  const openCardRaterPlayAtRoot = useCallback(() => {
    setCardRaterPlayAtRoot(true);
  }, []);

  const openSettings = useCallback(() => {
    setActiveTab(SETTINGS_TAB_ID);
    setResourcesChild(null);
    setResourcesCardIdentifier(null);
    setResourcesCardRaterId(null);
    setCardRaterPlayAtRoot(false);
    setAdminChild(null);
    setAdminAnnouncementForm(null);
    setDataChild(null);
    setDataCardRaterId(null);
    setMobileNavOpen(false);
    pushDashboardUrl(SETTINGS_TAB_ID, null, null, null, null, null);
  }, []);

  useEffect(() => {
    function syncFromBrowser() {
      const resolved = resolveDashboardLocation(
        window.location.pathname,
        window.location.search,
        tabs,
      );
      const nextTab = resolved.tabId;
      const nextChild = nextTab === RESOURCES_TAB_ID ? resolved.resourcesChild : null;
      const nextCardId =
        nextTab === RESOURCES_TAB_ID ? resolved.resourcesCardIdentifier : null;
      const nextRaterId =
        nextTab === RESOURCES_TAB_ID ? resolved.resourcesCardRaterId : null;
      const nextDeckId = nextTab === RESOURCES_TAB_ID ? resolved.resourcesDeckId : null;
      const nextRecordingId = nextTab === RESOURCES_TAB_ID ? resolved.resourcesRecordingId : null;
      const nextEventId = nextTab === RESOURCES_TAB_ID ? resolved.resourcesEventId : null;
      const nextAdminChild = nextTab === ADMIN_TAB_ID ? resolved.adminChild : null;
      const nextAnnouncementForm =
        nextTab === ADMIN_TAB_ID && nextAdminChild === "announcements"
          ? resolved.adminAnnouncementForm
          : null;
      const nextDataChild = nextTab === DATA_TAB_ID ? resolved.dataChild : null;
      const nextDataRaterId = nextTab === DATA_TAB_ID ? resolved.dataCardRaterId : null;
      const nextDataCompareBaselineId =
        nextTab === DATA_TAB_ID ? resolved.dataCardRaterCompareBaselineId : null;
      const nextResourcesCompareBaselineId =
        nextTab === RESOURCES_TAB_ID ? resolved.resourcesCardRaterCompareBaselineId : null;
      setActiveTab(nextTab);
      setResourcesChild(nextChild);
      setResourcesCardIdentifier(nextCardId);
      setResourcesCardRaterId(nextRaterId);
      setResourcesCardRaterCompareBaselineId(nextResourcesCompareBaselineId);
      setResourcesDeckId(nextDeckId);
      setResourcesRecordingId(nextRecordingId);
      setResourcesEventId(nextEventId);
      const cardRaterAtRoot =
        nextTab === RESOURCES_TAB_ID &&
        nextChild === "card-rater" &&
        (nextRaterId == null || String(nextRaterId).trim() === "");
      if (!cardRaterAtRoot) setCardRaterPlayAtRoot(false);
      setAdminChild(nextAdminChild);
      setAdminAnnouncementForm(nextAnnouncementForm);
      setDataChild(nextDataChild);
      setDataCardRaterId(nextDataRaterId);
      setDataCardRaterCompareBaselineId(nextDataCompareBaselineId);
      replaceDashboardUrl(
        nextTab,
        nextTab === RESOURCES_TAB_ID ? nextChild : null,
        nextTab === RESOURCES_TAB_ID ? nextCardId : null,
        nextTab === RESOURCES_TAB_ID ? nextRaterId : null,
        nextTab === ADMIN_TAB_ID ? nextAdminChild : null,
        nextAnnouncementForm,
        nextTab === DATA_TAB_ID ? nextDataChild : null,
        nextTab === DATA_TAB_ID ? nextDataRaterId : null,
        nextTab === RESOURCES_TAB_ID ? nextDeckId : null,
        nextTab === RESOURCES_TAB_ID ? nextRecordingId : null,
        nextTab === DATA_TAB_ID ? nextDataCompareBaselineId : null,
        nextTab === RESOURCES_TAB_ID ? nextResourcesCompareBaselineId : null,
        nextTab === RESOURCES_TAB_ID ? nextEventId : null,
      );
      setMobileResourcesOpen(false);
      setMobileAdminOpen(false);
      setMobileDataOpen(false);
    }

    syncFromBrowser();
    window.addEventListener("popstate", syncFromBrowser);
    return () => window.removeEventListener("popstate", syncFromBrowser);
  }, [tabs]);

  const [theme, setTheme] = useState(() => {
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      return v === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia(MD_UP);
    const closeMobileIfDesktop = () => {
      if (mq.matches) setMobileNavOpen(false);
    };
    mq.addEventListener("change", closeMobileIfDesktop);
    return () => mq.removeEventListener("change", closeMobileIfDesktop);
  }, []);

  /** Fresh Resources / Admin submenu each time the drawer opens; on sub-routes keep children collapsed. */
  useEffect(() => {
    if (mobileNavOpen) {
      setMobileResourcesOpen(false);
      setMobileAdminOpen(false);
      setMobileDataOpen(false);
    }
  }, [mobileNavOpen]);

  const isLight = theme === "light";

  const showCardRankerResources =
    resourcesChild === "card-rater-play" ||
    (resourcesChild === "card-rater" && cardRaterPlayAtRoot);

  return (
    <div className={isLight ? shellLight : shellDark}>
      <Tabs.Root
        value={activeTab}
        onValueChange={handleTabNavigate}
        className={isLight ? tabsRootLight : tabsRootDark}
      >
        {/* Below header chrome; keeps mobile drawer above main panels */}
        <div
          className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 ease-out md:hidden ${
            mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!mobileNavOpen}
          onClick={() => setMobileNavOpen(false)}
        />

        <div className="relative z-50 md:z-auto">
          <header
            className={`relative z-10 flex min-h-[4.25rem] items-center gap-2 border-b-0 py-2 sm:gap-3 md:min-h-[4.5rem] md:border-b ${
              isLight ? "md:border-[rgba(80,65,110,0.22)]" : "md:border-white/[0.22]"
            }`}
          >
          <button
            type="button"
            className={
              isLight
                ? "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.22] bg-[rgba(42,37,54,0.88)] text-[#f4f0fa] hover:border-[rgba(232,197,71,0.35)] hover:bg-[rgba(42,37,54,0.95)] md:hidden"
                : "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.22] bg-black/35 text-white hover:border-[rgba(232,197,71,0.35)] md:hidden"
            }
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="dashboard-mobile-nav"
            id="dashboard-menu-button"
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            <HamburgerIcon className="text-[#f4f0fa]" />
          </button>

          <div className={isLight ? navRailLight : navRailDark}>
            <div
              className={`${logoInRailBase} ${
                isLight ? "md:border-white/[0.1]" : "md:border-white/[0.22]"
              }`}
            >
              <img
                src={DASHBOARD_LOGO_URL}
                alt="Righteous Gaming"
                className="h-9 w-auto max-w-[min(200px,46vw)] object-contain object-center md:h-10 md:max-w-[240px] md:object-left"
              />
            </div>
            <Tabs.List className={desktopTabListShared} aria-label="Dashboard sections">
              {tabs.map((tab) => {
                const subLinks =
                  tab.id === RESOURCES_TAB_ID
                    ? RESOURCE_SUB_LINKS
                    : tab.id === DATA_TAB_ID
                      ? DATA_SUB_LINKS
                      : tab.id === ADMIN_TAB_ID
                        ? ADMIN_SUB_LINKS
                        : [];
                const showDesktopSubmenu =
                  (tab.id === RESOURCES_TAB_ID && RESOURCE_SUB_LINKS.length > 1) ||
                  (tab.id === DATA_TAB_ID && DATA_SUB_LINKS.length >= 1) ||
                  (tab.id === ADMIN_TAB_ID && ADMIN_SUB_LINKS.length >= 1);
                const desktopHovered =
                  tab.id === RESOURCES_TAB_ID
                    ? resourcesHovered
                    : tab.id === DATA_TAB_ID
                      ? dataHovered
                      : tab.id === ADMIN_TAB_ID
                        ? adminHovered
                        : false;
                const triggerLabel =
                  tab.id === RESOURCES_TAB_ID
                    ? resourcesTabLabel
                    : tab.id === DATA_TAB_ID
                      ? dataTabLabel
                      : tab.id === ADMIN_TAB_ID
                        ? adminTabLabel
                        : tab.label;

                return (
                  <div
                    key={tab.id}
                    className={desktopTabSlot}
                    onMouseEnter={
                      showDesktopSubmenu && tab.id === RESOURCES_TAB_ID
                        ? () => setResourcesHovered(true)
                        : showDesktopSubmenu && tab.id === DATA_TAB_ID
                          ? () => setDataHovered(true)
                          : showDesktopSubmenu && tab.id === ADMIN_TAB_ID
                            ? () => setAdminHovered(true)
                            : undefined
                    }
                    onMouseLeave={
                      showDesktopSubmenu && tab.id === RESOURCES_TAB_ID
                        ? () => setResourcesHovered(false)
                        : showDesktopSubmenu && tab.id === DATA_TAB_ID
                          ? () => setDataHovered(false)
                          : showDesktopSubmenu && tab.id === ADMIN_TAB_ID
                            ? () => setAdminHovered(false)
                            : undefined
                    }
                  >
                    <Tabs.Trigger
                      className={`${isLight ? desktopTriggerLight : desktopTriggerDark}${
                        showDesktopSubmenu && desktopHovered
                          ? " relative z-[32] rounded-b-none md:rounded-b-none"
                          : ""
                      }`}
                      value={tab.id}
                    >
                      {triggerLabel}
                    </Tabs.Trigger>
                    {showDesktopSubmenu && desktopHovered ? (
                      <div
                        className={isLight ? resourcesMenuLight : resourcesMenuDark}
                        role="menu"
                        aria-label={
                          tab.id === RESOURCES_TAB_ID
                            ? "Resources pages"
                            : tab.id === DATA_TAB_ID
                              ? "Data pages"
                              : "Admin pages"
                        }
                      >
                        {subLinks.map((link) => {
                          const subActive =
                            tab.id === RESOURCES_TAB_ID
                              ? activeTab === RESOURCES_TAB_ID &&
                                (resourcesChild === link.segment ||
                                  (link.segment === "card-rater" &&
                                    (resourcesChild === "card-rater-play" ||
                                      (resourcesChild === "card-rater" && cardRaterPlayAtRoot))))
                              : tab.id === DATA_TAB_ID
                                ? activeTab === DATA_TAB_ID && dataChild === link.segment
                                : activeTab === ADMIN_TAB_ID && adminChild === link.segment;
                          return (
                            <button
                              key={link.segment}
                              type="button"
                              role="menuitem"
                              className={`${isLight ? resourcesMenuItemLight : resourcesMenuItemDark} ${
                                subActive
                                  ? isLight
                                    ? resourcesMenuItemActiveLight
                                    : resourcesMenuItemActiveDark
                                  : "border border-transparent"
                              }`}
                              data-state={subActive ? "active" : "inactive"}
                              onClick={() => {
                                if (tab.id === RESOURCES_TAB_ID) goResourcesSub(link.segment);
                                else if (tab.id === DATA_TAB_ID) goDataSub(link.segment);
                                else goAdminSub(link.segment);
                              }}
                            >
                              {link.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </Tabs.List>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <UserAccountMenu
              isLight={isLight}
              label={sessionProfileDisplayName(sessionProfile)}
              onSettings={openSettings}
              onSignOut={() => void signOut()}
            />
          </div>
          </header>

          <div
          id="dashboard-mobile-nav"
          className={`absolute left-0 right-0 top-full z-20 max-h-[min(75dvh,calc(100dvh-4.5rem))] overflow-y-auto overscroll-contain rounded-b-2xl border border-t-0 px-2 py-2 shadow-[0_24px_48px_rgba(0,0,0,0.45)] backdrop-blur-md transition-[opacity,transform] duration-200 ease-out md:hidden ${
            isLight
              ? "border-[rgba(80,65,110,0.28)] bg-[rgba(42,37,54,0.98)]"
              : "border-white/[0.26] bg-[rgba(16,8,28,0.97)]"
          } ${
            mobileNavOpen
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-2 opacity-0"
          }`}
          aria-hidden={!mobileNavOpen}
        >
            <nav
              className="flex flex-col gap-1 py-1"
              aria-labelledby="dashboard-menu-button"
            >
              {tabs.map((tab) => {
                const selected = activeTab === tab.id;
                const rowLabel =
                  tab.id === RESOURCES_TAB_ID
                    ? resourcesTabLabel
                    : tab.id === DATA_TAB_ID
                      ? dataTabLabel
                      : tab.id === ADMIN_TAB_ID
                        ? adminTabLabel
                        : tab.label;
                const rowClass = `${mobileNavRowMin} ${mobileNavItemSurface(selected, isLight)}`;

                let subIdleClass =
                  "ml-3 flex min-h-11 w-full items-center rounded-lg border border-transparent px-[1.125rem] py-3 text-left text-[0.9rem] font-semibold outline-none transition-colors ";
                subIdleClass += isLight
                  ? "bg-black/20 text-[#f4f0fa]/90 hover:border-[#b998e8]/35 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/60"
                  : "bg-black/20 text-[#f4f0fa]/88 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-purple-500/65";
                const subActiveClass = isLight
                  ? "border border-[rgba(152,117,207,0.75)] bg-gradient-to-b from-[#7b4cb8]/90 to-[#5a2f8f]/90 text-white shadow-[0_2px_12px_rgb(103_61_154/0.35)] focus-visible:ring-2 focus-visible:ring-[#c4a9ef]/70"
                  : "border border-[rgba(142,90,200,0.55)] bg-gradient-to-br from-[rgba(80,40,120,0.45)] to-[rgba(40,20,70,0.55)] text-white focus-visible:ring-2 focus-visible:ring-purple-500/65";

                if (tab.id === RESOURCES_TAB_ID && RESOURCE_SUB_LINKS.length > 1) {
                  return (
                    <div key={tab.id} className="flex flex-col gap-1">
                      <button
                        type="button"
                        className={rowClass}
                        aria-current={selected ? "page" : undefined}
                        aria-expanded={mobileResourcesOpen}
                        onClick={() => {
                          setMobileResourcesOpen((o) => !o);
                        }}
                      >
                        {rowLabel}
                      </button>
                      {mobileResourcesOpen ? (
                        <div
                          className={`flex flex-col gap-1 border-l pl-2 ${
                            isLight ? "border-[rgba(80,65,110,0.35)]" : "border-white/[0.22]"
                          }`}
                          role="group"
                          aria-label="Resources pages"
                        >
                          {RESOURCE_SUB_LINKS.map((link) => {
                            const subSel =
                              resourcesChild === link.segment ||
                              (link.segment === "card-rater" &&
                                (resourcesChild === "card-rater-play" ||
                                  (resourcesChild === "card-rater" && cardRaterPlayAtRoot)));
                            return (
                              <button
                                key={link.segment}
                                type="button"
                                className={
                                  subSel
                                    ? `ml-3 flex min-h-11 w-full items-center rounded-lg px-[1.125rem] py-3 text-left text-[0.9rem] font-semibold outline-none transition-colors ${subActiveClass}`
                                    : subIdleClass
                                }
                                aria-current={subSel ? "page" : undefined}
                                onClick={() => {
                                  goResourcesSub(link.segment);
                                  setMobileNavOpen(false);
                                }}
                              >
                                {link.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (tab.id === DATA_TAB_ID && DATA_SUB_LINKS.length >= 1) {
                  return (
                    <div key={tab.id} className="flex flex-col gap-1">
                      <button
                        type="button"
                        className={rowClass}
                        aria-current={selected ? "page" : undefined}
                        aria-expanded={mobileDataOpen}
                        onClick={() => {
                          setMobileDataOpen((o) => !o);
                        }}
                      >
                        {rowLabel}
                      </button>
                      {mobileDataOpen ? (
                        <div
                          className={`flex flex-col gap-1 border-l pl-2 ${
                            isLight ? "border-[rgba(80,65,110,0.35)]" : "border-white/[0.22]"
                          }`}
                          role="group"
                          aria-label="Data pages"
                        >
                          {DATA_SUB_LINKS.map((link) => {
                            const subSel = dataChild === link.segment;
                            return (
                              <button
                                key={link.segment}
                                type="button"
                                className={
                                  subSel
                                    ? `ml-3 flex min-h-11 w-full items-center rounded-lg px-[1.125rem] py-3 text-left text-[0.9rem] font-semibold outline-none transition-colors ${subActiveClass}`
                                    : subIdleClass
                                }
                                aria-current={subSel ? "page" : undefined}
                                onClick={() => {
                                  goDataSub(link.segment);
                                  setMobileNavOpen(false);
                                }}
                              >
                                {link.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (tab.id === ADMIN_TAB_ID && ADMIN_SUB_LINKS.length >= 1) {
                  return (
                    <div key={tab.id} className="flex flex-col gap-1">
                      <button
                        type="button"
                        className={rowClass}
                        aria-current={selected ? "page" : undefined}
                        aria-expanded={mobileAdminOpen}
                        onClick={() => {
                          setMobileAdminOpen((o) => !o);
                        }}
                      >
                        {rowLabel}
                      </button>
                      {mobileAdminOpen ? (
                        <div
                          className={`flex flex-col gap-1 border-l pl-2 ${
                            isLight ? "border-[rgba(80,65,110,0.35)]" : "border-white/[0.22]"
                          }`}
                          role="group"
                          aria-label="Admin pages"
                        >
                          {ADMIN_SUB_LINKS.map((link) => {
                            const subSel = adminChild === link.segment;
                            return (
                              <button
                                key={link.segment}
                                type="button"
                                className={
                                  subSel
                                    ? `ml-3 flex min-h-11 w-full items-center rounded-lg px-[1.125rem] py-3 text-left text-[0.9rem] font-semibold outline-none transition-colors ${subActiveClass}`
                                    : subIdleClass
                                }
                                aria-current={subSel ? "page" : undefined}
                                onClick={() => {
                                  goAdminSub(link.segment);
                                  setMobileNavOpen(false);
                                }}
                              >
                                {link.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={rowClass}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => {
                      handleTabNavigate(tab.id);
                      setMobileNavOpen(false);
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
        </div>
        </div>

        {tabs.map((tab) => (
          <Tabs.Content
            key={tab.id}
            value={tab.id}
            className={`relative z-0 flex min-h-[min(52vh,28rem)] flex-1 flex-col rounded-2xl border outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 ${
              tab.id === RESOURCES_TAB_ID && showCardRankerResources ? "p-0 sm:p-0" : "p-8 sm:p-10"
            } ${
              isLight
                ? "border-white/[0.12] bg-gradient-to-b from-[#434054] via-[#353145] to-[#292433] shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
                : "border-white/[0.26] bg-[rgba(16,8,28,0.65)] shadow-[0_20px_50px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.06]"
            }`}
          >
            {tab.id === ADMIN_TAB_ID ? (
              adminChild === "users" ? (
                <UsersAdminTable
                  isLight={isLight}
                  active={activeTab === ADMIN_TAB_ID && adminChild === "users"}
                  onInviteUser={
                    onNavigate
                      ? () => {
                          try {
                            sessionStorage.setItem(
                              SESSION_INVITE_RETURN_KEY,
                              window.location.pathname + window.location.search + window.location.hash,
                            );
                          } catch {
                            /* ignore */
                          }
                          onNavigate("/admin/invite-user");
                        }
                      : undefined
                  }
                />
              ) : adminChild === "announcements" ? (
                <AnnouncementsAdmin
                  isLight={isLight}
                  active={activeTab === ADMIN_TAB_ID && adminChild === "announcements"}
                  announcementForm={adminAnnouncementForm}
                  navigateAnnouncementForm={navigateAdminAnnouncementForm}
                />
              ) : adminChild === "sets" ? (
                <SetsAdmin isLight={isLight} active={activeTab === ADMIN_TAB_ID && adminChild === "sets"} />
              ) : adminChild === "card-rater" ? (
                <CardRaterAdmin
                  isLight={isLight}
                  active={activeTab === ADMIN_TAB_ID && adminChild === "card-rater"}
                  onOpenCardRaterAnalytics={openCardRaterAnalytics}
                />
              ) : adminChild === "events" ? (
                <EventsAdmin
                  isLight={isLight}
                  active={activeTab === ADMIN_TAB_ID && adminChild === "events"}
                  onOpenEvent={openEventDetail}
                />
              ) : (
                <div
                  className="flex min-h-[min(40vh,18rem)] flex-1 flex-col items-center justify-center px-4 text-center"
                  aria-label="Admin"
                >
                  <p className="text-[0.9rem] text-[#f4f0fa]/65">Choose a page from the Admin menu.</p>
                </div>
              )
            ) : tab.id === RESOURCES_TAB_ID ? (
              resourcesChild === "cards" && resourcesCardIdentifier ? (
                <CardDetailPage
                  isLight={isLight}
                  identifier={resourcesCardIdentifier}
                  active={
                    activeTab === RESOURCES_TAB_ID &&
                    resourcesChild === "cards" &&
                    Boolean(resourcesCardIdentifier)
                  }
                />
              ) : resourcesChild === "cards" ? (
                <CardsCatalog
                  isLight={isLight}
                  active={
                    activeTab === RESOURCES_TAB_ID &&
                    resourcesChild === "cards" &&
                    !resourcesCardIdentifier
                  }
                  onOpenCardDetail={openCardDetail}
                />
              ) : resourcesChild === "decks" && resourcesDeckId ? (
                <DeckDetailPage
                  isLight={isLight}
                  deckId={resourcesDeckId}
                  active={
                    activeTab === RESOURCES_TAB_ID &&
                    resourcesChild === "decks" &&
                    Boolean(resourcesDeckId)
                  }
                  onOpenCard={openCardDetail}
                  onDeckDeleted={closeDeckDetail}
                />
              ) : resourcesChild === "decks" ? (
                <DecksList
                  isLight={isLight}
                  active={activeTab === RESOURCES_TAB_ID && resourcesChild === "decks"}
                  onOpenDeck={openDeckDetail}
                />
              ) : resourcesChild === "recordings" && resourcesRecordingId ? (
                <RecordingDetailPage
                  isLight={isLight}
                  recordingId={resourcesRecordingId}
                  active={
                    activeTab === RESOURCES_TAB_ID &&
                    resourcesChild === "recordings" &&
                    Boolean(resourcesRecordingId)
                  }
                  onBack={closeRecordingDetail}
                  onRecordingDeleted={closeRecordingDetail}
                />
              ) : resourcesChild === "recordings" ? (
                <RecordingsList
                  isLight={isLight}
                  active={activeTab === RESOURCES_TAB_ID && resourcesChild === "recordings"}
                  onOpenRecording={openRecordingDetail}
                />
              ) : resourcesChild === "events" && resourcesEventId ? (
                <EventDetailPage
                  isLight={isLight}
                  eventId={resourcesEventId}
                  active={
                    activeTab === RESOURCES_TAB_ID &&
                    resourcesChild === "events" &&
                    Boolean(resourcesEventId)
                  }
                  onBack={closeEventDetail}
                />
              ) : resourcesChild === "events" ? (
                <EventsList
                  isLight={isLight}
                  active={activeTab === RESOURCES_TAB_ID && resourcesChild === "events"}
                  onOpenEvent={openEventDetail}
                />
              ) : showCardRankerResources ? (
                <CardRanker
                  isLight={isLight}
                  active={activeTab === RESOURCES_TAB_ID && showCardRankerResources}
                />
              ) : resourcesChild === "card-rater" && resourcesCardRaterId && resourcesCardRaterCompareBaselineId ? (
                <CardRaterCompare
                  isLight={isLight}
                  raterId={resourcesCardRaterId}
                  baselineRaterId={resourcesCardRaterCompareBaselineId}
                  active={
                    activeTab === RESOURCES_TAB_ID &&
                    resourcesChild === "card-rater" &&
                    Boolean(resourcesCardRaterId) &&
                    Boolean(resourcesCardRaterCompareBaselineId)
                  }
                  onBack={closeResourcesCardRaterCompare}
                />
              ) : resourcesChild === "card-rater" && resourcesCardRaterId ? (
                <CardRaterAnalytics
                  isLight={isLight}
                  raterId={resourcesCardRaterId}
                  active={
                    activeTab === RESOURCES_TAB_ID &&
                    resourcesChild === "card-rater" &&
                    Boolean(resourcesCardRaterId)
                  }
                  onOpenCompare={(baselineId) =>
                    openResourcesCardRaterCompare(resourcesCardRaterId, baselineId)
                  }
                />
              ) : resourcesChild === "card-rater" ? (
                <CardRaterRedirect
                  active={activeTab === RESOURCES_TAB_ID && resourcesChild === "card-rater"}
                  onActiveSession={openCardRaterPlayAtRoot}
                  onLatestCompletedSession={openCardRaterAnalytics}
                />
              ) : (
                <div
                  className="flex min-h-[min(40vh,18rem)] flex-1 flex-col items-center justify-center px-4 text-center"
                  aria-label="Resources"
                >
                  <p className="text-[0.9rem] text-[#f4f0fa]/65">Coming soon.</p>
                </div>
              )
            ) : tab.id === DATA_TAB_ID ? (
              dataChild === "card-ratings" && dataCardRaterId && dataCardRaterCompareBaselineId ? (
                <CardRaterCompare
                  isLight={isLight}
                  raterId={dataCardRaterId}
                  baselineRaterId={dataCardRaterCompareBaselineId}
                  active={
                    activeTab === DATA_TAB_ID &&
                    dataChild === "card-ratings" &&
                    Boolean(dataCardRaterId) &&
                    Boolean(dataCardRaterCompareBaselineId)
                  }
                  onBack={closeDataCardRaterCompare}
                />
              ) : dataChild === "card-ratings" && dataCardRaterId ? (
                <CardRaterAnalytics
                  isLight={isLight}
                  raterId={dataCardRaterId}
                  active={
                    activeTab === DATA_TAB_ID &&
                    dataChild === "card-ratings" &&
                    Boolean(dataCardRaterId)
                  }
                  onOpenCompare={(baselineId) => openDataCardRaterCompare(dataCardRaterId, baselineId)}
                />
              ) : dataChild === "card-ratings" ? (
                <CardRatingsList
                  isLight={isLight}
                  active={activeTab === DATA_TAB_ID && dataChild === "card-ratings"}
                  onViewResults={openDataCardRaterAnalytics}
                />
              ) : dataChild === "runaways-drafts" ? (
                <RunawaysDraftsAnalytics
                  isLight={isLight}
                  active={activeTab === DATA_TAB_ID && dataChild === "runaways-drafts"}
                />
              ) : (
                <div
                  className="flex min-h-[min(40vh,18rem)] flex-1 flex-col items-center justify-center px-4 text-center"
                  aria-label="Data"
                >
                  <p className="text-[0.9rem] text-[#f4f0fa]/65">Choose a page from the Data menu.</p>
                </div>
              )
            ) : tab.id === "announcements" ? (
              <AnnouncementsFeed
                isLight={isLight}
                active={activeTab === "announcements"}
              />
            ) : (
              <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
                <span className={comingSoonGlow} aria-hidden />
                <p className={comingSoonTitle}>Coming Soon!</p>
              </div>
            )}
          </Tabs.Content>
        ))}

        <Tabs.Content
          value={SETTINGS_TAB_ID}
          className={`relative z-0 flex min-h-[min(52vh,28rem)] flex-1 flex-col rounded-2xl border p-8 outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 sm:p-10 ${
            isLight
              ? "border-white/[0.12] bg-gradient-to-b from-[#434054] via-[#353145] to-[#292433] shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
              : "border-white/[0.26] bg-[rgba(16,8,28,0.65)] shadow-[0_20px_50px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.06]"
          }`}
        >
          <UserSettings
            isLight={isLight}
            active={activeTab === SETTINGS_TAB_ID}
            theme={theme}
            onThemeChange={setTheme}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
