import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save, Trash2 } from 'lucide-react';
import { createDocumentType, updateDocumentType, deleteDocumentType } from '../../api/client';
import type { DocumentType } from '../../types';
import PropertyEditor from './PropertyEditor';

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

interface Props {
  selected: DocumentType | null;
  onSaved: (dt: DocumentType) => void;
  onDeleted: () => void;
  canEdit: boolean;
}

export default function DocumentTypeForm({ selected, onSaved, onDeleted, canEdit }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [defaultPrefix, setDefaultPrefix] = useState('');
  const [description, setDescription] = useState('');
  const [properties, setProperties] = useState<DocumentType['properties']>([]);

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setColor(selected.color);
      setDefaultPrefix(selected.default_prefix);
      setDescription(selected.description);
      setProperties(selected.properties);
    } else {
      setName('');
      setColor('#3b82f6');
      setDefaultPrefix('');
      setDescription('');
      setProperties([]);
    }
  }, [selected]);

  const createMut = useMutation({
    mutationFn: () => createDocumentType({ name, color, default_prefix: defaultPrefix, description, properties }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['document-types'] });
      onSaved(res.data);
      toast.success('Dokumenttyp erstellt');
    },
    onError: () => toast.error('Fehler beim Erstellen'),
  });

  const updateMut = useMutation({
    mutationFn: () => updateDocumentType(selected!.id, { name, color, default_prefix: defaultPrefix, description, properties }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['document-types'] });
      qc.invalidateQueries({ queryKey: ['project-structure'] });
      onSaved(res.data);
      toast.success('Gespeichert');
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteDocumentType(selected!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-types'] });
      qc.invalidateQueries({ queryKey: ['project-structure'] });
      onDeleted();
      toast.success('Gelöscht');
    },
    onError: () => toast.error('Fehler beim Löschen'),
  });

  const handleSave = () => {
    if (!name.trim()) return toast.error('Name ist Pflichtfeld');
    if (selected) updateMut.mutate();
    else createMut.mutate();
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
        <input
          className="input w-full"
          placeholder="z.B. Lastenheft"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Standard-Prefix</label>
        <input
          className="input w-full"
          placeholder="z.B. SH"
          value={defaultPrefix}
          onChange={(e) => setDefaultPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          disabled={!canEdit}
          maxLength={20}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Beschreibung</label>
        <textarea
          className="input w-full h-16 resize-none"
          placeholder="Kurze Beschreibung dieses Dokumenttyps..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canEdit}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Farbe</label>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => canEdit && setColor(c)}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: color === c ? '#1f2937' : 'transparent',
              }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!canEdit}
            className="w-8 h-6 rounded cursor-pointer border border-gray-300"
            title="Benutzerdefinierte Farbe"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
          <span className="text-xs text-gray-500 font-mono">{color}</span>
        </div>
      </div>

      <PropertyEditor
        properties={properties}
        onChange={setProperties}
        readOnly={!canEdit}
      />

      {canEdit && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Save className="w-3.5 h-3.5" />
            {selected ? 'Speichern' : 'Erstellen'}
          </button>
          {selected && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Dokumenttyp "${selected.name}" wirklich löschen?`)) {
                  deleteMut.mutate();
                }
              }}
              disabled={deleteMut.isPending}
              className="btn-danger flex items-center gap-1.5 text-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
