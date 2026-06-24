import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen, Folder, Plus, Trash2, ChevronRight, ChevronDown,
  Loader2, X, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { listDocuments, createDocument, deleteDocument } from '../../api/client';
import { Document } from '../../types';
import { useAuthStore } from '../../store/authStore';

interface Props {
  projectId: string;
  selectedPrefix: string | null;
  onSelectDocument: (prefix: string) => void;
}

export default function DocumentTree({ projectId, selectedPrefix, onSelectDocument }: Props) {
  const { user } = useAuthStore();
  const canEdit = user?.role !== 'viewer';

  const { data: docsRes, isLoading } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => listDocuments(projectId),
    enabled: !!projectId,
  });
  const documents: Document[] = docsRes?.data || [];

  const [showCreate, setShowCreate] = useState(false);
  const [newPrefix, setNewPrefix] = useState('');
  const [newParent, setNewParent] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: () =>
      createDocument(projectId, { prefix: newPrefix.toUpperCase(), parent: newParent || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      toast.success(`Dokument ${res.data.prefix} erstellt`);
      setShowCreate(false);
      setNewPrefix('');
      setNewParent('');
      onSelectDocument(res.data.prefix);
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler beim Erstellen'),
  });

  const deleteMut = useMutation({
    mutationFn: (prefix: string) => deleteDocument(projectId, prefix),
    onSuccess: (_, prefix) => {
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      toast.success(`Dokument ${prefix} gelöscht`);
      if (selectedPrefix === prefix) onSelectDocument('');
    },
    onError: () => toast.error('Fehler beim Löschen'),
  });

  const toggleExpand = (prefix: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  };

  // Build tree structure
  const rootDocs = documents.filter((d) => !d.parent);
  const childMap: Record<string, Document[]> = {};
  documents.forEach((d) => {
    if (d.parent) {
      childMap[d.parent] = [...(childMap[d.parent] || []), d];
    }
  });

  const renderDoc = (doc: Document, depth = 0) => {
    const children = childMap[doc.prefix] || [];
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(doc.prefix);
    const isSelected = selectedPrefix === doc.prefix;

    return (
      <div key={doc.prefix}>
        <div
          className={clsx(
            'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer group transition-colors',
            isSelected ? 'bg-primary-100 text-primary-800' : 'hover:bg-gray-100 text-gray-700'
          )}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => onSelectDocument(doc.prefix)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(doc.prefix); }}
              className="text-gray-400"
            >
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-3" />
          )}

          {isSelected ? (
            <FolderOpen className="w-4 h-4 text-primary-600 shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-gray-400 shrink-0" />
          )}

          <span className="flex-1 text-sm font-medium truncate">{doc.prefix}</span>
          <span className="text-xs text-gray-400 shrink-0">{doc.item_count}</span>

          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Dokument ${doc.prefix} löschen?`)) {
                  deleteMut.mutate(doc.prefix);
                }
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {isExpanded && children.map((child) => renderDoc(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dokumente</span>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="text-primary-600 hover:text-primary-700">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Keine Dokumente</p>
            {canEdit && (
              <button
                onClick={() => setShowCreate(true)}
                className="text-xs text-primary-600 hover:underline mt-1"
              >
                Erstellen
              </button>
            )}
          </div>
        ) : (
          rootDocs.map((doc) => renderDoc(doc))
        )}
      </div>

      {/* Create Document Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Neues Dokument</h3>
              <button onClick={() => setShowCreate(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Präfix *
                </label>
                <input
                  className="input uppercase"
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                  placeholder="z.B. REQ, SYS, TEST"
                  maxLength={255}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Wird als Präfix für alle Anforderungs-IDs verwendet</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Übergeordnetes Dokument
                </label>
                <select
                  className="input"
                  value={newParent}
                  onChange={(e) => setNewParent(e.target.value)}
                >
                  <option value="">— kein übergeordnetes Dokument —</option>
                  {documents.map((d) => (
                    <option key={d.prefix} value={d.prefix}>{d.prefix}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => createMut.mutate()}
                  disabled={!newPrefix || createMut.isPending}
                  className="btn-primary flex-1 justify-center"
                >
                  {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Erstellen'}
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-secondary">
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
