import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, AlertTriangle } from 'lucide-react';
import { getProject } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import DocumentTree from '../components/requirements/DocumentTree';
import ItemList from '../components/requirements/ItemList';
import ItemEditor from '../components/requirements/ItemEditor';

// ─── Resize-Divider ───────────────────────────────────────────────────────────

interface ResizeDividerProps {
  onDragStart: (e: React.MouseEvent) => void;
}

function ResizeDivider({ onDragStart }: ResizeDividerProps) {
  return (
    <div
      onMouseDown={onDragStart}
      className="w-1 shrink-0 bg-gray-200 hover:bg-primary-400 active:bg-primary-500
                 cursor-col-resize transition-colors select-none"
    />
  );
}

// ─── Panel-Breiten Hook ────────────────────────────────────────────────────────

const STORAGE_KEY = 'reqman_panel_widths';
const DEFAULT_WIDTHS = { tree: 208, list: 288 };
const MIN = { tree: 140, list: 180, editor: 280 };

function usePanelWidths(containerRef: React.RefObject<HTMLDivElement | null>) {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  })();

  const [widths, setWidths] = useState({
    tree: saved.tree ?? DEFAULT_WIDTHS.tree,
    list: saved.list ?? DEFAULT_WIDTHS.list,
  });

  const dragging = useRef<'tree' | 'list' | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const startDrag = useCallback((panel: 'tree' | 'list') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = panel;
    startX.current = e.clientX;
    startWidth.current = widths[panel];

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const delta = ev.clientX - startX.current;
      const containerW = containerRef.current.getBoundingClientRect().width;

      setWidths((prev) => {
        const next = { ...prev };
        if (dragging.current === 'tree') {
          const proposed = Math.max(MIN.tree, startWidth.current + delta);
          // Sicherstellen dass Editor mindestens MIN.editor Platz hat
          const maxTree = containerW - prev.list - MIN.editor - 2;
          next.tree = Math.min(proposed, maxTree);
        } else {
          const proposed = Math.max(MIN.list, startWidth.current + delta);
          const maxList = containerW - prev.tree - MIN.editor - 2;
          next.list = Math.min(proposed, maxList);
        }
        return next;
      });
    };

    const onUp = () => {
      dragging.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setWidths((w) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
        return w;
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [widths, containerRef]);

  return { widths, startDrag };
}

// ─── Ungespeichert-Modal ──────────────────────────────────────────────────────

