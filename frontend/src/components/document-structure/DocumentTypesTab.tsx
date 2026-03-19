import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { listDocumentTypes } from '../../api/client';
import type { DocumentType } from '../../types';
import DocumentTypeForm from './DocumentTypeForm';
import { useAuthStore } from '../../store/authStore';

export default function DocumentTypesTab() {
  const { user } = useAuthStore();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  const { data: res, isLoading } = useQuery({
    queryKey: ['document-types'],
    queryFn: listDocumentTypes,
  });
  const types: DocumentType[] = res?.data ?? [];

  const [selected, setSelected] = useState<DocumentType | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleNew = () => {
    setSelected(null);
    setIsNew(true);
  };

  const handleSelect = (dt: DocumentType) => {
    setSelected(dt);
    setIsNew(false);
  };

  const handleSaved = (dt: DocumentType) => {
    setSelected(dt);
    setIsNew(false);
  };

  const handleDeleted = () => {
    setSelected(null);
    setIsNew(false);
  };

  const showForm = isNew || selected !== null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: type list */}
      <div className="w-64 border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Dokumenttypen</span>
          {canEdit && (
            <button
              onClick={handleNew}
              className="p-1 text-primary-600 hover:bg-primary-50 rounded"
              title="Neuer Dokumenttyp"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && (
            <p className="text-xs text-gray-400 p-2">Lade...</p>
          )}
          {!isLoading && types.length === 0 && (
            <p className="text-xs text-gray-400 p-2 italic">
              Noch keine Dokumenttypen definiert.
            </p>
          )}
          {types.map((dt) => (
            <button
              key={dt.id}
              onClick={() => handleSelect(dt)}
              className={`w-full text-left rounded-lg p-2.5 border transition-colors ${
                selected?.id === dt.id
                  ? 'border-primary-300 bg-primary-50'
                  : 'border-transparent hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: dt.color }}
                />
                <span className="text-sm font-medium text-gray-800 truncate">{dt.name}</span>
              </div>
              {dt.default_prefix && (
                <span className="mt-1 inline-block text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  {dt.default_prefix}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 overflow-y-auto p-5">
        {!showForm && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-sm">Dokumenttyp auswählen oder neuen erstellen</p>
          </div>
        )}
        {showForm && (
          <>
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              {isNew ? 'Neuer Dokumenttyp' : `Dokumenttyp bearbeiten: ${selected?.name}`}
            </h3>
            <DocumentTypeForm
              selected={isNew ? null : selected}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              canEdit={canEdit}
            />
          </>
        )}
      </div>
    </div>
  );
}
