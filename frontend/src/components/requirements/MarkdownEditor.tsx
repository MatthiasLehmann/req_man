import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Underline as UnderlineIcon,
  Heading1, Heading2, Heading3, Quote, Minus, Highlighter,
  Link as LinkIcon, Table as TableIcon, Undo2, Redo2, ImageIcon, X,
  FolderOpen, Loader2, AlertCircle,
  Columns2, Trash2, Rows2
} from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uploadImage } from '../../api/client';

// ─── ToolbarButton ─────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'p-1.5 rounded transition-colors text-sm',
        active
          ? 'bg-primary-100 text-primary-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}

// ─── ImageDialog ────────────────────────────────────────────────────────────

type ImageTab = 'file' | 'url';

interface ImageDialogProps {
  onInsert: (url: string, alt: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

function ImageDialog({ onInsert, onClose, anchorRef }: ImageDialogProps) {
  const [tab, setTab] = useState<ImageTab>('file');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Position relative to the anchor button
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      // Flip left if dialog would go off the right edge
      const dialogWidth = 384; // w-96
      const left = rect.left + dialogWidth > window.innerWidth
        ? Math.max(4, rect.right - dialogWidth)
        : rect.left;
      setPos({ top: rect.bottom + 4, left });
    }
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = anchorRef.current;
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        !(anchor && anchor.contains(e.target as Node))
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploadError('');
    setUploading(true);
    setUrl('');

    try {
      const res = await uploadImage(file);
      setUrl(res.data.url);
      if (!alt) setAlt(file.name.replace(/\.[^.]+$/, ''));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Upload fehlgeschlagen';
      setUploadError(msg);
      setPreview('');
    } finally {
      setUploading(false);
    }
  };

