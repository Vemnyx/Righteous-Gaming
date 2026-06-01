import { cardImageUrl } from "../utils/cardPrintings";

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

/**
 * @param {DeckViewerCardProps & { stacked?: boolean, onOpenCard?: (identifier: string) => void }} props
 */
export function DeckViewerCard({ card, count, stacked = true, onOpenCard }) {
  const imgUrl = cardImageUrl(card);
  const copies = count > 0 ? count : 1;
  const visibleStack = stacked ? Math.min(copies, 3) : 1;
  const stackOffsetPx = 12;
  const extraPad = stacked && visibleStack > 1 ? (visibleStack - 1) * stackOffsetPx : 0;
  const identifier = card.card_identifier != null ? String(card.card_identifier).trim() : "";

  const inner = imgUrl ? (
    <img src={imgUrl} alt={card.name || "Card"} className="h-full w-full object-contain" draggable={false} />
  ) : (
    <span className="px-1 text-center text-[0.62rem] leading-tight text-[#f4f0fa]/45">{card.name}</span>
  );

  const cardShell =
    "flex aspect-[63/88] w-full items-center justify-center overflow-hidden rounded-md bg-black/30";

  const body = (
    <div className="relative w-full" style={{ paddingBottom: extraPad }}>
      {Array.from({ length: visibleStack }, (_, i) => (
        <div
          key={i}
          className={`absolute left-0 w-full ${cardShell}`}
          style={{ top: i * stackOffsetPx, zIndex: visibleStack - i }}
        >
          {inner}
        </div>
      ))}
      <div className={`relative ${cardShell}`} style={{ visibility: "hidden" }} aria-hidden>
        {inner}
      </div>
    </div>
  );

  if (identifier && typeof onOpenCard === "function") {
    return (
      <button
        type="button"
        className="block w-full cursor-pointer rounded-md p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55"
        aria-label={`${card.name}${copies > 1 ? `, ${copies} copies` : ""}`}
        onClick={() => onOpenCard(identifier)}
      >
        {body}
      </button>
    );
  }

  return <div className="w-full">{body}</div>;
}
