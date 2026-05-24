import { useCallback, useEffect, useRef, useState } from "react";

const HOVER_CLOSE_DELAY_MS = 220;

/**
 * @param {{ isLight: boolean, label: string, onSettings: () => void, onSignOut: () => void }} props
 */
export function UserAccountMenu({ isLight, label, onSettings, onSignOut }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const closeTimerRef = useRef(/** @type {number | null} */ (null));

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!open) return undefined;
    /** @param {MouseEvent} e */
    function onDocPointerDown(e) {
      if (!(e.target instanceof Node)) return;
      if (rootRef.current?.contains(e.target)) return;
      clearCloseTimer();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open, clearCloseTimer]);

  const triggerCls = isLight
    ? "min-h-11 w-full cursor-pointer rounded-lg border border-white/15 bg-[#5f5b6c] px-4 py-2.5 text-[0.875rem] font-semibold text-white hover:brightness-110 sm:min-h-12"
    : "min-h-11 w-full cursor-pointer rounded-lg border border-white/[0.22] bg-black/35 px-4 py-2.5 text-[0.875rem] font-semibold text-white hover:border-[rgba(232,197,71,0.45)] sm:min-h-12";

  const menuPanelCls = isLight
    ? "min-w-[10.5rem] overflow-hidden rounded-lg border border-white/15 bg-[#5f5b6c] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
    : "min-w-[10.5rem] overflow-hidden rounded-lg border border-white/[0.22] bg-[rgba(16,8,28,0.98)] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]";

  const itemCls = isLight
    ? "block w-full px-4 py-2.5 text-left text-[0.875rem] font-semibold text-white transition-colors hover:bg-white/10"
    : "block w-full px-4 py-2.5 text-left text-[0.875rem] font-semibold text-white transition-colors hover:bg-white/[0.08] hover:text-[rgba(232,197,71,0.95)]";

  const goSettings = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
    onSettings();
  }, [onSettings, clearCloseTimer]);

  const goSignOut = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
    onSignOut();
  }, [onSignOut, clearCloseTimer]);

  const handleMouseEnter = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const handleMouseLeave = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={triggerCls}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          clearCloseTimer();
          setOpen((v) => !v);
        }}
      >
        {label}
      </button>
      <div
        className={`absolute right-0 top-full z-50 min-w-full pt-3 transition-opacity duration-150 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div role="menu" className={menuPanelCls}>
          <button type="button" role="menuitem" className={itemCls} onClick={goSettings}>
            Settings
          </button>
          <button type="button" role="menuitem" className={itemCls} onClick={goSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
