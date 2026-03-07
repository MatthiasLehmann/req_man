import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, AlertTriangle } from 'lucide-react';
import { getProject } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import DocumentTree from '../components/requirements/DocumentTree';
import ItemList from '../components/requirements/ItemList';
import ItemEditor from '../components/requirements/ItemEditor';

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
  const { currentProject, setCurrentProject } = useProjectStore();
  const navigate = useNavigate();

  const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null);
  const [selectedUid, setSelectedUid]       = useState<string | null>(null);
  const [editorDirty, setEditorDirty]       = useState(false);

  // Ausstehende Aktion (Item-/Dok-Wechsel oder Sidebar-Navigation)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

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
      <div className="flex h-full">
        {/* Dokumenten-Baum (linkes Panel) */}
        <div className="w-52 shrink-0 border-r border-gray-200 bg-white flex flex-col">
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

        {/* Item-Liste (mittleres Panel) */}
        <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
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
