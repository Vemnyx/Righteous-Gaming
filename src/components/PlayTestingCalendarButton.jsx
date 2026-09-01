import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  downloadSessionCalendar,
  googleCalendarUrl,
  openAppleCalendar,
  primarySessionCalendarWindow,
} from "../utils/playTestingCalendar";

/**
 * Add-to-calendar control (Apple / Outlook / Other / Google), matching thejkhouse PartyCalendarButton.
 *
 * @param {{
 *   session: any,
 *   className?: string,
 *   btnBase?: string,
 *   btnTheme?: string,
 * }} props
 */
export function PlayTestingCalendarButton({
  session,
  className = "",
  btnBase = "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
  btnTheme = "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30",
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(/** @type {Record<string, string | number>} */ ({}));
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const triggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  const canAdd = primarySessionCalendarWindow(session) != null;
  const googleUrl = canAdd ? googleCalendarUrl(session) : null;

  useLayoutEffect(() => {
    if (!open) return undefined;

    const placeMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 8;
      setMenuStyle({
        top: rect.bottom + gap,
        right: window.innerWidth - rect.right,
        minWidth: Math.max(rect.width, 232),
      });
    };

    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const close = (event) => {
      const target = /** @type {Node} */ (event.target);
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * @param {() => void} action
   */
  const closeAnd = (action) => {
    action();
    setOpen(false);
  };

  const optionClass =
    "block w-full border-0 border-b border-white/10 bg-transparent px-3.5 py-3 text-left text-[0.9rem] font-semibold text-[#f4f0fa]/88 no-underline transition-colors last:border-b-0 hover:bg-white/[0.06] hover:text-[#f4f0fa] focus-visible:bg-white/[0.06] focus-visible:outline-none";

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[240] grid min-w-[14.5rem] overflow-hidden rounded-xl border border-white/20 bg-[#160d22] shadow-2xl"
            role="menu"
            aria-label="Calendar options"
            ref={menuRef}
            style={menuStyle}
          >
            <button
              className={optionClass}
              type="button"
              role="menuitem"
              onClick={() => closeAnd(() => openAppleCalendar(session))}
            >
              Apple Calendar
            </button>
            <button
              className={optionClass}
              type="button"
              role="menuitem"
              onClick={() => closeAnd(() => downloadSessionCalendar(session))}
            >
              Outlook
            </button>
            <button
              className={optionClass}
              type="button"
              role="menuitem"
              onClick={() => closeAnd(() => downloadSessionCalendar(session))}
            >
              Other
            </button>
            {googleUrl ? (
              <a
                className={optionClass}
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Google Calendar
              </a>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`relative ${open ? "z-20" : "z-[8]"} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`${btnBase} ${btnTheme}`}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={!canAdd}
        ref={triggerRef}
        onClick={() => setOpen((current) => !current)}
      >
        Add to Calendar
      </button>
      {menu}
    </div>
  );
}
