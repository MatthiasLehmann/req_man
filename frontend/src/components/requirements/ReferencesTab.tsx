/**
 * ReferencesTab – Verwaltet die doorstop-`references`-Liste eines Items.
 *
 * Features:
 *  - Tabelle aller Referenzen mit Hash-Status-Anzeige
 *  - Inline-Bearbeitung (Klick auf Zeile)
 *  - Hinzufügen / Löschen
 *  - "Alle Hashes aktualisieren"-Button
 *  - Tab-Badge (Anzahl + ⚠ bei Problemen) wird per `onStatusChange` an ItemEditor gemeldet
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, RefreshCw, Loader2,
  FileText, AlertTriangle, CheckCircle2, XCircle, HelpCircle,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getReferences, updateReferences, checkReferences, refreshReferenceHashes,
} from '../../api/client';
import type { Reference, ReferenceWithStatus, ReferenceStatus } from '../../types';

// ─── Typen ────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  uid: string;
  canEdit: boolean;
  /** Meldet Anzahl + ob Probleme vorliegen an den übergeordneten Tab-Header. */
  onStatusChange?: (count: number, hasIssues: boolean) => void;
}

const EMPTY_REF: Reference = { type: 'file', path: '', keyword: '', sha: null };

// ─── Status-Helfer ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ReferenceStatus | undefined }) {
  switch (status) {
    case 'ok':      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'changed': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case 'missing': return <XCircle className="w-4 h-4 text-red-500" />;
    case 'no_hash': return <HelpCircle className="w-4 h-4 text-gray-400" />;
    case 'loading': return <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />;
    default:        return <HelpCircle className="w-4 h-4 text-gray-300" />;
  }
}

