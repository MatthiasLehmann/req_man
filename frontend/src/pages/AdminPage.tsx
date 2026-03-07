import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Tag, Plus, Trash2, Edit2, X, Loader2,
  CheckCircle, Shield, Eye, Pencil, HelpCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  listUsers, createUser, updateUser, deleteUser,
  getAttributes, updateAttributes
} from '../api/client';
import { User, AttributeDefinition } from '../types';
import HelpTooltip from '../components/ui/HelpTooltip';

type Tab = 'users' | 'attributes';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Administration</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {([
          ['users', Users, 'Benutzerverwaltung'],
          ['attributes', Tag, 'Benutzerdefinierte Attribute'],
        ] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' ? <UsersTab /> : <AttributesTab />}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const { data: res, isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const users: User[] = res?.data || [];

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', email: '', full_name: '', role: 'viewer', password: '' });

  const createMut = useMutation({
    mutationFn: () => createUser(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Benutzer erstellt');
      setShowCreate(false);
      setForm({ username: '', email: '', full_name: '', role: 'viewer', password: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler'),
  });

  const updateMut = useMutation({
    mutationFn: (data: object) => updateUser(editUser!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Benutzer aktualisiert');
      setEditUser(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Benutzer gelöscht');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler'),
  });

  const roleIcon = (role: string) => {
    if (role === 'admin') return <Shield className="w-3 h-3 text-red-500" />;
    if (role === 'editor') return <Pencil className="w-3 h-3 text-blue-500" />;
    return <Eye className="w-3 h-3 text-gray-400" />;
  };

  const roleBadge = (role: string) => {
    const classes = { admin: 'badge-red', editor: 'badge-blue', viewer: 'badge-gray' }[role] || 'badge-gray';
    return <span className={classes}>{role}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{users.length} Benutzer</p>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Benutzer hinzufügen
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Benutzer', 'E-Mail', 'Rolle', 'Status', 'Erstellt', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900">{u.full_name}</div>
                      <div className="text-xs text-gray-500 font-mono">@{u.username}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {roleIcon(u.role)}
                      {roleBadge(u.role)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle className="w-3.5 h-3.5" /> Aktiv
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Inaktiv</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(u.created_at).toLocaleDateString('de-DE')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditUser(u)} className="btn-ghost text-xs py-1 px-2">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => { if (confirm(`${u.username} wirklich löschen?`)) deleteMut.mutate(u.id); }}
                        className="btn-ghost text-xs py-1 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <UserModal
          title="Neuen Benutzer erstellen"
          form={form}
          setForm={setForm}
          onSave={() => createMut.mutate()}
          onClose={() => setShowCreate(false)}
          loading={createMut.isPending}
          showPassword
        />
      )}

      {editUser && (
        <UserModal
          title={`${editUser.username} bearbeiten`}
          form={{ username: editUser.username, email: editUser.email, full_name: editUser.full_name, role: editUser.role, password: '' }}
          setForm={() => {}}
          onSave={() => updateMut.mutate({ email: editUser.email, full_name: editUser.full_name, role: editUser.role, is_active: editUser.is_active })}
          onClose={() => setEditUser(null)}
          loading={updateMut.isPending}
          editData={editUser}
          onEditChange={(field, val) => setEditUser({ ...editUser, [field]: val })}
        />
      )}
    </div>
  );
}

function UserModal({ title, form, setForm, onSave, onClose, loading, showPassword, editData, onEditChange }: {
  title: string; form: any; setForm: (f: any) => void;
  onSave: () => void; onClose: () => void; loading: boolean;
  showPassword?: boolean; editData?: User; onEditChange?: (field: string, val: unknown) => void;
}) {
  const isEdit = !!editData;
  const data = isEdit ? editData! : form;
  const setField = (field: string, val: unknown) => {
    if (isEdit && onEditChange) onEditChange(field, val);
    else setForm({ ...form, [field]: val });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername *</label>
              <input className="input" value={form.username} onChange={(e) => setField('username', e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vollständiger Name *</label>
            <input className="input" value={data.full_name} onChange={(e) => setField('full_name', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail *</label>
            <input className="input" type="email" value={data.email} onChange={(e) => setField('email', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
            <select className="input" value={data.role} onChange={(e) => setField('role', e.target.value)}>
              <option value="viewer">Betrachter (viewer)</option>
              <option value="editor">Bearbeiter (editor)</option>
              <option value="admin">Administrator (admin)</option>
            </select>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={data.is_active} onChange={(e) => setField('is_active', e.target.checked)} />
              <span className="text-sm text-gray-700">Aktiv</span>
            </label>
          )}
          {showPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort *</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={onSave} disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Speichern'}
            </button>
            <button onClick={onClose} className="btn-secondary">Abbrechen</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Attributes Tab ───────────────────────────────────────────────────────────

function AttributesTab() {
  const qc = useQueryClient();
  const { data: res } = useQuery({ queryKey: ['attributes'], queryFn: getAttributes });
  const savedAttrs: AttributeDefinition[] = res?.data || [];

  const [attrs, setAttrs] = useState<AttributeDefinition[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!initialized && savedAttrs.length >= 0) {
    setAttrs([...savedAttrs]);
    setInitialized(true);
  }

  const saveMut = useMutation({
    mutationFn: () => updateAttributes(attrs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attributes'] });
      toast.success('Attribute gespeichert');
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  const addAttr = () => {
    const newIdx = attrs.length;
    setAttrs([...attrs, {
      key: '',
      display_name: '',
      attr_type: 'string',
      default_value: null,
      possible_values: null,
      required: false,
      applies_to: [],
      help_text: null,
    }]);
    setExpandedIdx(newIdx);
  };

  const removeAttr = (idx: number) => {
    setAttrs(attrs.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  };

  const updateAttr = (idx: number, field: keyof AttributeDefinition, value: unknown) => {
    const next = [...attrs];
    (next[idx] as any)[field] = value;
    setAttrs(next);
  };

  const toggleExpand = (idx: number) =>
    setExpandedIdx((prev) => (prev === idx ? null : idx));

  return (
    <div className="space-y-4">
      {/* Info-Banner über Hilfetexte */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <strong>Hilfetexte für Attribute:</strong> Zu jedem benutzerdefinierten Attribut kann ein
          Hilfetext hinterlegt werden. Dieser erscheint im Anforderungseditor als
          ⓘ-Tooltip neben dem Attributnamen.
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Benutzerdefinierte Attribute für alle Anforderungen
        </p>
        <div className="flex gap-2">
          <button onClick={addAttr} className="btn-secondary">
            <Plus className="w-4 h-4" /> Attribut hinzufügen
          </button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-primary">
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Speichern
          </button>
        </div>
      </div>

      {attrs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Noch keine benutzerdefinierten Attribute</p>
          <button onClick={addAttr} className="btn-secondary mt-3">
            <Plus className="w-4 h-4" /> Erstes Attribut erstellen
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {attrs.map((attr, idx) => {
            const isExpanded = expandedIdx === idx;
            return (
              <div key={idx} className="card overflow-hidden">
                {/* ── Collapsed Header ── */}
                <div
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer select-none',
                    isExpanded ? 'bg-gray-50 border-b border-gray-200' : 'hover:bg-gray-50'
                  )}
                  onClick={() => toggleExpand(idx)}
                >
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700 shrink-0">
                      {attr.key || '(Kein Schlüssel)'}
                    </span>
                    <span className="text-sm text-gray-700 truncate">
                      {attr.display_name || <span className="italic text-gray-400">Kein Anzeigename</span>}
                    </span>
                    <span className="badge-gray text-xs shrink-0">{attr.attr_type}</span>
                    {attr.required && (
                      <span className="badge-red text-xs shrink-0">Pflicht</span>
                    )}
                    {attr.help_text && (
                      <span className="flex items-center gap-1 text-xs text-blue-500 shrink-0">
                        <HelpCircle className="w-3 h-3" /> Hilfe
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeAttr(idx); }}
                      className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                      title="Attribut löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </div>

                {/* ── Expanded Form ── */}
                {isExpanded && (
                  <div className="p-4 space-y-4">
                    {/* Row 1: Schlüssel + Anzeigename + Typ + Standardwert */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Schlüssel *
                          <HelpTooltip
                            title="Attribut-Schlüssel"
                            text="Interner Name des Attributs im YAML-Format. Wird in Doorstop-Dateien gespeichert. Nur Großbuchstaben und Unterstriche empfohlen."
                            className="ml-1"
                          />
                        </label>
                        <input
                          className="input text-sm py-1 font-mono uppercase"
                          value={attr.key}
                          onChange={(e) => updateAttr(idx, 'key', e.target.value.toUpperCase())}
                          placeholder="MEIN_ATTRIBUT"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Anzeigename *
                          <HelpTooltip
                            title="Anzeigename"
                            text="Der für Benutzer sichtbare Name des Attributs im Anforderungseditor."
                            className="ml-1"
                          />
                        </label>
                        <input
                          className="input text-sm py-1"
                          value={attr.display_name}
                          onChange={(e) => updateAttr(idx, 'display_name', e.target.value)}
                          placeholder="Mein Attribut"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Datentyp
                          <HelpTooltip
                            title="Datentyp"
                            text="Bestimmt den Eingabe-Typ im Editor: Text (einzeilig), Mehrzeiliger Text, Ja/Nein-Checkbox, Ganzzahl, Auswahl aus einer Liste, oder kommagetrennte Mehrfachwerte."
                            className="ml-1"
                          />
                        </label>
                        <select
                          className="input text-sm py-1"
                          value={attr.attr_type}
                          onChange={(e) => updateAttr(idx, 'attr_type', e.target.value)}
                        >
                          <option value="string">Text (string)</option>
                          <option value="text">Mehrzeiliger Text</option>
                          <option value="boolean">Ja/Nein (boolean)</option>
                          <option value="integer">Zahl (integer)</option>
                          <option value="enum">Auswahl (enum)</option>
                          <option value="list">Liste</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Standardwert
                          <HelpTooltip
                            title="Standardwert"
                            text="Wert, der beim Anlegen einer neuen Anforderung vorbelegt wird. Leer lassen für keinen Standardwert."
                            className="ml-1"
                          />
                        </label>
                        <input
                          className="input text-sm py-1"
                          value={String(attr.default_value ?? '')}
                          onChange={(e) => updateAttr(idx, 'default_value', e.target.value || null)}
                          placeholder="Kein Standardwert"
                        />
                      </div>
                    </div>

                    {/* Row 2: Enum-Werte (nur bei enum) */}
                    {attr.attr_type === 'enum' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Mögliche Werte (kommagetrennt) *
                          <HelpTooltip
                            title="Auswahlwerte"
                            text='Liste der erlaubten Werte für dieses Auswahlfeld. Kommagetrennt eingeben, z.B. "Offen, In Bearbeitung, Geschlossen".'
                            className="ml-1"
                          />
                        </label>
                        <input
                          className="input text-sm py-1"
                          value={(attr.possible_values || []).join(', ')}
                          onChange={(e) =>
                            updateAttr(
                              idx, 'possible_values',
                              e.target.value.split(',').map((v) => v.trim()).filter(Boolean)
                            )
                          }
                          placeholder="Wert1, Wert2, Wert3"
                        />
                      </div>
                    )}

                    {/* Row 3: Hilfetext (Textarea) */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                        <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                        Hilfetext für Benutzer
                        <HelpTooltip
                          title="Hilfetext"
                          text="Dieser Text erscheint im Anforderungseditor als ⓘ-Tooltip neben dem Attributnamen. Erkläre den Zweck, erlaubte Werte oder Konventionen für dieses Attribut."
                          placement="right"
                          className="ml-1"
                        />
                      </label>
                      <textarea
                        className="input text-sm py-2 resize-y min-h-[80px]"
                        value={attr.help_text ?? ''}
                        onChange={(e) => updateAttr(idx, 'help_text', e.target.value || null)}
                        placeholder="z.B.: Gibt den aktuellen Bearbeitungsstatus der Anforderung an. Mögliche Werte: Offen, In Review, Freigegeben, Abgelehnt."
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        {(attr.help_text ?? '').length} Zeichen
                        {attr.help_text && (
                          <span className="ml-2 text-blue-500">
                            ✓ Hilfetext aktiv – erscheint im Editor als ⓘ-Tooltip
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Row 4: Pflichtfeld */}
                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={attr.required}
                          onChange={(e) => updateAttr(idx, 'required', e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">Pflichtfeld</span>
                        <HelpTooltip
                          title="Pflichtfeld"
                          text="Pflichtfelder werden mit einem roten Sternchen (*) gekennzeichnet. Die Validierung erfolgt manuell – Doorstop erzwingt keine Eingabe."
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