  const handleInsert = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onInsert(trimmed, alt.trim());
    onClose();
  };

  const canInsert = url.trim().length > 0 && !uploading;

  const inputClass =
    'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';

  return createPortal(
    <div
      ref={containerRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-96"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4 text-primary-500" />
          Bild einfügen
        </span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setTab('file')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition-colors',
            tab === 'file' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Datei wählen
        </button>
        <button
          type="button"
          onClick={() => setTab('url')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition-colors',
            tab === 'url' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          URL eingeben
        </button>
      </div>

      <div className="space-y-3">
        {/* ── Tab: File ── */}
        {tab === 'file' && (
          <>
            {/* Drop zone / picker */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'border-2 border-dashed rounded-xl cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 min-h-[100px]',
                preview
                  ? 'border-primary-300 bg-primary-50 p-2'
                  : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50 p-6'
              )}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                  <span className="text-xs text-gray-500">Wird hochgeladen…</span>
                </>
              ) : preview ? (
                <img
                  src={preview}
                  alt="Vorschau"
                  className="max-h-40 max-w-full rounded-lg object-contain"
                />
              ) : (
                <>
                  <FolderOpen className="w-7 h-7 text-gray-400" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-600">Datei auswählen</p>
                    <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, GIF, WebP, SVG · max. 10 MB</p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Upload error */}
            {uploadError && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Uploaded URL feedback */}
            {url && !uploading && (
              <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2 truncate">
                ✓ {url}
              </div>
            )}
          </>
        )}

        {/* ── Tab: URL ── */}
        {tab === 'url' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Bild-URL <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setPreview(e.target.value); }}
              onKeyDown={(e) => e.key === 'Enter' && handleInsert()}
              placeholder="https://example.com/bild.png"
              className={inputClass}
            />
            {/* Inline preview for URL */}
            {preview && tab === 'url' && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center min-h-[80px]">
                <img
                  src={preview}
                  alt="Vorschau"
                  className="max-h-40 max-w-full object-contain"
                  onError={() => setPreview('')}
                />
              </div>
            )}
          </div>
        )}

        {/* Alt text (shared) */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Alternativtext <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInsert()}
            placeholder="Beschreibung des Bildes"
            className={inputClass}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleInsert}
            disabled={!canInsert}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Einfügen
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── MarkdownEditor ─────────────────────────────────────────────────────────

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Anforderungstext eingeben...',
  readOnly = false,
  minHeight = '300px',
}: MarkdownEditorProps) {
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const imageButtonRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary-600 underline' } }),
      CharacterCount,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'tiptap-image',
        },
      }),
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const url = prompt('URL eingeben:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const insertImage = (url: string, alt: string) => {
    editor.chain().focus().setImage({ src: url, alt }).run();
  };

  return (
    <div className={clsx('tiptap-editor border border-gray-300 rounded-lg overflow-hidden', readOnly && 'opacity-75')}>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 p-2 bg-gray-50 border-b border-gray-200">
          {/* History */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Rückgängig (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Wiederholen (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="Überschrift 1"
          >
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Überschrift 2"
          >
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="Überschrift 3"
          >
            <Heading3 className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          {/* Formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Fett (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Kursiv (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title="Unterstrichen (Ctrl+U)"
          >
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="Durchgestrichen"
          >
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')}
            title="Hervorheben"
          >
            <Highlighter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            title="Code"
          >
            <Code className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          {/* Alignment */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
            title="Links"
          >
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
            title="Zentriert"
          >
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
            title="Rechts"
          >
            <AlignRight className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Aufzählungsliste"
          >
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Nummerierte Liste"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title="Zitat"
          >
            <Quote className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Trennlinie"
          >
            <Minus className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          {/* Link, Image & Table */}
          <ToolbarButton
            onClick={setLink}
            active={editor.isActive('link')}
            title="Link einfügen"
          >
            <LinkIcon className="w-4 h-4" />
          </ToolbarButton>

          {/* Image button with portal dialog */}
          <div ref={imageButtonRef}>
            <ToolbarButton
              onClick={() => setImageDialogOpen((prev) => !prev)}
              active={imageDialogOpen || editor.isActive('image')}
              title="Bild einfügen"
            >
              <ImageIcon className="w-4 h-4" />
            </ToolbarButton>
          </div>
          {imageDialogOpen && (
            <ImageDialog
              anchorRef={imageButtonRef}
              onInsert={insertImage}
              onClose={() => setImageDialogOpen(false)}
            />
          )}

          <ToolbarButton
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            title="Tabelle einfügen"
          >
            <TableIcon className="w-4 h-4" />
          </ToolbarButton>

          {/* Table context toolbar – only visible when cursor is inside a table */}
          {editor.isActive('table') && (
            <>
              <Divider />
              <span className="text-xs text-gray-400 px-1">Tabelle:</span>
              <ToolbarButton
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                title="Spalte links einfügen"
              >
                <Columns2 className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                title="Spalte rechts einfügen"
              >
                <Columns2 className="w-4 h-4 scale-x-[-1]" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().deleteColumn().run()}
                title="Spalte löschen"
                disabled={!editor.can().deleteColumn()}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </ToolbarButton>
              <Divider />
              <ToolbarButton
                onClick={() => editor.chain().focus().addRowBefore().run()}
                title="Zeile oberhalb einfügen"
              >
                <Rows2 className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().addRowAfter().run()}
                title="Zeile unterhalb einfügen"
              >
                <Rows2 className="w-4 h-4 scale-y-[-1]" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().deleteRow().run()}
                title="Zeile löschen"
                disabled={!editor.can().deleteRow()}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </ToolbarButton>
              <Divider />
              <ToolbarButton
                onClick={() => editor.chain().focus().deleteTable().run()}
                title="Tabelle löschen"
              >
                <span className="text-xs font-medium text-red-500 px-0.5">Del</span>
              </ToolbarButton>
            </>
          )}
        </div>
      )}

      <EditorContent editor={editor} style={{ minHeight }} />

      {!readOnly && (
        <div className="px-3 py-1 bg-gray-50 border-t border-gray-200 text-xs text-gray-400 text-right">
          {editor.storage.characterCount?.characters()} Zeichen
        </div>
      )}
    </div>
  );
}
