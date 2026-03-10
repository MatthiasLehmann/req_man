/**
 * React NodeView für PlantUML-Diagramm-Blöcke.
 *
 * Zeigt:
 *   - Anzeige-Modus: gerendertes SVG-Diagramm
 *   - Edit-Modus:    Textarea für PlantUML-Quelltext + "Anwenden"-Button
 *
 * SVG wird über den lokalen Backend-Endpoint /api/plantuml/render geladen.
 */

import { NodeViewWrapper } from '@tiptap/react';
import { Check, Loader2, Pencil, X, AlertTriangle, Network } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import api from '../../api/client';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlantUMLViewProps {
  node: { attrs: Record<string, string> };
  updateAttributes: (attrs: Record<string, string>) => void;
  selected: boolean;
}

// ─── Hilfsfunktion ────────────────────────────────────────────────────────────

const DEFAULT_SOURCE = `@startuml
Alice -> Bob: Hallo
Bob --> Alice: Hallo zurück
@enduml`;

// ─── Komponente ───────────────────────────────────────────────────────────────

export default function PlantUMLView({ node, updateAttributes, selected }: PlantUMLViewProps) {
  const source: string = node.attrs['source'] ?? '';

  const [svg, setSvg] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [renderError, setRenderError] = useState<string>('');
  const [editing, setEditing] = useState(!source);          // leer → direkt bearbeiten
  const [editSource, setEditSource] = useState(source || DEFAULT_SOURCE);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // SVG laden wenn source sich ändert und nicht im Edit-Modus
  useEffect(() => {
    if (!source || editing) return;

    let cancelled = false;
    setLoading(true);
    setRenderError('');

    api
      .post<{ svg: string }>('/plantuml/render', { source })
      .then((res) => {
        if (!cancelled) setSvg(res.data.svg);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            'Fehler beim Rendern des Diagramms';
          setRenderError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [source, editing]);

  // Fokus auf Textarea bei Edit-Öffnung
  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const handleApply = () => {
    updateAttributes({ source: editSource });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditSource(source || DEFAULT_SOURCE);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Enter → Anwenden
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
    // Escape → Abbrechen
    if (e.key === 'Escape' && source) {
      e.preventDefault();
      handleCancel();
    }
    // Tab → 2 Leerzeichen einfügen
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = editSource.substring(0, start) + '  ' + editSource.substring(end);
      setEditSource(newVal);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  };

  return (
    <NodeViewWrapper
      className={`plantuml-block my-3 rounded-xl border-2 transition-colors overflow-hidden
        ${selected ? 'border-primary-400' : 'border-gray-200 hover:border-gray-300'}`}
      data-drag-handle
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <Network className="w-3.5 h-3.5 text-primary-500" />
          PlantUML
        </span>
        <div className="flex items-center gap-1">
          {!editing && (
            <button
              type="button"
              onClick={() => { setEditSource(source || DEFAULT_SOURCE); setEditing(true); }}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Quelltext bearbeiten"
            >
              <Pencil className="w-3 h-3" />
              Bearbeiten
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={handleApply}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                title="Übernehmen (Ctrl+Enter)"
              >
                <Check className="w-3 h-3" />
                Anwenden
              </button>
              {source && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  title="Abbrechen (Esc)"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Edit-Modus ─────────────────────────────────────────────────────── */}
      {editing && (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={editSource}
            onChange={(e) => setEditSource(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={8}
            spellCheck={false}
            className="w-full font-mono text-sm p-3 bg-gray-900 text-gray-100 resize-y
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset"
            placeholder={DEFAULT_SOURCE}
          />
          <span className="absolute bottom-2 right-3 text-xs text-gray-500 pointer-events-none select-none">
            Ctrl+Enter anwenden · Esc abbrechen
          </span>
        </div>
      )}

      {/* ── Anzeige-Modus ──────────────────────────────────────────────────── */}
      {!editing && (
        <div className="p-3 min-h-[60px] flex items-center justify-center">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Rendern…
            </div>
          )}

          {!loading && renderError && (
            <div className="w-full rounded-lg bg-red-50 border border-red-200 p-3">
              <div className="flex items-start gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold mb-1">PlantUML-Fehler</p>
                  <pre className="text-xs whitespace-pre-wrap break-words">{renderError}</pre>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setEditSource(source); setEditing(true); }}
                className="mt-2 text-xs text-red-600 underline hover:text-red-800"
              >
                Quelltext korrigieren
              </button>
            </div>
          )}

          {!loading && !renderError && svg && (
            <div
              className="plantuml-svg w-full overflow-x-auto"
              // SVG vom lokalen Backend ist sicher (kein User-Input als HTML)
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}

          {!loading && !renderError && !svg && !source && (
            <p className="text-sm text-gray-400 italic">Kein Diagramm vorhanden.</p>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}
