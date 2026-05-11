#!/usr/bin/env node
/**
 * Calls POST /api/admin/catalog/sync-fabrary-latest-set to import missing cards
 * from fabrary's latest-set TypeScript dump into the DB set "Omens of the Stars".
 *
 * Prerequisites:
 *   - Backend running (default http://127.0.0.1:8080)
 *   - Firebase ID token for an admin user in RG_ID_TOKEN
 *
 * Environment:
 *   RG_API_BASE       — API origin (default http://127.0.0.1:8080)
 *   RG_ID_TOKEN       — Bearer ID token (required)
 *   RG_SET_NAME       — sets.name match, case-insensitive (default Omens of the Stars)
 *   RG_FAB_RELEASE    — substring filter on each card object (default Release.OmensOfTheStars)
 *   RG_FAB_URL        — override fabrary raw TS URL
 *
 * Usage:
 *   RG_ID_TOKEN="$(...)" node backend/scripts/sync-fabrary-omens-stars.mjs
 */

const base = (process.env.RG_API_BASE || "http://127.0.0.1:8080").replace(/\/+$/, "");
const token = process.env.RG_ID_TOKEN;
if (!token || String(token).trim() === "") {
  console.error("RG_ID_TOKEN is required (Firebase ID JWT for an admin user).");
  process.exit(1);
}

const params = new URLSearchParams();
if (process.env.RG_SET_NAME) params.set("set_name", process.env.RG_SET_NAME);
if (process.env.RG_FAB_RELEASE) params.set("fab_release", process.env.RG_FAB_RELEASE);
if (process.env.RG_FAB_URL) params.set("url", process.env.RG_FAB_URL);

const q = params.toString();
const url = `${base}/api/admin/catalog/sync-fabrary-latest-set${q ? `?${q}` : ""}`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  },
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}

if (!res.ok) {
  console.error(res.status, body);
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));
