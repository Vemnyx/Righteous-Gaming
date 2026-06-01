import { useEffect } from "react";
import { createPortal } from "react-dom";

/** @param {{ className?: string }} props */
function EyeViewDetailsIcon({ className = "size-5 shrink-0" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * @typedef {{ url: string, name: string, card_identifier?: string | null }} CardImageLightboxImage
 */

/**
 * Full-screen card image modal (catalog grid + deck viewer).
 *
 * @param {{
 *   image: CardImageLightboxImage | null,
 *   onClose: () => void,
 *   onOpenCardDetail?: (identifier: string) => void,
 * }} props
 */
export function CardImageLightbox({ image, onClose, onOpenCardDetail }) {
  useEffect(() => {
    if (!image) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [image, onClose]);

  if (!image || typeof document === "undefined") return null;

  const identifier =
    image.card_identifier != null ? String(image.card_identifier).trim() : "";

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex cursor-default items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={image.name ? `Card: ${image.name}` : "Card image"}
      onClick={onClose}
    >
      <div className="flex h-[85vh] w-full max-w-[min(100%,96vw)] flex-col items-center justify-center gap-4">
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <img
            src={image.url}
            alt={image.name || "Card"}
            className="max-h-full max-w-full object-contain select-none"
            draggable={false}
          />
        </div>
        {identifier && typeof onOpenCardDetail === "function" ? (
          <div className="flex shrink-0 justify-center" onClick={(e) => e.stopPropagation()}>
            <a
              href={`/resources/cards/${encodeURIComponent(identifier)}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.28] bg-black/40 px-4 py-2.5 text-[0.875rem] font-medium text-[#c4a9ef] shadow-lg transition-colors hover:border-[#c4a9ef]/45 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55"
              aria-label="Open the card details page"
              title="Go to the full card details page"
              onClick={(e) => {
                e.preventDefault();
                onClose();
                onOpenCardDetail(identifier);
              }}
            >
              <EyeViewDetailsIcon />
              View Card Details
            </a>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
