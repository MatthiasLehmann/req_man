import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, XCircle, AlertCircle, X, GitCommit,
  Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { createValidation } from '../../api/client';
import { ValidationChecklist, ValidationStatus, ValidationCreateResponse } from '../../types';

// ─── Standard-Checkliste ──────────────────────────────────────────────────────

function defaultChecklist(): ValidationChecklist {
  return {
    requirement_complete: { value: false, note: '' },
    acceptance_criteria_defined: { value: false, note: '' },
    implementation_linked: { value: false, refs: [], note: '' },
    tests_passed: { value: false, coverage_percent: undefined, test_run_id: '', note: '' },
    peer_review: {
      value: false,
      reviewer_username: '',
      reviewer_display_name: '',
      review_date: '',
      note: '',
    },
    security_audit: { value: false, applicable: true, note: '' },
  };
}

const CHECKLIST_LABELS: Record<keyof ValidationChecklist, string> = {
  requirement_complete: 'Anforderung vollständig und eindeutig formuliert',
  acceptance_criteria_defined: 'Akzeptanzkriterien definiert',
  implementation_linked: 'Implementierung verlinkt',
  tests_passed: 'Tests existieren und sind bestanden',
  peer_review: 'Peer-Review durchgeführt',
  security_audit: 'Sicherheitsaudit',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  uid: string;
  onClose: () => void;
  onSuccess?: (result: ValidationCreateResponse) => void;
}

// ─── Hilfkomponente: Einzelne Checklisten-Zeile ──────────────────────────────

interface CheckRowProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  notApplicable?: boolean;
  onToggleNA?: () => void;
  children?: React.ReactNode;
}