function statusLabel(status: ReferenceStatus | undefined): string {
  switch (status) {
    case 'ok':      return 'Hash stimmt überein';
    case 'changed': return 'Datei wurde geändert';
    case 'missing': return 'Datei nicht gefunden';
    case 'no_hash': return 'Kein Hash gespeichert';
    case 'loading': return 'Wird geprüft…';
    default:        return 'Ungeprüft';
  }
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function ReferencesTab({ projectId, uid, canEdit, onStatusChange }: Props) {
  const qc = useQueryClient();

  // Gespeicherte Referenzen laden
  const { data: refsRes, isLoading } = useQuery({
    queryKey: ['references', projectId, uid],
    queryFn: () => getReferences(projectId, uid),
  });

  const refs: Reference[] = refsRes?.data ?? [];

  // Hash-Statusprüfung (on-demand)
  const [statusMap, setStatusMap] = useState<Record<number, ReferenceWithStatus>>({});
  const [checking, setChecking] = useState(false);

  // Inline-Edit-State
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Reference>(EMPTY_REF);
  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState<Reference>(EMPTY_REF);

  // ── Hashes beim ersten Laden prüfen ──────────────────────────────────────
  const runCheck = useCallback(async () => {
    if (!uid) return;
    setChecking(true);
    try {
      const res = await checkReferences(projectId, uid);
      const map: Record<number, ReferenceWithStatus> = {};
      res.data.forEach((r, i) => { map[i] = r; });
      setStatusMap(map);
    } catch {
      // Fehler ignorieren – Status bleibt leer
    } finally {
      setChecking(false);
    }
  }, [projectId, uid]);

  useEffect(() => {
    if (refs.length > 0) {
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsRes]);

  // ── Badge-Infos an Elternkomponente melden ────────────────────────────────
  useEffect(() => {
    const count = refs.length;
    const hasIssues = Object.values(statusMap).some(
      (s) => s.status === 'changed' || s.status === 'missing',
    );
    onStatusChange?.(count, hasIssues);
  }, [refs.length, statusMap, onStatusChange]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (newRefs: Reference[]) => updateReferences(projectId, uid, newRefs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['references', projectId, uid] });
      qc.invalidateQueries({ queryKey: ['item', projectId, uid] });
      toast.success('Referenzen gespeichert');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler beim Speichern'),
  });

  const refreshMut = useMutation({
    mutationFn: () => refreshReferenceHashes(projectId, uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['references', projectId, uid] });
      toast.success('Hashes aktualisiert');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler beim Aktualisieren'),
  });

  // ── Hilfsfunktionen ───────────────────────────────────────────────────────
  const saveRefs = (newRefs: Reference[]) => saveMut.mutate(newRefs);

  const startEdit = (idx: number) => {
    setEditIdx(idx);
    setEditDraft({ ...refs[idx] });
    setAddingNew(false);
  };

  const cancelEdit = () => { setEditIdx(null); };

  const commitEdit = () => {
    if (editIdx === null) return;
    if (!editDraft.path.trim()) {
      toast.error('Pfad darf nicht leer sein.');
      return;
    }
    const updated = refs.map((r, i) => (i === editIdx ? { ...editDraft } : r));
    saveRefs(updated);
    setEditIdx(null);
  };

  const deleteRef = (idx: number) => {
    saveRefs(refs.filter((_, i) => i !== idx));
    setStatusMap((prev) => {
      const next: Record<number, ReferenceWithStatus> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
  };

  const startAdd = () => {
    setNewDraft(EMPTY_REF);
    setAddingNew(true);
    setEditIdx(null);
  };

  const cancelAdd = () => setAddingNew(false);

  const commitAdd = () => {
    if (!newDraft.path.trim()) {
      toast.error('Pfad darf nicht leer sein.');
      return;
    }
    saveRefs([...refs, { ...newDraft }]);
    setAddingNew(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Lade Referenzen…
      </div>
    );
  }

  const issueCount = Object.values(statusMap).filter(
    (s) => s.status === 'changed' || s.status === 'missing',
  ).length;

  return (
    <div className="space-y-4">

      {/* ── Kopfzeile ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-gray-700">Externe Referenzen</h4>
          {refs.length > 0 && (
            <span className="text-xs text-gray-400">({refs.length})</span>
          )}
          {issueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
                             bg-yellow-50 text-yellow-700 border border-yellow-200">
              <AlertTriangle className="w-3 h-3" />
              {issueCount} Problem{issueCount > 1 ? 'e' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {refs.length > 0 && (
            <button
              onClick={() => {
                runCheck();
                refreshMut.mutate();
              }}
              disabled={refreshMut.isPending || checking}
              className="btn-ghost text-xs py-1 flex items-center gap-1"
              title="SHA256 aller Referenzen neu berechnen und speichern"
            >
              {refreshMut.isPending || checking
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
              Hashes aktualisieren
            </button>
          )}
          {canEdit && !addingNew && (
            <button onClick={startAdd} className="btn-secondary text-xs py-1 flex items-center gap-1">
              <Plus className="w-3 h-3" />
              Hinzufügen
            </button>
          )}
        </div>
      </div>

      {/* ── Tabelle ── */}
      {refs.length === 0 && !addingNew ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 border-2
                         border-dashed border-gray-200 rounded-lg">
          <FileText className="w-8 h-8 mb-2 text-gray-300" />
          <p className="text-sm">Keine externen Referenzen verknüpft</p>
          {canEdit && (
            <button onClick={startAdd} className="mt-3 btn-secondary text-xs py-1">
              <Plus className="w-3 h-3" />
              Erste Referenz hinzufügen
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="px-3 py-2 text-left w-8">Status</th>
                <th className="px-3 py-2 text-left">Keyword</th>
                <th className="px-3 py-2 text-left">Pfad</th>
                <th className="px-3 py-2 text-left w-16">Typ</th>
                {canEdit && <th className="px-3 py-2 w-20" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {refs.map((ref, idx) => {
                const statusInfo = statusMap[idx];
                const status = checking ? 'loading' : statusInfo?.status;

                if (editIdx === idx) {
                  // ── Inline-Edit-Zeile ─────────────────────────────────
                  return (
                    <tr key={idx} className="bg-primary-50">
                      <td className="px-3 py-2 align-top">
                        <StatusIcon status={status} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          autoFocus
                          className="input text-xs py-1 w-full"
                          placeholder="Keyword"
                          value={editDraft.keyword}
                          onChange={(e) => setEditDraft((d) => ({ ...d, keyword: e.target.value }))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input text-xs py-1 w-full font-mono"
                          placeholder="Pfad relativ zum Projektordner"
                          value={editDraft.path}
                          onChange={(e) => setEditDraft((d) => ({ ...d, path: e.target.value }))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className="input text-xs py-1 w-full"
                          value={editDraft.type}
                          onChange={(e) => setEditDraft((d) => ({ ...d, type: e.target.value }))}
                        >
                          <option value="file">file</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={commitEdit}
                            className="p-1 rounded text-green-600 hover:bg-green-100 transition-colors"
                            title="Speichern"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors"
                            title="Abbrechen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // ── Normale Tabellenzeile ─────────────────────────────
                return (
                  <tr
                    key={idx}
                    className={clsx(
                      'group transition-colors',
                      canEdit && 'cursor-pointer hover:bg-gray-50',
                    )}
                    onClick={() => canEdit && startEdit(idx)}
                  >
                    <td className="px-3 py-2.5" title={statusLabel(status)}>
                      <StatusIcon status={status} />
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 font-mono text-xs">
                      {ref.keyword || <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 font-mono text-xs max-w-xs truncate">
                      <span title={ref.path}>{ref.path}</span>
                      {status === 'changed' && (
                        <span className="ml-2 text-yellow-600 text-[10px] not-italic font-sans">
                          Datei geändert
                        </span>
                      )}
                      {status === 'missing' && (
                        <span className="ml-2 text-red-500 text-[10px] not-italic font-sans">
                          Nicht gefunden
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{ref.type}</td>
                    {canEdit && (
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(idx); }}
                            className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Bearbeiten"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteRef(idx); }}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {/* ── Neue-Referenz-Zeile ── */}
              {addingNew && (
                <tr className="bg-green-50 border-t border-green-100">
                  <td className="px-3 py-2">
                    <Plus className="w-4 h-4 text-green-400" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      autoFocus
                      className="input text-xs py-1 w-full"
                      placeholder="Keyword"
                      value={newDraft.keyword}
                      onChange={(e) => setNewDraft((d) => ({ ...d, keyword: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="input text-xs py-1 w-full font-mono"
                      placeholder="z.B. src/main.py oder docs/spec.md"
                      value={newDraft.path}
                      onChange={(e) => setNewDraft((d) => ({ ...d, path: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitAdd();
                        if (e.key === 'Escape') cancelAdd();
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      className="input text-xs py-1 w-full"
                      value={newDraft.type}
                      onChange={(e) => setNewDraft((d) => ({ ...d, type: e.target.value }))}
                    >
                      <option value="file">file</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={commitAdd}
                        className="p-1 rounded text-green-600 hover:bg-green-100 transition-colors"
                        title="Hinzufügen"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={cancelAdd}
                        className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors"
                        title="Abbrechen"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>
      )}

      {/* ── SHA-Info ── */}
      {refs.length > 0 && (
        <p className="text-[11px] text-gray-400">
          Pfade sind relativ zum Projektstamm. SHA256 wird beim Speichern automatisch berechnet.
        </p>
      )}
    </div>
  );
}
