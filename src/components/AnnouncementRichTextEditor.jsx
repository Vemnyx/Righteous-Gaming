import { forwardRef, useCallback } from "react";
import { RichTextEditor } from "./RichTextEditor";

/**
 * Announcement-scoped rich text editor (upload paths under announcements/).
 * @typedef {{
 *   initialHtml: string,
 *   draftFolder: string,
 *   editingId: number | null,
 *   getIdToken: () => Promise<string>,
 *   isLight: boolean,
 * }} AnnouncementRichTextEditorProps
 */
export const AnnouncementRichTextEditor = forwardRef(function AnnouncementRichTextEditor(
  { initialHtml, draftFolder, editingId, getIdToken, isLight },
  ref,
) {
  const buildUploadPath = useCallback(
    (/** @type {File} */ _file, /** @type {string} */ ext) => {
      const folder =
        editingId != null ? `announcements/${editingId}` : `announcements/drafts/${draftFolder}`;
      return `${folder}/inline-${Date.now()}.${ext}`;
    },
    [editingId, draftFolder],
  );

  return (
    <RichTextEditor
      ref={ref}
      initialHtml={initialHtml}
      getIdToken={getIdToken}
      isLight={isLight}
      placeholder="Write the announcement… Drag images here, paste, or use Image."
      buildUploadPath={buildUploadPath}
    />
  );
});

AnnouncementRichTextEditor.displayName = "AnnouncementRichTextEditor";
