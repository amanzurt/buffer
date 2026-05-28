"use client";

import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useEffect } from "react";

const CHAR_LIMIT = 2200;

const HashtagHighlight = Extension.create({
  name: "hashtagHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("hashtagHighlight"),
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];
            const regex = /(#\w+|@\w+)/g;
            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              let match: RegExpExecArray | null;
              regex.lastIndex = 0;
              while ((match = regex.exec(node.text)) !== null) {
                const start = pos + match.index;
                const end = start + match[0].length;
                decorations.push(
                  Decoration.inline(start, end, {
                    class: match[0].startsWith("#")
                      ? "text-indigo-600 font-medium"
                      : "text-sky-600 font-medium",
                  })
                );
              }
            });
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});

interface Props {
  value: string;
  onChange: (val: string) => void;
  onHashtagsChange?: (tags: string[]) => void;
  disabled?: boolean;
}

export function CaptionEditor({ value, onChange, onHashtagsChange, disabled }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      CharacterCount.configure({ limit: CHAR_LIMIT }),
      Placeholder.configure({ placeholder: "Escribe un caption…" }),
      HashtagHighlight,
    ],
    content: value,
    editable: !disabled,
    onUpdate({ editor }) {
      const text = editor.getText();
      onChange(text);
      if (onHashtagsChange) {
        const tags = [...new Set((text.match(/#\w+/g) ?? []).map((t) => t.toLowerCase()))];
        onHashtagsChange(tags);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText();
    if (current !== value) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  const charCount = editor?.storage.characterCount.characters() ?? 0;
  const isNearLimit = charCount > 2000;

  return (
    <div className="rounded-xl border border-gray-200 bg-white focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
      <EditorContent
        editor={editor}
        className="min-h-[120px] px-3 py-2 text-sm text-gray-800 [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0"
      />
      <div className="flex items-center justify-end border-t border-gray-100 px-3 py-1.5">
        <span className={`text-xs tabular-nums ${isNearLimit ? "text-red-500 font-medium" : "text-gray-400"}`}>
          {charCount} / {CHAR_LIMIT}
        </span>
      </div>
    </div>
  );
}
