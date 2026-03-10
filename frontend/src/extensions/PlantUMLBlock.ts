/**
 * TipTap-Extension für PlantUML-Diagramm-Blöcke.
 *
 * Speicherformat in Markdown:
 *   ```plantuml
 *   @startuml
 *   Alice -> Bob: Hallo
 *   @enduml
 *   ```
 *
 * Round-Trip:
 *   Parsen:       markdown-it Core-Rule wandelt plantuml-Fences in
 *                 <pre data-plantuml="..."> HTML-Blöcke um.
 *                 TipTap nimmt diese via parseHTML auf.
 *   Serialisieren: serialize() schreibt wieder ```plantuml ... ```.
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import PlantUMLView from '../components/requirements/PlantUMLView';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const PlantUMLBlock = Node.create({
  name: 'plantUMLBlock',
  group: 'block',
  atom: true,      // Block ist unteilbar – kein TipTap-Cursor innerhalb
  draggable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (el: Element) =>
          decodeURIComponent(el.getAttribute('data-plantuml') ?? ''),
        renderHTML: (attrs: Record<string, string>) => ({
          'data-plantuml': encodeURIComponent(attrs['source'] ?? ''),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'pre[data-plantuml]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return ['pre', HTMLAttributes, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PlantUMLView as any);
  },

  addStorage() {
    return {
      markdown: {
        // Serialisierung: Node → ```plantuml\n{source}\n```
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: { source?: string } },
        ) {
          const src = (node.attrs.source ?? '').trim();
          state.write('```plantuml\n');
          if (src) state.write(src + '\n');
          state.write('```');
          state.closeBlock(node);
        },

        // Parser: markdown-it Core-Rule für ```plantuml-Blöcke
        parse: {
          setup(markdownit: any) {
            markdownit.core.ruler.push('plantuml_fence', (state: any) => {
              for (let i = 0; i < state.tokens.length; i++) {
                const token = state.tokens[i];
                if (
                  token.type === 'fence' &&
                  token.info.trim().toLowerCase() === 'plantuml'
                ) {
                  // Token-Objekt direkt mutieren: fence → html_block
                  // TipTap parst den <pre data-plantuml="...">-Tag via parseHTML()
                  const encoded = encodeURIComponent(token.content.trim());
                  token.type = 'html_block';
                  token.content = `<pre data-plantuml="${encoded}"></pre>\n`;
                }
              }
            });
          },
        },
      },
    };
  },
});
