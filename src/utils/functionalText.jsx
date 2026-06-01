/** @typedef {{ type: "text", value: string } | { type: "strong", value: string } | { type: "icon", tag: string }} FunctionalTextPart */

/** Merge-tag icon URLs from Fabrary (functional text shorthand). */
export const FAB_FUNCTIONAL_ICON_URLS = Object.freeze({
  p: "https://content.fabrary.net/icons/power.webp",
  r: "https://content.fabrary.net/icons/resource.webp",
  d: "https://content.fabrary.net/icons/defense.webp",
  t: "https://content.fabrary.net/icons/tap.webp",
  h: "https://content.fabrary.net/icons/health.webp",
  u: "https://content.fabrary.net/icons/untap.webp",
});

const FAB_ICON_TAG_PATTERN = Object.keys(FAB_FUNCTIONAL_ICON_URLS).join("");
const FUNCTIONAL_TEXT_TOKEN_RE = new RegExp(
  `\\*\\*([^*]+)\\*\\*|\\{([${FAB_ICON_TAG_PATTERN}])\\}`,
  "g",
);

/**
 * @param {string} text
 * @returns {FunctionalTextPart[]}
 */
export function parseFunctionalText(text) {
  /** @type {FunctionalTextPart[]} */
  const parts = [];
  let lastIndex = 0;
  for (const match of text.matchAll(FUNCTIONAL_TEXT_TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, idx) });
    }
    if (match[1] != null) {
      parts.push({ type: "strong", value: match[1] });
    } else if (match[2] != null) {
      parts.push({ type: "icon", tag: match[2] });
    }
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}

const defaultIconClass =
  "mx-0.5 inline-block h-[1.05em] w-[1.05em] align-[-0.12em] object-contain";

/**
 * Renders card functional text with Fabrary icon tags and **bold** segments.
 * @param {{ text: string, className?: string, iconClassName?: string }} props
 */
export function FunctionalText({ text, className, iconClassName = defaultIconClass }) {
  const parts = parseFunctionalText(text);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={i}>{part.value}</span>;
        }
        if (part.type === "strong") {
          return <strong key={i}>{part.value}</strong>;
        }
        const url = FAB_FUNCTIONAL_ICON_URLS[/** @type {keyof typeof FAB_FUNCTIONAL_ICON_URLS} */ (part.tag)];
        if (!url) {
          return <span key={i}>{`{${part.tag}}`}</span>;
        }
        return (
          <img
            key={i}
            src={url}
            alt=""
            className={iconClassName}
            draggable={false}
            loading="lazy"
          />
        );
      })}
    </span>
  );
}
