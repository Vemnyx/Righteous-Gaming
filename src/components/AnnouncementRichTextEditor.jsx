import { forwardRef, useCallback, useImperativeHandle } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { uploadPublicAsset, extFromFilename } from "../utils/uploadPublicAsset";

/**
 * @typedef {{
 *   initialHtml: string,
 *   draftFolder: string,
 *   editingId: number | null,
 *   getIdToken: () => Promise<string>,
 *   isLight: boolean,
 * }} AnnouncementRichTextEditorProps
 */

const btn =
  "rounded-md border px-2 py-1 text-[0.75rem] font-semibold transition-colors disabled:opacity-40";

function toolbarSurface(isLight) {
  return isLight
    ? "border-white/[0.18] bg-black/25 text-[#f4f0fa]"
    : "border-white/[0.22] bg-black/30 text-[#f4f0fa]";
}

export const AnnouncementRichTextEditor = forwardRef(function AnnouncementRichTextEditor(
  { initialHtml, draftFolder, editingId, getIdToken, isLight },
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-violet-300 underline underline-offset-2" },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full rounded-md block",
        },
        resize: {
          enabled: true,
          minWidth: 64,
          minHeight: 48,
          alwaysPreserveAspectRatio: true,
          directions: [
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ],
        },
      }),
      Placeholder.configure({
        placeholder: "Write the announcement… Drag images here or paste from clipboard.",
      }),
    ],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[14rem] px-3 py-2 text-[0.9rem] leading-relaxed text-[#f4f0fa]",
      },
    },
  });

  const insertImageFile = useCallback(
    async (file) => {
      if (!editor || !file?.type?.startsWith("image/")) return;
      const ext = extFromFilename(file.name);
      const folder =
        editingId != null ? `announcements/${editingId}` : `announcements/drafts/${draftFolder}`;
      const path = `${folder}/inline-${Date.now()}.${ext}`;
      try {
        const url = await uploadPublicAsset(getIdToken, path, file);
        editor.chain().focus().setImage({ src: url, alt: "" }).run();
      } catch (err) {
        console.error("Inline image upload failed", err);
      }
    },
    [editor, editingId, draftFolder, getIdToken],
  );

  useImperativeHandle(
    ref,
    () => ({
      getHTML: () => editor?.getHTML() ?? "",
      insertImageFile,
    }),
    [editor, insertImageFile],
  );

  const onPasteContainer = useCallback(
    (e) => {
      const files = e.clipboardData?.files;
      if (files?.length && files[0]?.type?.startsWith("image/")) {
        e.preventDefault();
        void insertImageFile(files[0]);
      }
    },
    [insertImageFile],
  );

  const onDropContainer = useCallback(
    (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file?.type?.startsWith("image/")) {
        e.preventDefault();
        void insertImageFile(file);
      }
    },
    [insertImageFile],
  );

  const ts = toolbarSurface(isLight);

  if (!editor) {
    return (
      <div className="rounded-lg border border-white/15 bg-black/20 px-3 py-8 text-center text-[0.85rem] text-[#f4f0fa]/60">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex flex-wrap gap-1 rounded-lg border p-1.5 ${ts}`}
        role="toolbar"
        aria-label="Formatting"
      >
        <button
          type="button"
          className={`${btn} ${ts}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-pressed={editor.isActive("bold")}
        >
          Bold
        </button>
        <button
          type="button"
          className={`${btn} ${ts}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-pressed={editor.isActive("italic")}
        >
          Italic
        </button>
        <button
          type="button"
          className={`${btn} ${ts}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-pressed={editor.isActive("underline")}
        >
          Underline
        </button>
        <button
          type="button"
          className={`${btn} ${ts}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-pressed={editor.isActive("heading", { level: 2 })}
        >
          H2
        </button>
        <button
          type="button"
          className={`${btn} ${ts}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-pressed={editor.isActive("bulletList")}
        >
          List
        </button>
        <button
          type="button"
          className={`${btn} ${ts}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-pressed={editor.isActive("orderedList")}
        >
          1.
        </button>
        <button
          type="button"
          className={`${btn} ${ts}`}
          onClick={() => {
            const prev = window.prompt("Link URL (https://…)");
            const url = prev?.trim();
            if (!url) return;
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
        >
          Link
        </button>
      </div>
      <div
        className={`rounded-lg border border-white/[0.18] bg-black/25 [&_.ProseMirror_img]:max-h-[min(560px,75vh)] [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:object-contain [&_[data-resize-handle]]:z-10 [&_[data-resize-handle]]:m-[-6px] [&_[data-resize-handle]]:size-[14px] [&_[data-resize-handle]]:rounded-sm [&_[data-resize-handle]]:border-2 [&_[data-resize-handle]]:border-[rgba(180,140,228,0.95)] [&_[data-resize-handle]]:bg-[rgba(22,12,38,0.92)] [&_[data-resize-handle]]:shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${isLight ? "ring-1 ring-white/[0.06]" : ""}`}
        onPaste={onPasteContainer}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropContainer}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

AnnouncementRichTextEditor.displayName = "AnnouncementRichTextEditor";
