import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { updateDocumentProperties, type DocumentControl } from '../../../../shared/api/client';
import type { PropertyDefinition } from '../../../../shared/types';

interface Props {
  projectId: string;
  prefix: string;
  properties: PropertyDefinition[];
  values: Record<string, string>;
  /** Dokumentenlenkung (Vorgabe für das Deckblatt der PDF-Spezifikation) */
  control: DocumentControl;
  canEdit: boolean;
}

type ControlKey = Exclude<keyof DocumentControl & string, 'status' | 'kind'>;

const CONTROL_FIELDS: { key: ControlKey; label: string; placeholder?: string }[] = [
  { key: 'title', label: 'Titel', placeholder: 'z. B. Systemanforderungen Station 3' },
  { key: 'doc_number', label: 'Dokumentnummer', placeholder: 'z. B. S3-SYRS-001' },
  { key: 'version', label: 'Version', placeholder: 'z. B. 1.0' },
  { key: 'confidentiality', label: 'Vertraulichkeit', placeholder: 'z. B. intern' },
  { key: 'author', label: 'Erstellt von' },
  { key: 'reviewer', label: 'Geprüft von' },
  { key: 'approver', label: 'Freigegeben von' },
];

const DOC_STATUS = [
  { id: '', label: '–' },
  { id: 'entwurf', label: 'Entwurf' },
  { id: 'pruefung', label: 'Zur Prüfung' },
  { id: 'freigegeben', label: 'Freigegeben' },
] as const;

const CONTROL_KEYS: (keyof DocumentControl)[] = [...CONTROL_FIELDS.map((f) => f.key), 'status', 'kind'];

export default function DocumentPropertiesForm({
  projectId, prefix, properties, values, control, canEdit,
}: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [ctl, setCtl] = useState<DocumentControl>(control);

  // Beim Wechsel des Dokuments (oder nach Neuladen) Formular zurücksetzen
  useEffect(() => {
    setDraft(values);
    setCtl(control);
  }, [prefix, values, control]);

  const saveMut = useMutation({
    mutationFn: () => updateDocumentProperties(projectId, prefix, draft, ctl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-structure', projectId] });
      toast.success('Eigenschaften gespeichert');
    },
    onError: () => toast.error('Fehler beim Speichern der Eigenschaften'),
  });

  const setValue = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setControl = (key: keyof DocumentControl, value: string) =>
    setCtl((c) => ({ ...c, [key]: value }));

  const isDirty =
    properties.some((p) => (draft[p.key] ?? '') !== (values[p.key] ?? '')) ||
    CONTROL_KEYS.some((k) => (ctl[k] ?? '') !== (control[k] ?? ''));
  const disabled = !canEdit || saveMut.isPending;

  return (
    <div className="space-y-4">
      {properties.length > 0 && (
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
                    disabled={disabled}
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
                    disabled={disabled}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Dokumentenlenkung
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Vorgabe für Deckblatt, Kopfzeile und Freigabetabelle der PDF-Spezifikation; im Dialog „PDF erstellen…“ überschreibbar.
        </p>
        <div className="space-y-3">
          {CONTROL_FIELDS.slice(0, 3).map((f) => (
            <ControlInput key={f.key} field={f} value={ctl[f.key] ?? ''} disabled={disabled}
                          onChange={(v) => setControl(f.key, v)} />
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              className="input w-full text-sm"
              value={ctl.status ?? ''}
              onChange={(e) => setControl('status', e.target.value)}
              disabled={disabled}
            >
              {DOC_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {CONTROL_FIELDS.slice(3).map((f) => (
            <ControlInput key={f.key} field={f} value={ctl[f.key] ?? ''} disabled={disabled}
                          onChange={(v) => setControl(f.key, v)} />
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Art</label>
            <select
              className="input w-full text-sm"
              value={ctl.kind ?? ''}
              onChange={(e) => setControl('kind', e.target.value)}
              disabled={disabled}
            >
              <option value="">Anforderungen</option>
              <option value="glossar">Glossar (Begriffe/Abkürzungen für den PDF-Anhang)</option>
            </select>
          </div>
        </div>
      </div>

      {canEdit && (
        <button
          onClick={() => saveMut.mutate()}
          disabled={!isDirty || saveMut.isPending}
          className="btn-primary w-full text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saveMut.isPending ? 'Speichern...' : 'Eigenschaften speichern'}
        </button>
      )}
    </div>
  );
}

function ControlInput({ field, value, disabled, onChange }: {
  field: { key: string; label: string; placeholder?: string };
  value: string; disabled: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{field.label}</label>
      <input
        type="text"
        className="input w-full text-sm"
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
