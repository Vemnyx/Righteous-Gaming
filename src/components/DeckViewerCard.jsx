import { useState } from "react";
import { cardImageUrl } from "../utils/cardPrintings";
import { cardGridLiftClass } from "../utils/cardGridLift";
import { CardImageLightbox } from "./CardImageLightbox";

/**
 * @typedef {{
 *   card: {
 *     id: number,
 *     name: string,
 *     card_identifier?: string | null,
 *     image_url?: string | null,
 *     printings?: { image_url?: string | null }[],
 *   },
 *   count: number,
 * }} DeckViewerCardProps
 */

const cardShell =
  "flex aspect-[63/88] w-full items-center justify-center overflow-hidden rounded-md bg-black/30";

/**
 * @param {DeckViewerCardProps & {
 *   isLight: boolean,
 *   stacked?: boolean,
 *   onOpenCard?: (identifier: string) => void,
 * }} props
 */
export function DeckViewerCard({ card, count, isLight, stacked = true, onOpenCard }) {
  const imgUrl = cardImageUrl(card);
  const copies = count > 0 ? count : 1;
  const visibleStack = stacked ? Math.min(copies, 3) : 1;
  const stackOffsetPx = 10;
  const extraPadTop = stacked && visibleStack > 1 ? (visibleStack - 1) * stackOffsetPx : 0;
  const identifier = card.card_identifier != null ? String(card.card_identifier).trim() : "";
  const lift = cardGridLiftClass(isLight);

  const [lightbox, setLightbox] = useState(
    /** @type {{ url: string, name: string, card_identifier?: string | null } | null} */ (null),
  );

  const inner = imgUrl ? (
    <img src={imgUrl} alt={card.name || "Card"} className="h-full w-full object-contain" draggable={false} />
  ) : (
    <span className="px-1 text-center text-[0.62rem] leading-tight text-[#f4f0fa]/45">{card.name}</span>
  );

  const backLayers =
    stacked && visibleStack > 1
      ? Array.from({ length: visibleStack - 1 }, (_, i) => {
          const depth = visibleStack - 1 - i;
          return (
            <div
              key={`back-${depth}`}
              className={`pointer-events-none absolute left-0 w-full ${cardShell}`}
              style={{
                top: -depth * stackOffsetPx,
                zIndex: depth,
                transform: `scale(${1 - depth * 0.02})`,
                transformOrigin: "center bottom",
                opacity: 0.92 - depth * 0.06,
              }}
              aria-hidden
            >
              {inner}
            </div>
          );
        })
      : null;

  const frontLayer = (
    <div
      className={`relative w-full ${cardShell}`}
      style={{ zIndex: visibleStack > 1 ? visibleStack : 1 }}
    >
      {inner}
    </div>
  );

  const stackBody = (
    <div className="relative w-full" style={{ paddingTop: extraPadTop }}>
      {backLayers}
      {frontLayer}
      <div className={`relative ${cardShell}`} style={{ visibility: "hidden" }} aria-hidden>
        {inner}
      </div>
    </div>
  );

  const openLightbox = () => {
    if (!imgUrl) return;
    setLightbox({
      url: imgUrl,
      name: card.name ?? "",
      card_identifier: identifier || null,
    });
  };

  const interactive =
    imgUrl || identifier ? (
      <button
        type="button"
        className={`block w-full cursor-pointer rounded-md p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55 ${lift}`}
        aria-label={`${card.name}${copies > 1 ? `, ${copies} copies` : ""}`}
        onClick={openLightbox}
        disabled={!imgUrl}
      >
        {stackBody}
      </button>
    ) : (
      <div className="w-full">{stackBody}</div>
    );

  return (
    <>
      {interactive}
      <CardImageLightbox
        image={lightbox}
        onClose={() => setLightbox(null)}
        onOpenCardDetail={onOpenCard}
      />
    </>
  );
}
