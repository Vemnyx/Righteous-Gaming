import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Modal with a single text field, validation, and confirm / cancel.
 *
 * @param {{
 *   open: boolean,
 *   title: string,
 *   description?: string,
 *   placeholder?: string,
 *   initialValue?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   isLight: boolean,
 *   validate?: (value: string) => string | null,
 *   onConfirm: (trimmedValue: string) => void,
 *   onCancel: () => void,
 * }} props
 */
export function TextInputModal({
  open,
  title,
  description,
  placeholder = "",
  initialValue = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  isLight,
  validate,
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(initialValue);
  const [inlineError, setInlineError] = useState(/** @type {string | null} */ (null));
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setInlineError(null);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const handleConfirm = () => {
    const err = validate ? validate(value) : null;
    if (err) {
      setInlineError(err);
      return;
    }
    onConfirm(value.trim());
  };

  if (!open || typeof document === "undefined") return null;

  const panel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

  const btnBase =
    "rounded-lg border px-3 py-2 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnNeutral = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary = isLight
    ? "border-[rgba(152,117,207,0.85)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white hover:brightness-105"
    : "border-[rgba(142,90,200,0.8)] bg-gradient-to-br from-[rgba(80,40,120,0.75)] to-[rgba(40,20,70,0.85)] text-white hover:brightness-105";

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div className={`relative z-[1] w-full max-w-md rounded-2xl p-5 sm:p-6 ${panel}`}>
        <h2 id={titleId} className="m-0 text-lg font-semibold text-white">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="mb-0 mt-2 text-[0.85rem] leading-relaxed text-[#f4f0fa]/65">
            {description}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInlineError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleConfirm();
            }
          }}
          placeholder={placeholder}
          className="mt-4 w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2.5 text-[0.9rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/35 focus:border-purple-400/55"
          aria-invalid={inlineError ? "true" : undefined}
          aria-describedby={inlineError ? `${titleId}-err` : undefined}
        />
        {inlineError ? (
          <p id={`${titleId}-err`} className="mb-0 mt-2 text-[0.8rem] text-red-300" role="alert">
            {inlineError}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={`${btnBase} ${btnNeutral}`} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`${btnBase} ${btnPrimary}`} onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