interface UnsavedModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function UnsavedModal({ onConfirm, onCancel }: UnsavedModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-yellow-50 border-b border-yellow-100">
          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-800">Ungespeicherte Änderungen</h2>
        </div>
        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600">
            Die Anforderung enthält ungespeicherte Änderungen.
            Wenn du fortfährst, gehen diese{' '}
            <span className="font-semibold text-red-600">unwiederbringlich verloren</span>.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Speichere zuerst oder verwerfe die Änderungen.
          </p>
        </div>
        {/* Actions */}
        <div className="flex gap-2 px-5 pb-4 justify-end">
          <button onClick={onCancel} className="btn-secondary text-sm py-2">
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2
                       rounded-lg transition-colors"
          >
            Änderungen verwerfen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function RequirementsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    currentProject, setCurrentProject,
    requirementsPrefix: storedPrefixes,
    requirementsUid:    storedUids,
    setRequirementsPrefix,
    setRequirementsUid,
  } = useProjectStore();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { widths, startDrag } = usePanelWidths(containerRef);

  const pid = projectId ?? currentProject?.id ?? '';

  // Aus Store wiederherstellen
  const [selectedPrefix, setSelectedPrefixState] = useState<string | null>(
    () => storedPrefixes[pid] || null,
  );
  const [selectedUid, setSelectedUidState] = useState<string | null>(
    () => storedUids[pid] || null,
  );
  const [editorDirty, setEditorDirty] = useState(false);

  // Ausstehende Aktion (Item-/Dok-Wechsel oder Sidebar-Navigation)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Wrapper, die lokalen State + Store synchron halten
  const setSelectedPrefix = (prefix: string | null) => {
    setSelectedPrefixState(prefix);
    if (pid) setRequirementsPrefix(pid, prefix ?? '');
  };
  const setSelectedUid = (uid: string | null) => {
    setSelectedUidState(uid);
    if (pid) setRequirementsUid(pid, uid ?? '');
  };

  // ── Projekt laden ────────────────────────────────────────────────────────────
  const { data: projectRes } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId && !currentProject,
  });

  useEffect(() => {
    if (projectRes?.data && !currentProject) {
      setCurrentProject(projectRes.data);
    }
  }, [projectRes]);

  // ── Sidebar-Links abfangen (BrowserRouter hat kein useBlocker) ───────────────
  // Kein Navigationsblocker nötig – beforeunload in ItemEditor deckt den Fall ab,
  // und das Modal deckt interne Item-/Dok-Wechsel ab.
  // Für Klicks auf Sidebar-<a>-Links: capture-phase-Listener der das Modal zeigt.
  useEffect(() => {
    if (!editorDirty) return;

    const handler = (e: MouseEvent) => {
      const target = (e.target as Element).closest('a[href]');
      if (!target) return;
      const href = target.getAttribute('href') ?? '';
      // Nur interne Links abfangen, die NICHT auf /requirements zeigen
      if (href.startsWith('/requirements') || href === '') return;

      e.preventDefault();
      e.stopImmediatePropagation();

      setPendingAction(() => () => navigate(href));
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [editorDirty, navigate]);

  // ── Browser-Tab: beforeunload ist in ItemEditor registriert ──────────────────

  // ── Navigationswächter für interne Wechsel ────────────────────────────────────
  const guardedAction = useCallback((action: () => void) => {
    if (!editorDirty) {
      action();
      return;
    }
    setPendingAction(() => action);
  }, [editorDirty]);

  const handleModalConfirm = () => {
    if (pendingAction) {
      setEditorDirty(false);
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleModalCancel = () => {
    setPendingAction(null);
  };

  // ── Kein Projekt ─────────────────────────────────────────────────────────────
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Kein Projekt ausgewählt</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-4">
            <ArrowLeft className="w-4 h-4" />
            Zur Projektübersicht
          </button>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div ref={containerRef} className="flex h-full">
        {/* Dokumenten-Baum (linkes Panel) */}
        <div
          style={{ width: widths.tree }}
          className="shrink-0 bg-white flex flex-col overflow-hidden"
        >
          <DocumentTree
            projectId={projectId}
            selectedPrefix={selectedPrefix}
            onSelectDocument={(prefix) => {
              guardedAction(() => {
                setSelectedPrefix(prefix || null);
                setSelectedUid(null);
              });
            }}
          />
        </div>

        <ResizeDivider onDragStart={startDrag('tree')} />

        {/* Item-Liste (mittleres Panel) */}
        <div
          style={{ width: widths.list }}
          className="shrink-0 bg-white flex flex-col overflow-hidden"
        >
          {selectedPrefix ? (
            <ItemList
              projectId={projectId}
              prefix={selectedPrefix}
              selectedUid={selectedUid}
              onSelectItem={(uid) => {
                if (uid === selectedUid) return;
                guardedAction(() => setSelectedUid(uid || null));
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              <div className="text-center">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Dokument auswählen</p>
              </div>
            </div>
          )}
        </div>

        <ResizeDivider onDragStart={startDrag('list')} />

        {/* Item-Editor (Hauptbereich) */}
        <div className="flex-1 overflow-hidden">
          {selectedUid ? (
            <ItemEditor
              projectId={projectId}
              uid={selectedUid}
              onClose={() => guardedAction(() => setSelectedUid(null))}
              onDirtyChange={setEditorDirty}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-sm">Anforderung auswählen oder erstellen</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ungespeichert-Warndialog */}
      {pendingAction && (
        <UnsavedModal
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
        />
      )}
    </>
  );
}
