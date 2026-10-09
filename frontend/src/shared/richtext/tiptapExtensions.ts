/**
 * Geteilte TipTap-Extensions für Editor und Read-only-Renderer.
 *
 * Diese Extensions tragen die Custom-Rendering-Logik (PlantUML-NodeView,
 * authentifizierte lokale Bilder) und den Markdown-Serializer. Sie werden
 * sowohl vom bearbeitbaren `MarkdownEditor` als auch vom schreibgeschützten
 * `RequirementContent` verwendet, damit Inhalte überall identisch dargestellt
 * werden.
 */

import { ReactNodeViewRenderer } from '@tiptap/react';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import LocalImageView from './LocalImageView';

// ─── Underline + Highlight mit Markdown-Serializer ───────────────────────────
// Kein Standard-Markdown-Äquivalent → als Raw-HTML in Markdown speichern.

export const UnderlineWithMarkdown = Underline.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: '<u>', close: '</u>', mixable: true, expelEnclosingWhitespace: true },
        parse: {},
      },
    };
  },
});

export const HighlightWithMarkdown = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: '<mark>', close: '</mark>', mixable: true, expelEnclosingWhitespace: true },
        parse: {},
      },
    };
  },
});

// ─── LocalImage: Image-Extension mit Pfad+Hash-Attributen + React-NodeView ──

export const LocalImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-local-path': {
        default: null,
        parseHTML: (el) => el.getAttribute('data-local-path'),
        renderHTML: (attrs) =>
          attrs['data-local-path'] ? { 'data-local-path': attrs['data-local-path'] } : {},
      },
      'data-hash': {
        default: null,
        parseHTML: (el) => el.getAttribute('data-hash'),
        renderHTML: (attrs) =>
          attrs['data-hash'] ? { 'data-hash': attrs['data-hash'] } : {},
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        // Lokale Bilder → vollständiger <img>-Tag (Attribute bleiben erhalten)
        // Normale Bilder → Standard-Markdown-Syntax ![alt](url)
        serialize(state: { write: (s: string) => void; closeBlock: (n: unknown) => void }, node: { attrs: Record<string, string | null> }) {
          const { src, alt } = node.attrs;
          const localPath = node.attrs['data-local-path'];
          const hash = node.attrs['data-hash'];
          const esc = (s: string | null) => (s ?? '').replace(/"/g, '&quot;');

          if (localPath && hash) {
            state.write(
              `<img src="${esc(src)}" alt="${esc(alt)}" data-local-path="${esc(localPath)}" data-hash="${esc(hash)}" />`
            );
          } else {
            const escapedSrc = (src ?? '').replace(/[()]/g, (c) => '\\' + c);
            state.write(`![${alt ?? ''}](${escapedSrc})`);
          }
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(LocalImageView);
  },
});
