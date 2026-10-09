import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { updateDocumentProperties } from '../../../../shared/api/client';
import type { PropertyDefinition } from '../../../../shared/types';

interface Props {
  projectId: string;
  prefix: string;
  properties: PropertyDefinition[];
  values: Record<string, string>;
  canEdit: boolean;
}

export default function DocumentPropertiesForm({
  projectId, prefix, properties, values, canEdit,
}: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>(values);

  // Beim Wechsel des Dokuments (oder nach Neuladen) Formular zurücksetzen
  useEffect(() => {
    setDraft(values);
  }, [prefix, values]);

  const saveMut = useMutation({
    mutationFn: () => updateDocumentProperties(projectId, prefix, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-structure', projectId] });
      toast.success('Eigenschaften gespeichert');
    },
    onError: () => toast.error('Fehler beim Speichern der Eigenschaften'),
  });

  const setValue = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const isDirty = properties.some(
    (p) => (draft[p.key] ?? '') !== (values[p.key] ?? '')
  );

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        Typ-Eigenschaften
      </div>
      <div className="space-y-3">
        {properties.map((prop) => (
          <div key={prop.key}>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {prop.label}
            </label>
            {prop.type === 'select' ? (
              <select
                className="input w-full text-sm"
                value={draft[prop.key] ?? ''}
                onChange={(e) => setValue(prop.key, e.target.value)}
                disabled={!canEdit || saveMut.isPending}
              >
                <option value="">–</option>
                {(prop.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={prop.type === 'date' ? 'date' : 'text'}
                className="input w-full text-sm"
                value={draft[prop.key] ?? ''}
                onChange={(e) => setValue(prop.key, e.target.value)}
                disabled={!canEdit || saveMut.isPending}
              />
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <button
          onClick={() => saveMut.mutate()}
          disabled={!isDirty || saveMut.isPending}
          className="btn-primary w-full text-sm mt-3 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saveMut.isPending ? 'Speichern...' : 'Eigenschaften speichern'}
        </button>
      )}
    </div>
  );
}
