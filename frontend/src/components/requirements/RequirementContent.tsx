/**
 * Schreibgeschützter Renderer für Anforderungstext.
 *
 * Verwendet dieselben TipTap-Extensions wie der Editor (inkl. PlantUML-NodeView
 * und authentifizierten lokalen Bildern), aber ohne Toolbar und nicht
 * bearbeitbar. Dadurch werden Bilder und PlantUML-Diagramme identisch zum
 * Editor dargestellt — auch dort, wo bisher Roh-HTML statisch eingefügt wurde
 * (z.B. in der Matrix-Ansicht).
 */

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Markdown } from 'tiptap-markdown';
import { useEffect } from 'react';
import { htmlToMarkdown } from '../../utils/htmlToMarkdown';
import { UnderlineWithMarkdown, HighlightWithMarkdown, LocalImage } from './tiptapExtensions';
import { PlantUMLBlock } from '../../extensions/PlantUMLBlock';

interface RequirementContentProps {
  value: string;
  className?: string;
}

export default function RequirementContent({ value, className }: RequirementContentProps) {
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      UnderlineWithMarkdown,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      HighlightWithMarkdown.configure({ multicolor: false }),
      Link.configure({ openOnClick: true, HTMLAttributes: { class: 'text-primary-600 underline' } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      LocalImage.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'tiptap-image' } }),
      PlantUMLBlock,
      Markdown.configure({
        html: true,
        tightLists: true,
        bulletListMarker: '-',
        transformPastedText: false,
        transformCopiedText: false,
      }),
    ],
    // Migration: altes HTML → Markdown, identisch zum Editor
    content: htmlToMarkdown(value),
  });

  // Externe Wertänderungen in den Editor übernehmen (z.B. beim Wechsel der Zeile)
  useEffect(() => {
    if (!editor) return;
    const md = htmlToMarkdown(value);
    queueMicrotask(() => {
      if (!editor.isDestroyed) editor.commands.setContent(md, false);
    });
  }, [value, editor]);

  if (!editor) return null;

  return <EditorContent editor={editor} className={className} />;
}
