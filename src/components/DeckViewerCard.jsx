import { useState } from "react";
import { cardImageUrl } from "../utils/cardPrintings";
import { CardImageLightbox } from "./CardImageLightbox";
import { CardGridLift } from "./CardGridLift";

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

/** Vertical peek per duplicate — exposes the title bar on cards beneath the front copy. */
const STACK_PEEK_PX = 26;
const MAX_VISIBLE_STACK = 3;

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
  const visibleStack = stacked ? Math.min(copies, MAX_VISIBLE_STACK) : 1;
  const identifier = card.card_identifier != null ? String(card.card_identifier).trim() : "";

  const [lightbox, setLightbox] = useState(
    /** @type {{ url: string, name: string, card_identifier?: string | null } | null} */ (null),
  );

  const openLightbox = () => {
    if (!imgUrl) return;
    setLightbox({
      url: imgUrl,
      name: card.name ?? "",
      card_identifier: identifier || null,
    });
  };

  /** @param {number} layerIndex 0 = backmost, visibleStack-1 = front */
  const layerDepthFromFront = (layerIndex) => visibleStack - 1 - layerIndex;

  const layers = Array.from({ length: visibleStack }, (_, layerIndex) => {
    const layerKey = `layer-${layerIndex}`;
    const depthFromFront = layerDepthFromFront(layerIndex);
    const copyNum = copies - depthFromFront;
    const cardFace = imgUrl ? (
      <img src={imgUrl} alt="" className="h-full w-full object-contain" draggable={false} />
    ) : (
      <span className="px-1 text-center text-[0.62rem] leading-tight text-[#f4f0fa]/45">{card.name}</span>
    );

    const layerLabel =
      copies > 1
        ? `${card.name || "Card"}, copy ${copyNum} of ${copies}`
        : `${card.name || "Card"}`;

    return (
      <div
        key={layerKey}
        className="absolute inset-x-0 bottom-0"
        style={{
          zIndex: layerIndex + 1,
          transform: `translate3d(0, ${-depthFromFront * STACK_PEEK_PX}px, 0)`,
        }}
      >
        {imgUrl || identifier ? (
          <CardGridLift
            isLight={isLight}
            elevateZIndexOnHover={false}
            className="cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55"
            aria-label={layerLabel}
            disabled={!imgUrl}
            onClick={openLightbox}
          >
            <span className={cardShell}>{cardFace}</span>
          </CardGridLift>
        ) : (
          <div className={cardShell}>{cardFace}</div>
        )}
      </div>
    );
  });

  return (
    <>
      <div className="relative w-full aspect-[63/88] overflow-visible">{layers}</div>
      <CardImageLightbox
        image={lightbox}
        onClose={() => setLightbox(null)}
        onOpenCardDetail={onOpenCard}
      />
    </>
  );
}
