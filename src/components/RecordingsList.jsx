import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { CARD_FORMAT_NAMES } from "../constants/cardFormat";
import { extFromFilename, MAX_UPLOAD_SIZE_LABEL, uploadPublicAsset, uploadSizeError } from "../utils/uploadPublicAsset";

/** @typedef {{ id: number, user_id: number, url: string, label?: string | null, first_hero_id?: number | null, second_hero_id?: number | null, format: number, created_at: string, owner_username?: string | null, owner_email?: string, first_hero_name?: string | null, first_hero_art_image_url?: string | null, second_hero_name?: string | null, second_hero_art_image_url?: string | null }} RecordingRow */

/** @typedef {{ id: number, name: string, art_image_url?: string | null }} HeroOption */

/** @typedef {{ id: number, email: string, username?: string | null }} UploaderOption */

const FILTER_ALL = "";
const PAGE_SIZE = 10;
const MEDIA_EMBED = "embed";
const MEDIA_UPLOAD = "upload";

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
    if (j && typeof j.url === "string" && j.url.trim() !== "") return j.url.trim();
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
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/** @param {{ owner_username?: string | null, owner_email?: string }} row */
function uploaderLabel(row) {
  const username = row.owner_username != null ? String(row.owner_username).trim() : "";
  if (username) return username;
  const email = row.owner_email != null ? String(row.owner_email).trim() : "";
  return email || "—";
}

/** @param {{ id: number, username?: string | null, email?: string }} row */
function uploaderFilterLabel(row) {
  const username = row.username != null ? String(row.username).trim() : "";
  if (username) return username;
  return String(row.email ?? "").trim() || `User #${row.id}`;
}

/**
 * @param {{ pageIndex: number, pageSize: number, total: number, onPageChange: (nextIndex: number) => void, disabled?: boolean }} props
 */
function RecordingsPagination({ pageIndex, pageSize, total, onPageChange, disabled }) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const safeIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const start = total === 0 ? 0 : safeIndex * pageSize + 1;
  const end = Math.min(total, (safeIndex + 1) * pageSize);

  if (total <= pageSize) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
      <p className="m-0 text-[0.8rem] text-[#f4f0fa]/60">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || safeIndex <= 0}
          className="rounded-lg border border-white/[0.18] bg-black/30 px-3 py-1.5 text-[0.78rem] font-semibold text-[#f4f0fa]/90 disabled:cursor-not-allowed disabled:opacity-45 hover:bg-white/[0.06]"
          onClick={() => onPageChange(safeIndex - 1)}
        >
          Previous
        </button>
        <span className="text-[0.78rem] tabular-nums text-[#f4f0fa]/70">
          Page {safeIndex + 1} of {totalPages}
        </span>
        <button
          type="button"
          disabled={disabled || safeIndex >= totalPages - 1}
          className="rounded-lg border border-white/[0.18] bg-black/30 px-3 py-1.5 text-[0.78rem] font-semibold text-[#f4f0fa]/90 disabled:cursor-not-allowed disabled:opacity-45 hover:bg-white/[0.06]"
          onClick={() => onPageChange(safeIndex + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * @param {{ src?: string | null, name?: string | null, className?: string }} props
 */
function HeroThumb({ src, name, className = "" }) {
  const label = name != null && String(name).trim() !== "" ? String(name).trim() : "Hero";
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={`h-16 w-12 shrink-0 rounded-md border border-white/[0.12] object-cover object-top sm:h-[4.5rem] sm:w-14 ${className}`.trim()}
        draggable={false}
      />
    );
  }
  return (
    <div
      className={`flex h-16 w-12 shrink-0 items-center justify-center rounded-md border border-white/[0.12] bg-purple-900/25 text-[0.65rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55 sm:h-[4.5rem] sm:w-14 ${className}`.trim()}
      aria-hidden
    >
      ?
    </div>
  );
}

