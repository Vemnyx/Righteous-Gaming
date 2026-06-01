/**
 * Hover/focus lift styles shared by catalog grid and deck viewer cards.
 *
 * @param {boolean} isLight
 * @returns {string}
 */
export function cardGridLiftClass(isLight) {
  const base =
    "relative z-0 transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ";
  if (isLight) {
    return (
      base +
      "shadow-sm shadow-black/15 hover:z-10 hover:scale-[1.055] hover:-translate-y-1.5 hover:shadow-[0_14px_32px_-8px_rgba(0,0,0,0.22)] focus-visible:z-10 focus-visible:scale-[1.055] focus-visible:-translate-y-1.5 focus-visible:shadow-[0_14px_32px_-8px_rgba(0,0,0,0.22)]"
    );
  }
  return (
    base +
    "shadow-none hover:z-10 hover:scale-[1.055] hover:-translate-y-1.5 hover:shadow-[0_18px_44px_-10px_rgba(0,0,0,0.72)] focus-visible:z-10 focus-visible:scale-[1.055] focus-visible:-translate-y-1.5 focus-visible:shadow-[0_18px_44px_-10px_rgba(0,0,0,0.72)]"
  );
}
