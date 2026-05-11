import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { AnnouncementRichTextEditor } from "./AnnouncementRichTextEditor";
import { AnnouncementRightMedia } from "./AnnouncementRightMedia";
import { uploadPublicAsset, extFromFilename } from "../utils/uploadPublicAsset";
import {
  youtubeThumbnailDefault,
  youtubeVideoIdFromInput,
  youtubeWatchUrl,
} from "../utils/youtube";

/** @typedef {null | "new" | number} AnnouncementAdminForm */

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/**
 * @param {{
 *   isLight: boolean,
 *   active: boolean,
 *   announcementForm: AnnouncementAdminForm,
 *   navigateAnnouncementForm: (next: AnnouncementAdminForm, opts?: { replace?: boolean }) => void,
 * }} props
 */
export function AnnouncementsAdmin({
  isLight,
  active,
  announcementForm,
  navigateAnnouncementForm,
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  const [newDraftGen, setNewDraftGen] = useState(0);
  const draftFolder = useMemo(() => crypto.randomUUID(), [newDraftGen]);

  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState(/** @type {string | null} */ (null));
  const [youtubeUrl, setYoutubeUrl] = useState(/** @type {string | null} */ (null));
  /** When editing an existing announcement, preserves publish visibility on Save. */
  const [publishedBaseline, setPublishedBaseline] = useState(/** @type {boolean | null} */ (null));
  const [initialHtml, setInitialHtml] = useState("<p></p>");
  const [detailLoading, setDetailLoading] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [editorNonce, setEditorNonce] = useState(0);
  /** `updated_at` from the row when editing (for subtitle). */
  const [editingUpdatedAt, setEditingUpdatedAt] = useState(/** @type {string | null} */ (null));

  const editorRef = useRef(/** @type {{ getHTML: () => string } | null} */ (null));

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not signed in");
    return user.getIdToken();
  }, [user]);

  const reloadList = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    setListError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/announcements", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(Array.isArray(data.announcements) ? data.announcements : []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setListLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active || !user || announcementForm !== null) return undefined;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await reloadList();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, reloadList, announcementForm]);

  useEffect(() => {
    if (announcementForm !== "new") return;
    setNewDraftGen((g) => g + 1);
    setPublishedBaseline(null);
    setTitle("");
    setImageUrl(null);
    setYoutubeUrl(null);
    setInitialHtml("<p></p>");
    setEditingUpdatedAt(null);
    setSaveError(null);
    setDetailLoading(false);
    setEditorNonce((n) => n + 1);
  }, [announcementForm]);

  useEffect(() => {
    if (announcementForm == null || typeof announcementForm !== "number" || !user) return undefined;
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setSaveError(null);
      setPublishedBaseline(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/announcements/${announcementForm}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const row = await res.json();
        if (cancelled) return;
        setTitle(row.title ?? "");
        setImageUrl(row.image_url ?? null);
        setYoutubeUrl(row.youtube_url ?? null);
        setPublishedBaseline(row.published_at != null);
        setEditingUpdatedAt(row.updated_at ?? null);
        const html = row.body_html && row.body_html.trim() ? row.body_html : "<p></p>";
        setInitialHtml(html);
        setEditorNonce((n) => n + 1);
      } catch (e) {
        if (!cancelled) {
          setListError(e instanceof Error ? e.message : "Load failed");
          navigateAnnouncementForm(null, { replace: true });
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [announcementForm, user, navigateAnnouncementForm]);

  const cancelForm = useCallback(() => {
    navigateAnnouncementForm(null);
  }, [navigateAnnouncementForm]);

  const onCoverFile = useCallback(
    async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f?.type?.startsWith("image/")) return;
      setSaveError(null);
      try {
        const ext = extFromFilename(f.name);
        const base =
          announcementForm === "new"
            ? `announcements/drafts/${draftFolder}`
            : announcementForm != null && typeof announcementForm === "number"
              ? `announcements/${announcementForm}`
              : `announcements/drafts/${draftFolder}`;
        const path = `${base}/cover.${ext}`;
        const url = await uploadPublicAsset(getIdToken, path, f);
        setImageUrl(url);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Image upload failed");
      }
    },
    [announcementForm, draftFolder, getIdToken],
  );

  const onAddYoutube = useCallback(() => {
    const raw = window.prompt("YouTube URL (watch, youtu.be, embed, or shorts)");
    const url = raw?.trim();
    if (!url) return;
    const id = youtubeVideoIdFromInput(url);
    if (!id) {
      setSaveError("Could not read a YouTube video ID from that URL.");
      return;
    }
    setSaveError(null);
    setYoutubeUrl(youtubeWatchUrl(id));
    setImageUrl(youtubeThumbnailDefault(id));
  }, []);

  const submitAnnouncement = useCallback(
    async (/** @type {boolean | null} */ wantPublishOrNull) => {
      if (!user || announcementForm == null) return;
      const t = title.trim();
      if (!t) {
        setSaveError("Title is required.");
        return;
      }
      const bodyHtml = editorRef.current?.getHTML() ?? "";
      setSaveError(null);
      /** @type {boolean} */
      let publishedFlag;
      if (announcementForm === "new") {
        if (wantPublishOrNull == null) return;
        publishedFlag = wantPublishOrNull;
      } else if (typeof announcementForm === "number") {
        if (publishedBaseline == null || detailLoading) return;
        publishedFlag = Boolean(publishedBaseline);
      } else {
        return;
      }
      try {
        const token = await user.getIdToken();
        const payload = {
          title: t,
          image_url: imageUrl,
          youtube_url: youtubeUrl,
          body_html: bodyHtml,
          published: publishedFlag,
        };
        if (announcementForm === "new") {
          const res = await fetch("/api/admin/announcements", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(await res.text());
          await reloadList();
          navigateAnnouncementForm(null, { replace: true });
        } else if (typeof announcementForm === "number") {
          const res = await fetch(`/api/admin/announcements/${announcementForm}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(await res.text());
          await reloadList();
          navigateAnnouncementForm(null, { replace: true });
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Save failed");
      }
    },
    [
      announcementForm,
      detailLoading,
      imageUrl,
      navigateAnnouncementForm,
      publishedBaseline,
      reloadList,
      title,
      user,
      youtubeUrl,
    ],
  );

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";

  const tableChromeBorder = isLight ? "border-white/[0.12]" : "border-white/[0.24] ring-1 ring-white/[0.05]";

  if (announcementForm !== null) {
    const isNew = announcementForm === "new";
    const editorKey =
      isNew ? `new-${draftFolder}-${editorNonce}` : `edit-${announcementForm}-${editorNonce}`;
    const editingIdForImages = isNew ? null : announcementForm;

    return (
      <div className="flex min-h-0 w-full flex-col gap-5 text-left">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" className={`${btnBase} ${btnTheme}`} onClick={cancelForm}>
            ← Back
          </button>
          <h2 className="m-0 min-w-0 flex-1 text-lg font-semibold text-white">
            {isNew ? "New announcement" : "Edit announcement"}
          </h2>
          {!isNew && !detailLoading ? (
            <p className="m-0 max-w-full shrink-0 text-right text-[0.72rem] text-[#f4f0fa]/50 sm:text-[0.8rem]">
              Last updated {formatDateTime(editingUpdatedAt)} · {publishedBaseline ? "Published" : "Draft"}
            </p>
          ) : null}
        </div>

        {detailLoading && !isNew ? (
          <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
              <div className="min-w-0 flex-1 space-y-4 lg:max-w-[min(100%,42rem)]">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                    Title
                  </span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/35 focus:border-purple-400/55"
                    placeholder="Announcement title"
                  />
                </label>
                {isNew ? (
                  <p className="m-0 text-[0.8rem] text-[#f4f0fa]/45">
                    Publish date is set when you publish.
                  </p>
                ) : null}
                <AnnouncementRichTextEditor
                  key={editorKey}
                  ref={editorRef}
                  initialHtml={initialHtml}
                  draftFolder={draftFolder}
                  editingId={editingIdForImages}
                  getIdToken={getIdToken}
                  isLight={isLight}
                />
              </div>

              <div className="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-2 lg:w-[min(100%,24rem)] xl:w-[26rem]">
                <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                  Hero media
                </span>
                <div className="flex min-h-[14rem] w-full flex-col justify-stretch">
                  {youtubeUrl && youtubeVideoIdFromInput(youtubeUrl) ? (
                    <div className="flex flex-col gap-2">
                      <AnnouncementRightMedia youtubeUrl={youtubeUrl} imageUrl={null} className="min-h-0" />
                      <button
                        type="button"
                        className={`${btnBase} ${btnTheme} py-1 text-[0.75rem]`}
                        onClick={() => setYoutubeUrl(null)}
                      >
                        Remove YouTube
                      </button>
                    </div>
                  ) : imageUrl ? (
                    <div className="flex flex-col gap-2">
                      <AnnouncementRightMedia youtubeUrl={null} imageUrl={imageUrl} className="min-h-0" />
                      <button
                        type="button"
                        className={`${btnBase} ${btnTheme} py-1 text-[0.75rem]`}
                        onClick={() => setImageUrl(null)}
                      >
                        Remove image
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-h-[14rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.2] bg-black/25 px-4 py-8 text-center">
                      <label
                        className={`cursor-pointer rounded-lg border px-4 py-2.5 text-[0.85rem] font-semibold ${btnTheme}`}
                      >
                        Upload image
                        <input type="file" accept="image/*" className="sr-only" onChange={onCoverFile} />
                      </label>
                      <button type="button" className={`${btnBase} ${btnTheme}`} onClick={onAddYoutube}>
                        Add YouTube link
                      </button>
                      <p className="m-0 max-w-[16rem] text-[0.75rem] text-[#f4f0fa]/45">
                        A YouTube link saves the video thumbnail as the list preview image.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {saveError ? (
              <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">
                {saveError}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {isNew ? (
                <>
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    onClick={() => submitAnnouncement(false)}
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    className={`${btnBase} border-[rgba(152,117,207,0.85)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white hover:border-[rgba(180,140,228,0.95)] hover:brightness-105`}
                    onClick={() => submitAnnouncement(true)}
                  >
                    Publish
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`${btnBase} ${btnTheme}`}
                  onClick={() => submitAnnouncement(null)}
                  disabled={detailLoading || publishedBaseline === null}
                >
                  Save
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-col gap-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold text-white">Announcements</h2>
        <button type="button" className={`${btnBase} ${btnTheme}`} onClick={() => navigateAnnouncementForm("new")}>
          New announcement
        </button>
      </div>
      <p className="m-0 text-[0.85rem] text-[#f4f0fa]/55">
        Drafts stay hidden from the Announcements tab until you use Publish.
      </p>

      {listError ? (
        <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">
          {listError}
        </p>
      ) : null}

      {listLoading ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/60">No announcements yet.</p>
      ) : (
        <div className={`overflow-x-auto rounded-xl border ${tableChromeBorder}`}>
          <table className="w-full min-w-[520px] border-collapse text-left text-[0.8125rem]">
            <thead>
              <tr className={isLight ? "border-b border-white/[0.12]" : "border-b border-white/[0.2]"}>
                <th className="px-3 py-2.5 font-semibold text-[#f4f0fa]/80">Title</th>
                <th className="px-3 py-2.5 font-semibold text-[#f4f0fa]/80">Status</th>
                <th className="px-3 py-2.5 font-semibold text-[#f4f0fa]/80">Updated</th>
                <th className="px-3 py-2.5 font-semibold text-[#f4f0fa]/80">Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={isLight ? "border-b border-white/[0.08]" : "border-b border-white/[0.12]"}
                >
                  <td className="px-3 py-2.5 font-medium text-[#f4f0fa]">{r.title}</td>
                  <td className="px-3 py-2.5 text-[#f4f0fa]/75">
                    {r.published_at ? "Published" : "Draft"}
                  </td>
                  <td className="px-3 py-2.5 text-[#f4f0fa]/65">{formatDateTime(r.updated_at)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      className={`${btnBase} ${btnTheme} py-1 text-[0.75rem]`}
                      onClick={() => navigateAnnouncementForm(r.id)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
