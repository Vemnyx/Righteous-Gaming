/**
 * Clickable player name for event coverage views.
 * @param {{
 *   name: string,
 *   onPlayerClick?: (name: string) => void,
 *   className?: string,
 *   align?: "left" | "right",
 * }} props
 */
export function PlayerNameButton({ name, onPlayerClick, className = "", align = "left" }) {
  const label = String(name ?? "").trim();
  if (!label) return null;

  const alignCls = align === "right" ? "text-right" : "text-left";

  if (!onPlayerClick) {
    return <span className={`${alignCls} ${className}`}>{label}</span>;
  }

  return (
    <button
      type="button"
      title={`View ${label}'s event history`}
      className={`m-0 max-w-full cursor-pointer truncate border-0 bg-transparent p-0 font-inherit underline-offset-2 transition hover:text-purple-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55 ${alignCls} ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onPlayerClick(label);
      }}
    >
      {label}
    </button>
  );
}
