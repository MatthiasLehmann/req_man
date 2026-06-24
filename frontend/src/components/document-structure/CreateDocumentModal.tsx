import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { createDocument, assignDocumentType } from '../../api/client';
import type { DocumentType, DocumentWithType } from '../../types';

interface Props {
  projectId: string;
  documents: DocumentWithType[];
  documentTypes: DocumentType[];
  onClose: () => void;
}

export default function CreateDocumentModal({ projectId, documents, documentTypes, onClose }: Props) {
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState('');
  const [parent, setParent] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('');

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    const t = documentTypes.find((dt) => dt.id === typeId);
    if (t && t.default_prefix && !prefix) {
      setPrefix(t.default_prefix);
    }
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await createDocument(projectId, {
        prefix: prefix.toUpperCase(),
        parent: parent || undefined,
      });
      if (selectedTypeId) {
        await assignDocumentType(projectId, prefix.toUpperCase(), selectedTypeId);
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-structure', projectId] });
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      toast.success(`Dokument ${prefix.toUpperCase()} erstellt`);
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Fehler beim Erstellen');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefix.trim()) return toast.error('Prefix ist Pflichtfeld');
    createMut.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-96 max-w-[90vw]">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Neues Dokument erstellen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Dokumenttyp
            </label>
            <select
              className="input w-full"
              value={selectedTypeId}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <option value="">-- Kein Typ --</option>
              {documentTypes.map((dt) => (
                <option key={dt.id} value={dt.id}>{dt.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Prefix *
            </label>
            <input
              className="input w-full font-mono"
              placeholder="z.B. SYS"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              maxLength={255}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Übergeordnetes Dokument
            </label>
            <select
              className="input w-full"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">-- Kein übergeordnetes Dokument --</option>
              {documents.map((doc) => (
                <option key={doc.prefix} value={doc.prefix}>{doc.prefix}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="btn-primary flex-1"
            >
              {createMut.isPending ? 'Erstelle...' : 'Erstellen'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
