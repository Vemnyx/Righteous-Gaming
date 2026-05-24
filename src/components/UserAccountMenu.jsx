import { useCallback, useEffect, useRef, useState } from "react";

/**
 * @param {{ isLight: boolean, label: string, onSettings: () => void, onSignOut: () => void }} props
 */
export function UserAccountMenu({ isLight, label, onSettings, onSignOut }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    if (!open) return undefined;
    /** @param {MouseEvent} e */
    function onDocPointerDown(e) {
      if (!(e.target instanceof Node)) return;
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  const triggerCls = isLight
    ? "min-h-11 cursor-pointer rounded-lg border border-white/15 bg-[#5f5b6c] px-4 py-2.5 text-[0.875rem] font-semibold text-white hover:brightness-110 sm:min-h-12"
    : "min-h-11 cursor-pointer rounded-lg border border-white/[0.22] bg-black/35 px-4 py-2.5 text-[0.875rem] font-semibold text-white hover:border-[rgba(232,197,71,0.45)] sm:min-h-12";

  const menuCls = isLight
    ? "absolute right-0 top-full z-50 mt-1 min-w-[10.5rem] overflow-hidden rounded-lg border border-white/15 bg-[#5f5b6c] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
    : "absolute right-0 top-full z-50 mt-1 min-w-[10.5rem] overflow-hidden rounded-lg border border-white/[0.22] bg-[rgba(16,8,28,0.98)] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]";

  const itemCls = isLight
    ? "block w-full px-4 py-2.5 text-left text-[0.875rem] font-semibold text-white transition-colors hover:bg-white/10"
    : "block w-full px-4 py-2.5 text-left text-[0.875rem] font-semibold text-white transition-colors hover:bg-white/[0.08] hover:text-[rgba(232,197,71,0.95)]";

  const goSettings = useCallback(() => {
    setOpen(false);
    onSettings();
  }, [onSettings]);

  const goSignOut = useCallback(() => {
    setOpen(false);
    onSignOut();
  }, [onSignOut]);

  return (
    <div ref={rootRef} className="relative group">
      <button
        type="button"
        className={triggerCls}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      <div
        role="menu"
        className={`${menuCls} ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        } transition-opacity duration-150`}
      >
        <button type="button" role="menuitem" className={itemCls} onClick={goSettings}>
          Settings
        </button>
        <button type="button" role="menuitem" className={itemCls} onClick={goSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