function CheckRow({ label, checked, onToggle, notApplicable, onToggleNA, children }: CheckRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={clsx(
      'rounded-lg border transition-colors',
      notApplicable
        ? 'bg-gray-50 border-gray-200 opacity-60'
        : checked
          ? 'bg-green-50 border-green-200'
          : 'bg-white border-gray-200',
    )}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={notApplicable}
          className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
        />
        <span className={clsx(
          'flex-1 text-sm',
          notApplicable ? 'text-gray-400 line-through' : 'text-gray-700',
        )}>
          {label}
        </span>

        {onToggleNA && (
          <button
            type="button"
            onClick={onToggleNA}
            className={clsx(
              'text-xs px-1.5 py-0.5 rounded border transition-colors shrink-0',
              notApplicable
                ? 'bg-gray-200 text-gray-600 border-gray-300'
                : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-100',
            )}
            title="N/A – nicht anwendbar"
          >
            N/A
          </button>
        )}

        {children && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {children && expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Haupt-Dialog ─────────────────────────────────────────────────────────────

export default function ValidationDialog({ projectId, uid, onClose, onSuccess }: Props) {
  const qc = useQueryClient();

  const [status, setStatus] = useState<ValidationStatus>('APPROVED');
  const [checklist, setChecklist] = useState<ValidationChecklist>(defaultChecklist());
  const [summary, setSummary] = useState('');
  const [skipDoorstopCheck, setSkipDoorstopCheck] = useState(false);
  const [newRef, setNewRef] = useState('');

  const updateChecklist = <K extends keyof ValidationChecklist>(
    key: K,
    patch: Partial<ValidationChecklist[K]>,
  ) => {
    setChecklist((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const addRef = () => {
    const v = newRef.trim();
    if (!v) return;
    const refs = [...(checklist.implementation_linked.refs || [])];
    if (!refs.includes(v)) refs.push(v);
    updateChecklist('implementation_linked', { refs });
    setNewRef('');
  };

  const removeRef = (ref: string) => {
    updateChecklist('implementation_linked', {
      refs: (checklist.implementation_linked.refs || []).filter((r) => r !== ref),
    });
  };

  const allRequired = [
    checklist.requirement_complete.value,
    checklist.acceptance_criteria_defined.value,
  ].every(Boolean);

  const mutation = useMutation({
    mutationFn: () =>
      createValidation(projectId, uid, {
        status,
        checklist,
        summary: summary.trim(),
        skip_doorstop_check: skipDoorstopCheck,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['validation-latest', projectId, uid] });
      qc.invalidateQueries({ queryKey: ['validation-history', projectId, uid] });
      toast.success(`Validierung gespeichert – Commit ${res.data.commit_hash_short}`);
      onSuccess?.(res.data);
      onClose();
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.detail || 'Fehler bei der Validierung');
    },
  });

  const handleSubmit = () => {
    if (!summary.trim()) {
      toast.error('Bitte eine Zusammenfassung eingeben');
      return;
    }
    mutation.mutate();
  };

  const statusOptions: { value: ValidationStatus; label: string; Icon: typeof CheckCircle; color: string }[] = [
    { value: 'APPROVED', label: 'Genehmigt', Icon: CheckCircle, color: 'text-green-600' },
    { value: 'REJECTED', label: 'Abgelehnt', Icon: XCircle, color: 'text-red-600' },
    { value: 'NEEDS_REVISION', label: 'Revision nötig', Icon: AlertCircle, color: 'text-yellow-600' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-primary-600" />
            <h2 className="text-sm font-semibold text-gray-800">Validierung</h2>
            <span className="font-mono text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{uid}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Status */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Validierungsstatus</p>
            <div className="flex gap-2">
              {statusOptions.map(({ value, label, Icon, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-colors',
                    status === value
                      ? 'border-current ring-2 ring-offset-1 ring-current bg-white'
                      : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50',
                    status === value && color,
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Checkliste */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Checkliste</p>
            <div className="space-y-2">

              {/* Anforderung vollständig */}
              <CheckRow
                label={CHECKLIST_LABELS.requirement_complete}
                checked={checklist.requirement_complete.value}
                onToggle={() => updateChecklist('requirement_complete', { value: !checklist.requirement_complete.value })}
              >
                <input
                  className="input text-xs py-1"
                  placeholder="Anmerkung (optional)"
                  value={checklist.requirement_complete.note || ''}
                  onChange={(e) => updateChecklist('requirement_complete', { note: e.target.value })}
                />
              </CheckRow>

              {/* Akzeptanzkriterien */}
              <CheckRow
                label={CHECKLIST_LABELS.acceptance_criteria_defined}
                checked={checklist.acceptance_criteria_defined.value}
                onToggle={() => updateChecklist('acceptance_criteria_defined', { value: !checklist.acceptance_criteria_defined.value })}
              >
                <input
                  className="input text-xs py-1"
                  placeholder="Anmerkung (optional)"
                  value={checklist.acceptance_criteria_defined.note || ''}
                  onChange={(e) => updateChecklist('acceptance_criteria_defined', { note: e.target.value })}
                />
              </CheckRow>

              {/* Implementierung verlinkt */}
              <CheckRow
                label={CHECKLIST_LABELS.implementation_linked}
                checked={checklist.implementation_linked.value}
                onToggle={() => updateChecklist('implementation_linked', { value: !checklist.implementation_linked.value })}
              >
                <div className="flex flex-wrap gap-1 mb-1">
                  {(checklist.implementation_linked.refs || []).map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 font-mono"
                    >
                      {r}
                      <button onClick={() => removeRef(r)} className="hover:text-red-500">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    className="input text-xs py-1 flex-1 font-mono"
                    placeholder="z.B. SWR-007"
                    value={newRef}
                    onChange={(e) => setNewRef(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addRef()}
                  />
                  <button onClick={addRef} className="btn-secondary text-xs py-1 shrink-0">+ Ref</button>
                </div>
              </CheckRow>

              {/* Tests */}
              <CheckRow
                label={CHECKLIST_LABELS.tests_passed}
                checked={checklist.tests_passed.value}
                onToggle={() => updateChecklist('tests_passed', { value: !checklist.tests_passed.value })}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Coverage %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="input text-xs py-1"
                      placeholder="87"
                      value={checklist.tests_passed.coverage_percent ?? ''}
                      onChange={(e) => updateChecklist('tests_passed', {
                        coverage_percent: e.target.value ? parseInt(e.target.value) : undefined,
                      })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Test-Run-ID</label>
                    <input
                      className="input text-xs py-1"
                      placeholder="ci-run-1337"
                      value={checklist.tests_passed.test_run_id || ''}
                      onChange={(e) => updateChecklist('tests_passed', { test_run_id: e.target.value })}
                    />
                  </div>
                </div>
              </CheckRow>

              {/* Peer-Review */}
              <CheckRow
                label={CHECKLIST_LABELS.peer_review}
                checked={checklist.peer_review.value}
                onToggle={() => updateChecklist('peer_review', { value: !checklist.peer_review.value })}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Reviewer</label>
                    <input
                      className="input text-xs py-1"
                      placeholder="jane.doe"
                      value={checklist.peer_review.reviewer_username || ''}
                      onChange={(e) => updateChecklist('peer_review', { reviewer_username: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Datum</label>
                    <input
                      type="date"
                      className="input text-xs py-1"
                      value={checklist.peer_review.review_date || ''}
                      onChange={(e) => updateChecklist('peer_review', { review_date: e.target.value })}
                    />
                  </div>
                </div>
              </CheckRow>

              {/* Sicherheitsaudit */}
              <CheckRow
                label={CHECKLIST_LABELS.security_audit}
                checked={checklist.security_audit.value}
                onToggle={() => updateChecklist('security_audit', { value: !checklist.security_audit.value })}
                notApplicable={checklist.security_audit.applicable === false}
                onToggleNA={() => updateChecklist('security_audit', {
                  applicable: checklist.security_audit.applicable !== false ? false : true,
                  value: false,
                })}
              >
                <input
                  className="input text-xs py-1"
                  placeholder="Anmerkung / Begründung"
                  value={checklist.security_audit.note || ''}
                  onChange={(e) => updateChecklist('security_audit', { note: e.target.value })}
                />
              </CheckRow>

            </div>
          </div>

          {/* Zusammenfassung */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">
              Zusammenfassung <span className="text-red-400">*</span>
            </label>
            <textarea
              className="input text-sm py-2 resize-y min-h-[80px]"
              placeholder="Ergebnis der Validierung beschreiben …"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          {/* Erweiterte Optionen */}
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-400 hover:text-gray-600 select-none">
              Erweiterte Optionen
            </summary>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipDoorstopCheck}
                onChange={(e) => setSkipDoorstopCheck(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-600">doorstop check überspringen</span>
            </label>
          </details>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <p className="text-xs text-gray-400">
            {allRequired
              ? <span className="text-green-600">Pflichtfelder ausgefüllt</span>
              : 'Pflichtfelder unvollständig'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-xs py-2">
              Abbrechen
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending || !summary.trim()}
              className="btn-primary text-xs py-2 gap-1.5"
            >
              {mutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <GitCommit className="w-3 h-3" />}
              Speichern & Committen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