/**
 * @param {{ isLight: boolean, active: boolean, onOpenRecording?: (recordingId: number) => void }} props
 */
export function RecordingsList({ isLight, active, onOpenRecording }) {
  const { user, sessionProfile } = useAuth();
  const myUserId = typeof sessionProfile?.id === "number" ? sessionProfile.id : null;

  const [rows, setRows] = useState(/** @type {RecordingRow[]} */ ([]));
  const [total, setTotal] = useState(0);
  const [heroes, setHeroes] = useState(/** @type {HeroOption[]} */ ([]));
  const [uploaders, setUploaders] = useState(/** @type {UploaderOption[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [filterFormat, setFilterFormat] = useState(FILTER_ALL);
  const [filterHero, setFilterHero] = useState(FILTER_ALL);
  const [filterUploader, setFilterUploader] = useState(FILTER_ALL);
  const [pageIndex, setPageIndex] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addFormat, setAddFormat] = useState("0");
  const [addHero1, setAddHero1] = useState("");
  const [addHero2, setAddHero2] = useState("");
  const [addMediaMode, setAddMediaMode] = useState(MEDIA_EMBED);
  const [addEmbedUrl, setAddEmbedUrl] = useState("");
  const [addVideoFile, setAddVideoFile] = useState(/** @type {File | null} */ (null));
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState(/** @type {string | null} */ (null));

  const loadMeta = useCallback(async () => {
    if (!user) return;
    setMetaLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/recordings/meta", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const heroList = Array.isArray(data.heroes) ? data.heroes : [];
      const uploaderList = Array.isArray(data.uploaders) ? data.uploaders : [];
      setHeroes(
        heroList
          .filter((h) => h && typeof h.id === "number")
          .map((h) => ({
            id: h.id,
            name: String(h.name ?? "").trim() || `Hero ${h.id}`,
            art_image_url:
              h.art_image_url != null && String(h.art_image_url).trim() !== ""
                ? String(h.art_image_url).trim()
                : null,
          })),
      );
      setUploaders(
        uploaderList
          .filter((u) => u && typeof u.id === "number")
          .map((u) => ({
            id: u.id,
            email: typeof u.email === "string" ? u.email : "",
            username:
              u.username != null && String(u.username).trim() !== "" ? String(u.username).trim() : null,
          })),
      );
    } catch {
      setHeroes([]);
      setUploaders([]);
    } finally {
      setMetaLoading(false);
    }
  }, [user]);

  const load = useCallback(async () => {
    if (!user || !active) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      params.set("page", String(pageIndex));
      if (filterFormat !== FILTER_ALL) params.set("format", filterFormat);
      if (filterUploader !== FILTER_ALL) params.set("user_id", filterUploader);
      if (filterHero !== FILTER_ALL) params.set("hero_id", filterHero);

      const res = await fetch(`/api/recordings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.recordings) ? data.recordings : [];
      /** @type {RecordingRow[]} */
      const next = [];
      for (const r of list) {
        if (!r || typeof r.id !== "number" || typeof r.url !== "string") continue;
        next.push({
          id: r.id,
          user_id: typeof r.user_id === "number" ? r.user_id : 0,
          url: String(r.url).trim(),
          label:
            r.label != null && String(r.label).trim() !== "" ? String(r.label).trim() : null,
          first_hero_id: typeof r.first_hero_id === "number" ? r.first_hero_id : null,
          second_hero_id: typeof r.second_hero_id === "number" ? r.second_hero_id : null,
          format: typeof r.format === "number" ? r.format : 0,
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
      }
      setRows(next);
      setTotal(typeof data.total === "number" && data.total >= 0 ? data.total : next.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recordings");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [user, active, pageIndex, filterFormat, filterHero, filterUploader]);

  useEffect(() => {
    if (active) void loadMeta();
  }, [active, loadMeta, reloadSeq]);

  useEffect(() => {
    if (active) void load();
  }, [active, load, reloadSeq]);

  useEffect(() => {
    setPageIndex(0);
  }, [filterFormat, filterHero, filterUploader]);

  const formatFilterOptions = useMemo(() => {
    const opts = [{ value: FILTER_ALL, label: "All formats" }];
    CARD_FORMAT_NAMES.forEach((name, id) => {
      opts.push({ value: String(id), label: name });
    });
    return opts;
  }, []);

  const heroFilterOptions = useMemo(() => {
    const opts = [{ value: FILTER_ALL, label: "All heroes" }];
    for (const h of heroes) {
      opts.push({ value: String(h.id), label: h.name });
    }
    return opts;
  }, [heroes]);

  const uploaderFilterOptions = useMemo(() => {
    const opts = [{ value: FILTER_ALL, label: "All uploaders" }];
    for (const u of uploaders) {
      opts.push({ value: String(u.id), label: uploaderFilterLabel(u) });
    }
    return opts;
  }, [uploaders]);

  const closeAddModal = useCallback(() => {
    if (addSubmitting) return;
    setAddOpen(false);
    setAddError(null);
    setAddLabel("");
    setAddFormat("0");
    setAddHero1("");
    setAddHero2("");
    setAddMediaMode(MEDIA_EMBED);
    setAddEmbedUrl("");
    setAddVideoFile(null);
  }, [addSubmitting]);

  const openAddModal = useCallback(() => {
    setAddError(null);
    setAddOpen(true);
  }, []);

  const submitAdd = useCallback(async () => {
    if (!user) return;
    const hero1 = parseInt(addHero1, 10);
    const hero2 = parseInt(addHero2, 10);
    const format = parseInt(addFormat, 10);
    if (!Number.isFinite(hero1) || hero1 <= 0) {
      setAddError("Select hero 1.");
      return;
    }
    if (!Number.isFinite(hero2) || hero2 <= 0) {
      setAddError("Select hero 2.");
      return;
    }
    if (!Number.isFinite(format) || format < 0 || format >= CARD_FORMAT_NAMES.length) {
      setAddError("Select a format.");
      return;
    }

    setAddSubmitting(true);
    setAddError(null);
    try {
      let url = "";
      if (addMediaMode === MEDIA_UPLOAD) {
        if (!addVideoFile) {
          setAddError("Choose a video file to upload.");
          setAddSubmitting(false);
          return;
        }
        const fileSizeErr = uploadSizeError(addVideoFile.size);
        if (fileSizeErr) {
          setAddError(fileSizeErr);
          setAddSubmitting(false);
          return;
        }
        if (!myUserId) throw new Error("Could not resolve your user id.");
        const ext = extFromFilename(addVideoFile.name);
        const objectPath = `recordings/${myUserId}/${crypto.randomUUID()}.${ext}`;
        url = await uploadPublicAsset(() => user.getIdToken(), objectPath, addVideoFile, {
          cacheBust: false,
        });
      } else {
        url = addEmbedUrl.trim();
        if (url === "") {
          setAddError("Enter an embed link.");
          setAddSubmitting(false);
          return;
        }
      }

      const labelTrim = addLabel.trim();
      const token = await user.getIdToken();
      const res = await fetch("/api/recordings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          label: labelTrim !== "" ? labelTrim : null,
          first_hero_id: hero1,
          second_hero_id: hero2,
          format,
        }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      closeAddModal();
      setPageIndex(0);
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add recording");
    } finally {
      setAddSubmitting(false);
    }
  }, [
    user,
    myUserId,
    addHero1,
    addHero2,
    addFormat,
    addLabel,
    addMediaMode,
    addEmbedUrl,
    addVideoFile,
    closeAddModal,
  ]);

  useEffect(() => {
    if (!addOpen) return undefined;
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key === "Escape" && !addSubmitting) closeAddModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addOpen, addSubmitting, closeAddModal]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";
  const cardChromeBorder = isLight
    ? "border-white/[0.12] bg-black/25"
    : "border-white/[0.20] bg-black/20 ring-1 ring-white/[0.05]";
  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";
  const inputCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/35 focus:border-purple-400/55";
  const selectCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55";

  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / PAGE_SIZE));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);

  return (
    <div className="flex w-full flex-1 flex-col gap-2 px-1 py-1 sm:px-2">
      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button type="button" className={`mt-3 ${btnBase} ${btnTheme}`} onClick={() => setReloadSeq((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-[14rem]">
            <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Format</span>
            <select
              className={selectCls}
              value={filterFormat}
              disabled={loading || metaLoading}
              onChange={(e) => setFilterFormat(e.target.value)}
            >
              {formatFilterOptions.map((opt) => (
                <option key={opt.value || "all-formats"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-[14rem]">
            <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Uploader</span>
            <select
              className={selectCls}
              value={filterUploader}
              disabled={loading || metaLoading || uploaderFilterOptions.length <= 1}
              onChange={(e) => setFilterUploader(e.target.value)}
            >
              {uploaderFilterOptions.map((opt) => (
                <option key={opt.value || "all-uploaders"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-[14rem]">
            <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Hero</span>
            <select
              className={selectCls}
              value={filterHero}
              disabled={loading || metaLoading || heroFilterOptions.length <= 1}
              onChange={(e) => setFilterHero(e.target.value)}
            >
              {heroFilterOptions.map((opt) => (
                <option key={opt.value || "all-heroes"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className={`shrink-0 self-end ${btnPrimary}`}
          disabled={!user || loading || metaLoading}
          onClick={openAddModal}
        >
          Add Recording
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <div
            className={`rounded-xl border px-4 py-10 text-center text-[0.875rem] text-[#f4f0fa]/65 ${cardChromeBorder}`}
          >
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div
            className={`rounded-xl border px-4 py-10 text-center text-[0.875rem] text-[#f4f0fa]/65 ${cardChromeBorder}`}
          >
            {total === 0 && filterFormat === FILTER_ALL && filterHero === FILTER_ALL && filterUploader === FILTER_ALL
              ? "No recordings yet. Add one to get started."
              : "No recordings match the selected filters."}
          </div>
        ) : (
          rows.map((row) => {
            const openRecording =
              typeof onOpenRecording === "function" ? () => onOpenRecording(row.id) : undefined;
            const title = row.label ?? `Recording #${row.id}`;
            const formatName = CARD_FORMAT_NAMES[row.format] ?? `Format ${row.format}`;

            return (
              <button
                key={row.id}
                type="button"
                disabled={!openRecording}
                onClick={openRecording}
                className={`group flex w-full cursor-pointer items-stretch gap-3 overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow,filter] hover:border-purple-400/45 hover:shadow-[0_6px_28px_rgba(90,47,143,0.22)] hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55 disabled:cursor-default sm:gap-4 ${cardChromeBorder}`}
                aria-label={`Open recording: ${title}`}
              >
                <div className="flex shrink-0 items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
                  <HeroThumb src={row.first_hero_art_image_url} name={row.first_hero_name} />
                  <span className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[#f4f0fa]/50 sm:text-[0.78rem]">
                    Vs
                  </span>
                  <HeroThumb src={row.second_hero_art_image_url} name={row.second_hero_name} />
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 border-l border-white/[0.08] py-3 pr-4">
                  <p className="m-0 truncate text-[0.95rem] font-semibold leading-snug text-[#f4f0fa] group-hover:text-purple-100">
                    {title}
                  </p>
                  <p className="m-0 truncate text-[0.8125rem] text-[#f4f0fa]/72">{formatName}</p>
                  <p className="m-0 truncate text-[0.8125rem] text-[#f4f0fa]/72">
                    Uploaded {formatDateTime(row.created_at)}
                  </p>
                  <p className="m-0 truncate text-[0.75rem] text-[#f4f0fa]/55">{uploaderLabel(row)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {!loading && total > 0 ? (
        <RecordingsPagination
          pageIndex={safePageIndex}
          pageSize={PAGE_SIZE}
          total={total}
          disabled={loading}
          onPageChange={setPageIndex}
        />
      ) : null}

      {addOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !addSubmitting) closeAddModal();
              }}
            >
              <div
                className={`relative max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl p-5 sm:p-6 ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="recordings-add-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="recordings-add-modal-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  Add Recording
                </h3>
                <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/70">
                  Add a match recording with both heroes, format, and either an embed link or uploaded video.
                </p>

                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Label</span>
                  <input
                    type="text"
                    className={inputCls}
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    placeholder="Optional title"
                    disabled={addSubmitting}
                    autoComplete="off"
                  />
                </label>

                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Format</span>
                  <select
                    className={selectCls}
                    value={addFormat}
                    disabled={addSubmitting}
                    onChange={(e) => setAddFormat(e.target.value)}
                  >
                    {CARD_FORMAT_NAMES.map((name, id) => (
                      <option key={name} value={String(id)}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Hero 1
                    </span>
                    <select
                      className={selectCls}
                      value={addHero1}
                      disabled={addSubmitting || heroes.length === 0}
                      onChange={(e) => setAddHero1(e.target.value)}
                    >
                      <option value="">Select hero…</option>
                      {heroes.map((h) => (
                        <option key={h.id} value={String(h.id)}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Hero 2
                    </span>
                    <select
                      className={selectCls}
                      value={addHero2}
                      disabled={addSubmitting || heroes.length === 0}
                      onChange={(e) => setAddHero2(e.target.value)}
                    >
                      <option value="">Select hero…</option>
                      {heroes.map((h) => (
                        <option key={h.id} value={String(h.id)}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <fieldset className="mt-4 border-0 p-0">
                  <legend className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                    Video source
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`${btnBase} ${addMediaMode === MEDIA_EMBED ? btnPrimary : btnTheme}`}
                      disabled={addSubmitting}
                      onClick={() => setAddMediaMode(MEDIA_EMBED)}
                    >
                      Embed link
                    </button>
                    <button
                      type="button"
                      className={`${btnBase} ${addMediaMode === MEDIA_UPLOAD ? btnPrimary : btnTheme}`}
                      disabled={addSubmitting}
                      onClick={() => setAddMediaMode(MEDIA_UPLOAD)}
                    >
                      Upload file
                    </button>
                  </div>
                </fieldset>

                {addMediaMode === MEDIA_EMBED ? (
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Embed link
                    </span>
                    <input
                      type="url"
                      className={inputCls}
                      value={addEmbedUrl}
                      onChange={(e) => setAddEmbedUrl(e.target.value)}
                      placeholder="YouTube or embed URL"
                      disabled={addSubmitting}
                      autoComplete="off"
                    />
                  </label>
                ) : (
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                      Video file
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-purple-700/80 file:px-3 file:py-1.5 file:text-[0.78rem] file:font-semibold file:text-white`}
                      disabled={addSubmitting}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setAddVideoFile(file);
                        setAddError(file ? uploadSizeError(file.size) : null);
                      }}
                    />
                    <span className="text-[0.75rem] text-[#f4f0fa]/50">
                      Max upload size is {MAX_UPLOAD_SIZE_LABEL}.
                    </span>
                  </label>
                )}

                {addError ? (
                  <p className="mt-3 text-[0.85rem] text-red-200/95" role="alert">
                    {addError}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button type="button" className={`${btnBase} ${btnTheme}`} disabled={addSubmitting} onClick={closeAddModal}>
                    Cancel
                  </button>
                  <button type="button" className={btnPrimary} disabled={addSubmitting || !user} onClick={() => void submitAdd()}>
                    {addSubmitting ? "Saving…" : "Save recording"}
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
