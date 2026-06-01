import { useCallback, useState } from "react";

/** Vertical lift in px (visual only; outer hit box stays put). */
const LIFT_Y = 12;
/** Subtle scale on hover. */
const HOVER_SCALE = 1.045;
/** Shared enter/leave duration for smooth raise and lower. */
const TRANSITION_MS = 480;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * @param {boolean} isLight
 * @param {boolean} hovered
 * @returns {import("react").CSSProperties}
 */
function liftInnerStyle(isLight, hovered) {
  return {
    display: "block",
    width: "100%",
    position: "relative",
    zIndex: hovered ? 10 : 0,
    transform: hovered
      ? `translate3d(0, ${-LIFT_Y}px, 0) scale(${HOVER_SCALE})`
      : "translate3d(0, 0, 0) scale(1)",
    transition: `transform ${TRANSITION_MS}ms ${EASING}, box-shadow ${TRANSITION_MS}ms ${EASING}`,
    willChange: "transform",
    boxShadow: hovered
      ? isLight
        ? "0 14px 32px -8px rgba(0, 0, 0, 0.22)"
        : "0 18px 44px -10px rgba(0, 0, 0, 0.72)"
      : isLight
        ? "0 1px 3px rgba(0, 0, 0, 0.12)"
        : "none",
  };
}

/**
 * Wraps a card control so hover lift animates smoothly up and down.
 * The outer element keeps a stable hit area; only the inner layer moves.
 *
 * @param {{
 *   isLight: boolean,
 *   as?: "button" | "div",
 *   className?: string,
 *   innerClassName?: string,
 *   children: import("react").ReactNode,
 * } & import("react").ButtonHTMLAttributes<HTMLButtonElement> &
 *   import("react").HTMLAttributes<HTMLDivElement>} props
 */
export function CardGridLift({
  isLight,
  as = "button",
  className = "",
  innerClassName = "",
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  disabled,
  ...rest
}) {
  const [hovered, setHovered] = useState(false);

  const setHover = useCallback(
    (next) => {
      if (disabled) return;
      setHovered(next);
    },
    [disabled],
  );

  const handleMouseEnter = useCallback(
    (e) => {
      setHover(true);
      onMouseEnter?.(e);
    },
    [onMouseEnter, setHover],
  );

  const handleMouseLeave = useCallback(
    (e) => {
      setHover(false);
      onMouseLeave?.(e);
    },
    [onMouseLeave],
  );

  const handleFocus = useCallback(
    (e) => {
      setHover(true);
      onFocus?.(e);
    },
    [onFocus, setHover],
  );

  const handleBlur = useCallback(
    (e) => {
      setHover(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  const innerStyle = liftInnerStyle(isLight, hovered && !disabled);

  const outerCls = `relative z-0 block w-full p-0 ${className}`.trim();

  if (as === "div") {
    return (
      <div
        className={outerCls}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...rest}
      >
        <span className={innerClassName} style={innerStyle}>
          {children}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={outerCls}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...rest}
    >
      <span className={innerClassName} style={innerStyle}>
        {children}
      </span>
    </button>
  );
}
