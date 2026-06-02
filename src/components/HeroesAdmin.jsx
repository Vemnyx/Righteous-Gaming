import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import {
  PORTRAIT_BANNER,
  bannerRectForCenter,
  clickToNormalizedImagePoint,
} from "../utils/heroCropPreview";

/** @typedef {{ id: number, name: string, card_identifier?: string | null, card_image_url?: string | null, art_image_url?: string | null, crop_center_x?: number | null, crop_center_y?: number | null }} HeroAdminRow */

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

/**
 * @param {HeroAdminRow | null | undefined} hero
 * @returns {{ x: number, y: number }}
 */
function defaultCropCenter(hero) {
  if (hero?.crop_center_x != null && hero?.crop_center_y != null) {
    return { x: hero.crop_center_x, y: hero.crop_center_y };
  }
  return { x: 0.5, y: PORTRAIT_BANNER.fallbackCenterY };
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function HeroesAdmin({ isLight, active }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(/** @type {HeroAdminRow[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [modalHero, setModalHero] = useState(/** @type {HeroAdminRow | null} */ (null));
  const [cropCenter, setCropCenter] = useState(/** @type {{ x: number, y: number } | null} */ (null));
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(/** @type {string | null} */ (null));
  const cardImgRef = useRef(/** @type {HTMLImageElement | null} */ (null));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/heroes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.heroes) ? data.heroes : [];
      /** @type {HeroAdminRow[]} */
      const next = [];
      for (const h of list) {
        if (!h || typeof h.id !== "number") continue;
        next.push({
          id: h.id,
          name: String(h.name ?? "").trim() || `Hero #${h.id}`,
          card_identifier: h.card_identifier != null ? String(h.card_identifier) : null,
          card_image_url: h.card_image_url != null ? String(h.card_image_url) : null,
          art_image_url: h.art_image_url != null ? String(h.art_image_url) : null,
          crop_center_x: typeof h.crop_center_x === "number" ? h.crop_center_x : null,
          crop_center_y: typeof h.crop_center_y === "number" ? h.crop_center_y : null,
        });
      }
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load heroes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, load, reloadSeq]);

  const openModal = useCallback((/** @type {HeroAdminRow} */ hero) => {
    setModalHero(hero);
    setCropCenter(defaultCropCenter(hero));
    setModalError(null);
    setSaving(false);
  }, []);

  const closeModal = useCallback(() => {
    if (saving) return;
    setModalHero(null);
    setCropCenter(null);
    setModalError(null);
  }, [saving]);

  useEffect(() => {
    if (!modalHero) return undefined;
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key === "Escape" && !saving) closeModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalHero, saving, closeModal]);

  const cropPreviewRect = useMemo(() => {
    if (!cropCenter) return null;
    return bannerRectForCenter(cropCenter.x, cropCenter.y);
  }, [cropCenter]);

  const handleCardClick = useCallback(
    (/** @type {React.MouseEvent<HTMLImageElement>} */ e) => {
      const img = cardImgRef.current;
      if (!img) return;
      const pt = clickToNormalizedImagePoint(e, img);
      if (!pt) return;
      setCropCenter(pt);
      setModalError(null);
    },
    [],
  );

  const saveRecrop = useCallback(async () => {
    if (!user || !modalHero || !cropCenter) return;
    setSaving(true);
    setModalError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/heroes/${modalHero.id}/recrop-art`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ center_x: cropCenter.x, center_y: cropCenter.y }),
      });
      const errText = await res.text();
      if (!res.ok) throw new Error(parseApiError(errText));
      const data = JSON.parse(errText);
      const updated = data?.hero;
      if (updated && typeof updated.id === "number") {
        setRows((prev) =>
          prev.map((row) =>
            row.id === updated.id
              ? {
                  ...row,
                  art_image_url:
                    updated.art_image_url != null ? String(updated.art_image_url) : row.art_image_url,
                  crop_center_x:
                    typeof updated.crop_center_x === "number" ? updated.crop_center_x : cropCenter.x,
                  crop_center_y:
                    typeof updated.crop_center_y === "number" ? updated.crop_center_y : cropCenter.y,
                }
              : row,
          ),
        );
      } else {
        setReloadSeq((n) => n + 1);
      }
      closeModal();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Failed to save crop");
    } finally {
      setSaving(false);
    }
  }, [user, modalHero, cropCenter, closeModal]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";
  const tableChromeBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";
  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div>
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Hero Images</h2>
        <p className="m-0 mt-2 max-w-2xl text-left text-[0.85rem] leading-snug text-[#f4f0fa]/70">
          Review hero portrait crops. Click a row to open the full card, then click the art where the crop
          center should be.
        </p>
      </div>

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

      <div className={`overflow-x-auto rounded-xl border bg-black/20 ${tableChromeBorder}`}>
        <table className="w-full min-w-[32rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Art</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Hero</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Crop center</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  No heroes found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b transition-colors hover:bg-white/[0.04] ${tableRowBorder} last:border-b-0`}
                  onClick={() => openModal(row)}
                >
                  <td className="px-3 py-2 sm:px-4">
                    {row.art_image_url ? (
                      <img
                        src={row.art_image_url}
                        alt=""
                        className="h-10 max-w-[10rem] rounded object-contain object-left"
                        draggable={false}
                      />
                    ) : (
                      <span className="text-[#f4f0fa]/45">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 sm:px-4">{row.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[0.75rem] text-[#f4f0fa]/60 sm:px-4">
                    {row.crop_center_x != null && row.crop_center_y != null
                      ? `${(row.crop_center_x * 100).toFixed(0)}%, ${(row.crop_center_y * 100).toFixed(0)}%`
                      : "Auto"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalHero && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !saving) closeModal();
              }}
            >
              <div
                className={`relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="hero-crop-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-white/[0.1] px-5 py-4">
                  <h3 id="hero-crop-modal-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                    {modalHero.name}
                  </h3>
                  <p className="m-0 mt-1.5 text-[0.82rem] leading-snug text-[#f4f0fa]/65">
                    Click the card art to set the crop center. The green box shows the portrait strip that
                    will be saved.
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {modalHero.card_image_url ? (
                    <div className="relative mx-auto w-fit max-w-full">
                      <img
                        ref={cardImgRef}
                        src={modalHero.card_image_url}
                        alt={modalHero.name}
                        className="block h-auto max-h-[min(60vh,28rem)] w-auto max-w-[min(100%,20rem)] cursor-crosshair"
                        draggable={false}
                        onClick={handleCardClick}
                      />
                      {cropPreviewRect && cropCenter ? (
                        <>
                          <div
                            className="pointer-events-none absolute rounded-sm border-2 border-emerald-400/90 bg-emerald-400/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
                            style={{
                              left: `${cropPreviewRect.x * 100}%`,
                              top: `${cropPreviewRect.y * 100}%`,
                              width: `${cropPreviewRect.w * 100}%`,
                              height: `${cropPreviewRect.h * 100}%`,
                            }}
                          />
                          <div
                            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
                            style={{
                              left: `${cropCenter.x * 100}%`,
                              top: `${cropCenter.y * 100}%`,
                            }}
                          />
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <p className="m-0 text-[0.875rem] text-[#f4f0fa]/65">No card image available for this hero.</p>
                  )}

                  {cropCenter ? (
                    <p className="mb-0 mt-3 text-center font-mono text-[0.75rem] text-[#f4f0fa]/55">
                      Center: {(cropCenter.x * 100).toFixed(1)}%, {(cropCenter.y * 100).toFixed(1)}%
                    </p>
                  ) : null}

                  {modalError ? (
                    <p className="mt-3 text-[0.85rem] text-red-200/95" role="alert">
                      {modalError}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.1] px-5 py-4">
                  <button type="button" className={`${btnBase} ${btnTheme}`} disabled={saving} onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={saving || !cropCenter || !modalHero.card_image_url}
                    onClick={() => void saveRecrop()}
                  >
                    {saving ? "Saving…" : "Save & re-crop"}
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
