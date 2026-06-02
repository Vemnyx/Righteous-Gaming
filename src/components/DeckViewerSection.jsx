import { sectionCardCount } from "../utils/deckSections";
import { DeckViewerCard } from "./DeckViewerCard";

/** @param {{ className?: string }} props */
export function SectionIconPerson({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" />
    </svg>
  );
}

/** @param {{ className?: string }} props */
export function SectionIconDeck({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

/** @param {{ className?: string }} props */
export function SectionIconBag({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

/** @param {{ className?: string }} props */
export function SectionIconToken({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

/**
 * @param {{
 *   title: string,
 *   icon?: import("react").ReactNode,
 *   lines: import("../utils/deckSections").DeckCardLine[],
 *   isLight: boolean,
 *   stacked?: boolean,
 *   onOpenCard?: (identifier: string) => void,
 * }} props
 */
export function DeckViewerSection({ title, icon, lines, isLight, stacked = true, onOpenCard }) {
  const count = sectionCardCount(lines);
  if (lines.length === 0) return null;

  return (
    <section className={`flex flex-col ${stacked ? "gap-1" : "gap-2"}`}>
      <h3 className="m-0 flex items-center gap-2 text-[0.95rem] font-semibold tracking-tight text-[#f4f0fa]/92">
        {icon ? <span className="text-[#f4f0fa]/70">{icon}</span> : null}
        <span>
          {title} <span className="font-normal text-[#f4f0fa]/55">({count})</span>
        </span>
      </h3>
      <div
        className={`grid grid-cols-4 items-end gap-x-2 gap-y-6 overflow-visible sm:grid-cols-5 sm:gap-y-7 md:grid-cols-6 md:gap-x-2.5 lg:grid-cols-7 ${stacked ? "pt-3" : ""}`}
      >
        {lines.map((line) => (
          <div
            key={`${line.card_id}-${line.mainboard}`}
            className={`min-w-0 overflow-visible ${stacked ? "pt-[52px]" : ""}`}
          >
            <DeckViewerCard
              card={line.card}
              count={line.count}
              isLight={isLight}
              stacked={stacked}
              onOpenCard={onOpenCard}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
