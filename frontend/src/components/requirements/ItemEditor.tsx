import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, X, Link2, Tag, ChevronDown, ChevronUp, Loader2, GitCommit, History, Stamp, Paperclip, AlertTriangle, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { getItem, updateItem, getAttributes, getLatestValidation, reviewItem } from '../../api/client';
import { Item, AttributeDefinition, ValidationStatusInfo } from '../../types';
import { useAuthStore } from '../../store/authStore';
import MarkdownEditor from './MarkdownEditor';
import HelpTooltip, { FieldLabel } from '../ui/HelpTooltip';
import { DOORSTOP_HELP } from '../ui/doorstopHelp';
import ValidationBadge from '../validation/ValidationBadge';
import ValidationDialog from '../validation/ValidationDialog';
import ValidationHistory from '../validation/ValidationHistory';
import ReferencesTab from './ReferencesTab';
import AiQualityTab from './AiQualityTab';
import { useAiQuality } from '../../hooks/useAiQuality';

interface Props {
  projectId: string;
  uid: string;
  onClose: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export default function ItemEditor({ projectId, uid, onClose, onDirtyChange }: Props) {
  const { user } = useAuthStore();
  const canEdit = user?.role !== 'viewer';
  const qc = useQueryClient();

  const { data: itemRes, isLoading } = useQuery({
    queryKey: ['item', projectId, uid],
    queryFn: () => getItem(projectId, uid),
    enabled: !!uid,
  });

  const { data: attrsRes } = useQuery({
    queryKey: ['attributes'],
    queryFn: getAttributes,
  });
  const customAttrs: AttributeDefinition[] = attrsRes?.data || [];

  const { data: validationRes } = useQuery<ValidationStatusInfo>({
    queryKey: ['validation-latest', projectId, uid],
    queryFn: () => getLatestValidation(projectId, uid).then((r) => r.data),
    enabled: !!uid,
  });
  const validationInfo = validationRes ?? null;

  const item: Item | undefined = itemRes?.data;

  const [form, setForm] = useState<Partial<Item>>({});
  const [dirty, setDirty] = useState(false);
  const [newLink, setNewLink] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'references' | 'validation' | 'ai-quality'>('details');

  // KI-Qualitäts-Badge
  const { data: aiQualityResult } = useAiQuality(projectId, uid);

  // Badge-State für Referenzen-Tab
  const [refCount, setRefCount] = useState(0);
  const [refHasIssues, setRefHasIssues] = useState(false);
  const onRefStatusChange = useCallback((count: number, hasIssues: boolean) => {
    setRefCount(count);
    setRefHasIssues(hasIssues);
  }, []);

  useEffect(() => {
    if (item) {
      setForm({ ...item });
      setDirty(false);
    }
  }, [item]);

  // Elternkomponente über dirty-Status informieren
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Browser-Tab schließen / neu laden: Warnung anzeigen wenn ungespeichert
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = ''; // Löst Browser-Warndialog aus
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const updateMut = useMutation({
    mutationFn: (data: object) => updateItem(projectId, uid, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['item', projectId, uid] });
      qc.invalidateQueries({ queryKey: ['items'] });
      setForm(res.data);
      setDirty(false);
      toast.success('Gespeichert');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler beim Speichern'),
  });

