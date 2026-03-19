import { Plus, Trash2 } from 'lucide-react';
import type { PropertyDefinition } from '../../types';

interface Props {
  properties: PropertyDefinition[];
  onChange: (props: PropertyDefinition[]) => void;
  readOnly?: boolean;
}

const EMPTY_PROP: PropertyDefinition = { key: '', label: '', type: 'text' };

export default function PropertyEditor({ properties, onChange, readOnly }: Props) {
  const add = () => onChange([...properties, { ...EMPTY_PROP }]);

  const update = (i: number, field: keyof PropertyDefinition, value: string) => {
    const next = properties.map((p, idx) =>
      idx === i ? { ...p, [field]: value } : p
    );
    onChange(next);
  };

  const remove = (i: number) => onChange(properties.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        Eigenschaften
      </div>
      {properties.length === 0 && (
        <p className="text-xs text-gray-400 italic mb-2">Keine Eigenschaften definiert.</p>
      )}
      <div className="space-y-2">
        {properties.map((prop, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="input text-xs flex-1"
              placeholder="Schlüssel"
              value={prop.key}
              onChange={(e) => update(i, 'key', e.target.value)}
              disabled={readOnly}
            />
            <input
              className="input text-xs flex-1"
              placeholder="Bezeichnung"
              value={prop.label}
              onChange={(e) => update(i, 'label', e.target.value)}
              disabled={readOnly}
            />
            <select
              className="input text-xs w-24"
              value={prop.type}
              onChange={(e) => update(i, 'type', e.target.value as PropertyDefinition['type'])}
              disabled={readOnly}
            >
              <option value="text">Text</option>
              <option value="date">Datum</option>
              <option value="select">Auswahl</option>
            </select>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-red-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="mt-2 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
        >
          <Plus className="w-3 h-3" /> Eigenschaft hinzufügen
        </button>
      )}
    </div>
  );
}
