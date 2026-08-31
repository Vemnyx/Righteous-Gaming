import { bodyToRichHtml, richTextBodyClassName, sanitizeRichTextHtml } from "../utils/richTextDomPurify";

/**
 * Safely render stored rich-text (or legacy plain text) HTML.
 * @param {{
 *   html: string | null | undefined,
 *   className?: string,
 *   clampLines?: number | null,
 * }} props
 */
export function RichTextHtml({ html, className = "", clampLines = null }) {
  const safe = sanitizeRichTextHtml(bodyToRichHtml(html));
  if (!safe) return null;
  const clampCls =
    clampLines != null && clampLines > 0
      ? `overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:${clampLines}]`
      : "";
  return (
    <div
      className={`${richTextBodyClassName} ${clampCls} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