  const reviewMut = useMutation({
    mutationFn: () => reviewItem(projectId, uid),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['item', projectId, uid] });
      qc.invalidateQueries({ queryKey: ['items'] });
      setForm(res.data);
      toast.success('Review-Stempel gesetzt');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler beim Stempeln'),
  });

  const setField = (key: keyof Item, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const setCustomAttr = (key: string, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      custom_attributes: { ...(prev.custom_attributes || {}), [key]: value },
    }));
    setDirty(true);
  };

  const addLink = () => {
    const trimmed = newLink.trim();
    if (!trimmed) return;
    const links = [...(form.links || [])];
    if (!links.includes(trimmed)) {
      links.push(trimmed);
      setField('links', links);
    }
    setNewLink('');
  };

  const removeLink = (link: string) => {
    setField('links', (form.links || []).filter((l) => l !== link));
  };

  const handleSave = () => {
    updateMut.mutate({
      text: form.text,
      level: form.level,
      header: form.header,
      normative: form.normative,
      active: form.active,
      derived: form.derived,
      links: form.links,
      custom_attributes: form.custom_attributes,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {/* UID mit Tooltip */}
          <div className="flex items-center gap-1.5">
            <h3 className="font-mono font-semibold text-gray-800">{uid}</h3>
            <HelpTooltip
              title={DOORSTOP_HELP.uid.title}
              text={DOORSTOP_HELP.uid.text}
              placement="bottom"
            />
          </div>
          {dirty && <span className="badge-yellow text-xs">Ungespeichert</span>}
          {item.reviewed && item.reviewed_current === true && <span className="badge-green text-xs">Reviewed</span>}
          {item.reviewed && item.reviewed_current === false && <span className="badge-yellow text-xs">Veraltet</span>}
          {!item.active && <span className="badge-gray text-xs">Inaktiv</span>}
          <ValidationBadge info={validationInfo} size="sm" />
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={handleSave}
                disabled={!dirty || updateMut.isPending}
                className="btn-primary text-xs py-1.5"
              >
                {updateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Speichern
              </button>
              <button
                onClick={() => setShowValidationDialog(true)}
                className="btn-secondary text-xs py-1.5"
                title="Review starten"
              >
                <GitCommit className="w-3 h-3" />
                Review
              </button>
            </>
          )}
          <button onClick={onClose} className="btn-ghost text-xs py-1.5">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={() => setActiveTab('details')}
          className={clsx(
            'px-4 py-2 text-xs font-medium border-b-2 transition-colors',
            activeTab === 'details'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab('references')}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
            activeTab === 'references'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <Paperclip className="w-3 h-3" />
          Referenzen
          {refCount > 0 && !refHasIssues && (
            <span className="ml-1 text-[10px] px-1 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {refCount}
            </span>
          )}
          {refHasIssues && (
            <span className="ml-1 flex items-center gap-0.5 text-[10px] px-1 py-0.5
                              rounded-full bg-yellow-100 text-yellow-700">
              <AlertTriangle className="w-2.5 h-2.5" />
              {refCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('validation')}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
            activeTab === 'validation'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <History className="w-3 h-3" />
          Reviews
        </button>
        {!item?.header && (
          <button
            onClick={() => setActiveTab('ai-quality')}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
              activeTab === 'ai-quality'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <Sparkles className="w-3 h-3" />
            KI-Qualität
            {aiQualityResult && (
              <span
                className={clsx(
                  'ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                  aiQualityResult.score.overall >= 70
                    ? 'bg-green-100 text-green-700'
                    : aiQualityResult.score.overall >= 40
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700',
                )}
              >
                {aiQualityResult.score.overall}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── Body ── */}
      {activeTab === 'ai-quality' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <AiQualityTab projectId={projectId} uid={uid} />
        </div>
      ) : activeTab === 'validation' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <ValidationHistory projectId={projectId} uid={uid} />
        </div>
      ) : activeTab === 'references' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <ReferencesTab
            projectId={projectId}
            uid={uid}
            canEdit={canEdit}
            onStatusChange={onRefStatusChange}
          />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ── Metaattribute ── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Ebene */}
          <div>
            <FieldLabel
              helpTitle={DOORSTOP_HELP.level.title}
              helpText={DOORSTOP_HELP.level.text}
            >
              Ebene
            </FieldLabel>
            <input
              className="input text-sm py-1.5"
              value={form.level || ''}
              onChange={(e) => setField('level', e.target.value)}
              disabled={!canEdit}
              placeholder="1.1.2"
            />
          </div>

          {/* Boolean-Flags */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 items-center pt-5">
            <CheckboxField
              label="Aktiv"
              checked={!!form.active}
              onChange={(v) => setField('active', v)}
              disabled={!canEdit}
              helpTitle={DOORSTOP_HELP.active.title}
              helpText={DOORSTOP_HELP.active.text}
            />
            <CheckboxField
              label="Normativ"
              checked={!!form.normative}
              onChange={(v) => setField('normative', v)}
              disabled={!canEdit}
              helpTitle={DOORSTOP_HELP.normative.title}
              helpText={DOORSTOP_HELP.normative.text}
            />
            <CheckboxField
              label="Abschnitt"
              checked={!!form.header}
              onChange={(v) => setField('header', v)}
              disabled={!canEdit}
              helpTitle={DOORSTOP_HELP.header.title}
              helpText={DOORSTOP_HELP.header.text}
            />
            <CheckboxField
              label="Abgeleitet"
              checked={!!form.derived}
              onChange={(v) => setField('derived', v)}
              disabled={!canEdit}
              helpTitle={DOORSTOP_HELP.derived.title}
              helpText={DOORSTOP_HELP.derived.text}
            />
          </div>
        </div>

        {/* ── Review-Status ── */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <FieldLabel
              helpTitle={DOORSTOP_HELP.reviewed.title}
              helpText={DOORSTOP_HELP.reviewed.text}
              placement="right"
            >
              Review-Status
            </FieldLabel>
            {canEdit && (
              <button
                onClick={() => reviewMut.mutate()}
                disabled={reviewMut.isPending || dirty}
                title={dirty ? 'Zuerst speichern' : 'Anforderung jetzt stempeln (doorstop review)'}
                className={clsx(
                  'flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors',
                  dirty
                    ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                    : 'text-primary-600 border-primary-200 hover:bg-primary-50',
                )}
              >
                {reviewMut.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Stamp className="w-3 h-3" />}
                Stempeln
              </button>
            )}
          </div>
          {item.reviewed && item.reviewed_current === true ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="badge-green">✓ Reviewed</span>
              <span className="font-mono text-xs text-gray-400 truncate">{item.reviewed}</span>
            </div>
          ) : item.reviewed && item.reviewed_current === false ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="badge-yellow">⚠ Veraltet</span>
              <span className="font-mono text-xs text-gray-400 truncate">{item.reviewed}</span>
              <span className="text-xs text-yellow-600">Inhalt geändert seit letztem Review</span>
            </div>
          ) : (
            <span className="badge-yellow mt-1 inline-flex">Ausstehend</span>
          )}
        </div>

        {/* ── Anforderungstext ── */}
        <div>
          <FieldLabel
            helpTitle={DOORSTOP_HELP.text.title}
            helpText={DOORSTOP_HELP.text.text}
          >
            Anforderungstext
          </FieldLabel>
          <MarkdownEditor
            value={form.text || ''}
            onChange={(val) => setField('text', val)}
            readOnly={!canEdit}
            minHeight="250px"
          />
        </div>

        {/* ── Verlinkungen ── */}
        <div>
          <FieldLabel
            helpTitle={DOORSTOP_HELP.links.title}
            helpText={DOORSTOP_HELP.links.text}
            placement="right"
          >
            Verlinkungen ({(form.links || []).length})
          </FieldLabel>

          <div className="flex flex-wrap gap-2 mb-2 mt-1">
            {(form.links || []).length === 0 && (
              <span className="text-xs text-gray-400 italic">Keine Verlinkungen vorhanden</span>
            )}
            {(form.links || []).map((link) => (
              <span
                key={link}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-mono border border-blue-100"
              >
                <Link2 className="w-2.5 h-2.5 shrink-0" />
                {link}
                {canEdit && (
                  <button
                    onClick={() => removeLink(link)}
                    className="hover:text-red-500 transition-colors"
                    title={`${link} entfernen`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>

          {canEdit && (
            <div className="flex gap-2">
              <input
                className="input text-sm py-1 flex-1 font-mono"
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLink()}
                placeholder="z.B. SYS-001, SPEC-042 …"
              />
              <button onClick={addLink} className="btn-secondary text-xs py-1 shrink-0">
                + Hinzufügen
              </button>
            </div>
          )}
        </div>

        {/* ── Benutzerdefinierte Attribute ── */}
        {customAttrs.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCustom(!showCustom)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-gray-600
                         bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <Tag className="w-3.5 h-3.5 text-gray-500" />
              Benutzerdefinierte Attribute
              <span className="ml-auto flex items-center gap-1 text-gray-400">
                {customAttrs.length} Attribute
                {showCustom ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </span>
            </button>

            {showCustom && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white">
                {customAttrs.map((attr) => (
                  <CustomAttributeField
                    key={attr.key}
                    attr={attr}
                    value={(form.custom_attributes || {})[attr.key]}
                    onChange={(val) => setCustomAttr(attr.key, val)}
                    disabled={!canEdit}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Validierungs-Dialog ── */}
      {showValidationDialog && (
        <ValidationDialog
          projectId={projectId}
          uid={uid}
          onClose={() => setShowValidationDialog(false)}
          onSuccess={() => setActiveTab('validation')}
        />
      )}
    </div>
  );
}

// ─── Hilfkomponente: Checkbox mit Tooltip ─────────────────────────────────────

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  helpTitle: string;
  helpText: string;
}

function CheckboxField({ label, checked, onChange, disabled, helpTitle, helpText }: CheckboxFieldProps) {
  return (
    <label className={clsx(
      'inline-flex items-center gap-1.5 select-none',
      disabled ? 'cursor-default opacity-70' : 'cursor-pointer'
    )}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      <span className="text-sm text-gray-700">{label}</span>
      <HelpTooltip title={helpTitle} text={helpText} placement="top" />
    </label>
  );
}

// ─── Hilfkomponente: Benutzerdefiniertes Attributfeld ────────────────────────

interface CustomAttrProps {
  attr: AttributeDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}

function CustomAttributeField({ attr, value, onChange, disabled }: CustomAttrProps) {
  const strVal = String(value ?? attr.default_value ?? '');

  return (
    <div>
      <FieldLabel
        helpTitle={attr.display_name}
        helpText={attr.help_text ?? undefined}
        required={attr.required}
        placement="top"
      >
        {attr.display_name}
      </FieldLabel>

      {attr.attr_type === 'boolean' ? (
        <label className={clsx(
          'inline-flex items-center gap-2 mt-1',
          disabled ? 'cursor-default' : 'cursor-pointer'
        )}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-primary-600"
          />
          <span className="text-sm text-gray-600">
            {value ? 'Ja' : 'Nein'}
          </span>
        </label>

      ) : attr.attr_type === 'enum' && attr.possible_values ? (
        <select
          className="input text-sm py-1"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">— wählen —</option>
          {attr.possible_values.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

      ) : attr.attr_type === 'integer' ? (
        <input
          type="number"
          className="input text-sm py-1"
          value={Number(value ?? attr.default_value ?? 0)}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          disabled={disabled}
        />

      ) : attr.attr_type === 'text' ? (
        <textarea
          className="input text-sm py-1.5 resize-y min-h-[60px]"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={attr.help_text ? '' : `${attr.display_name} eingeben …`}
        />

      ) : attr.attr_type === 'list' ? (
        <input
          type="text"
          className="input text-sm py-1"
          value={strVal}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          disabled={disabled}
          placeholder="Wert1, Wert2, Wert3"
          title="Mehrere Werte kommagetrennt eingeben"
        />

      ) : (
        <input
          type="text"
          className="input text-sm py-1"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={`${attr.display_name} eingeben …`}
        />
      )}
    </div>
  );
}
