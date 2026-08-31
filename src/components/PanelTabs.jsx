/**
 * Underline-style section tabs that bleed to the dashboard content card edges
 * (cancels the parent `p-8 sm:p-10` padding on the top/sides).
 */

export const PANEL_TABS_BLEED =
  "-mx-8 -mt-8 flex min-h-0 w-auto flex-col sm:-mx-10 sm:-mt-10";

export const PANEL_TABS_CONTENT_PAD = "px-8 py-6 sm:px-10 sm:py-8";

export const PANEL_TABS_HEADER_PAD = "px-8 pt-6 sm:px-10 sm:pt-8";

/**
 * @param {string} id
 * @param {boolean} on
 * @param {string} label
 * @param {() => void} onClick
 */
export function panelTabButton(id, on, label, onClick) {
  return (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={on}
      className={`relative min-w-[7.5rem] px-6 py-3.5 text-[1.05rem] font-semibold tracking-wide transition sm:min-w-[9.5rem] sm:px-8 sm:py-4 sm:text-[1.15rem] ${
        on
          ? "bg-black/20 text-white after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-white/70 sm:after:inset-x-4"
          : "text-[#f4f0fa]/75 hover:bg-black/10 hover:text-white"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * @param {{
 *   ariaLabel: string,
 *   children: import("react").ReactNode,
 *   endSlot?: import("react").ReactNode,
 * }} props
 */
export function PanelTabList({ ariaLabel, children, endSlot = null }) {
  return (
    <div className="flex flex-wrap items-stretch border-b border-white/[0.12] bg-black/15">
      <div className="flex min-w-0 flex-wrap px-1 sm:px-2" role="tablist" aria-label={ariaLabel}>
        {children}
      </div>
      {endSlot ? <div className="ml-auto flex items-center px-3 py-2 sm:px-4">{endSlot}</div> : null}
    </div>
  );
}
