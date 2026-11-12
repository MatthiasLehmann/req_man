import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, ClipboardPaste, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Info, RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  getAttributes, parseImportFile, validateImport, runImport, ImportCheck,
} from '../../../../shared/api/client';
import type { AttributeDefinition } from '../../../../shared/types';
import {
  parseClipboardTable, targetFields, initialMapping, looksLikeHeaderRow, rememberMapping, isIdColumn,
} from './tableParsing';

interface Props {
  projectId: string;
  prefix: string;
  onClose: () => void;
  onImported: (uids: string[]) => void;
  /** Bereits eingefügte Tabelle (Strg+V direkt in der Anforderungsliste) */
  initialTable?: string[][] | null;
}

/**
 * Anforderungen aus Excel/CSV übernehmen: einfügen (Strg+V) oder Datei wählen,
 * Spalten zuordnen, jede Zeile wird vor dem Import gegen die Attributregeln geprüft.
 * Importiert wird nur, wenn alle Zeilen gültig sind.
 */
export default function ImportDialog({ projectId, prefix, onClose, onImported, initialTable }: Props) {
  const qc = useQueryClient();
  const { data: attrsRes } = useQuery({ queryKey: ['attributes'], queryFn: getAttributes });
  const attrs: AttributeDefinition[] = attrsRes?.data || [];
  const fields = useMemo(() => targetFields(prefix, attrs), [prefix, attrs]);

  const [table, setTable] = useState<string[][] | null>(null);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [mapping, setMapping] = useState<string[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const headers = table && hasHeaderRow ? table[0] : null;
  const body = useMemo(() => (table ? (hasHeaderRow ? table.slice(1) : table) : []), [table, hasHeaderRow]);
  const width = table?.[0]?.length ?? 0;

  // ── Tabelle übernehmen ─────────────────────────────────────────────────────
  const loadTable = (rows: string[][]) => {
    if (!rows.length) { toast.error('Keine Tabelle erkannt'); return; }
    const headerRow = looksLikeHeaderRow(rows[0], fields);
    setTable(rows);
    setHasHeaderRow(headerRow);
    setMapping(initialMapping(prefix, headerRow ? rows[0] : null, rows[0].length, fields));
    setCheck(null);
  };

  const toggleHeaderRow = (v: boolean) => {
    setHasHeaderRow(v);
    if (table) setMapping(initialMapping(prefix, v ? table[0] : null, width, fields));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    e.preventDefault();
    loadTable(parseClipboardTable(text));
  };

  const handleFile = async (file: File) => {
    setLoadingFile(true);
    try {
      const res = await parseImportFile(projectId, prefix, file);
      loadTable(res.data.rows);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Datei konnte nicht gelesen werden');
    } finally {
      setLoadingFile(false);
    }
  };

  useEffect(() => { if (!table) pasteRef.current?.focus(); }, [table]);

  // Direkt eingefügte Tabelle übernehmen, sobald die Attribute geladen sind
  const initialDone = useRef(false);
  useEffect(() => {
    if (initialDone.current || !initialTable?.length || !attrsRes) return;
    initialDone.current = true;
    loadTable(initialTable);
  }, [initialTable, attrsRes]);

  // ── Zeilen für das Backend (nur zugeordnete Spalten) ───────────────────────
  const rows = useMemo(() => body.map((r) => {
    const out: Record<string, string> = {};
    mapping.forEach((key, i) => { if (key) out[key] = r[i] ?? ''; });
    return out;
  }), [body, mapping]);

  const textMapped = mapping.includes('text') || mapping.includes('header');

  // ── Prüfen (verzögert bei jeder Änderung) ──────────────────────────────────
  useEffect(() => {
    if (!table || !textMapped || !rows.length) { setCheck(null); setCheckError(null); return; }
    let cancelled = false;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await validateImport(projectId, prefix, rows);
        if (!cancelled) { setCheck(res.data); setCheckError(null); }
      } catch (e: any) {
        if (!cancelled) { setCheck(null); setCheckError(e.response?.data?.detail || 'Prüfung fehlgeschlagen'); }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [rows, projectId, prefix, table, textMapped]);

  const setColumn = (col: number, key: string) => {
    setMapping((prev) => prev.map((k, i) => (i === col ? key : k === key && key ? '' : k)));
  };

  const editCell = (rowIdx: number, col: number, value: string) => {
    setTable((prev) => {
      if (!prev) return prev;
      const next = prev.map((r) => [...r]);
      next[rowIdx + (hasHeaderRow ? 1 : 0)][col] = value;
      return next;
    });
  };

  const unmappedRequired = fields.filter((f) => f.required && f.key.startsWith('attr:') && !mapping.includes(f.key));
  const hasDefault = (f: { key: string }) => {
    const d = attrs.find((a) => `attr:${a.key}` === f.key)?.default_value;
    return d !== undefined && d !== null && d !== '';
  };
  const missingRequired = unmappedRequired.filter((f) => !hasDefault(f));
  const defaultedRequired = unmappedRequired.filter(hasDefault);

  const canImport = !!check && check.invalid === 0 && check.valid > 0 && !checking && !importing;

  const doImport = async () => {
    setImporting(true);
    try {
      const res = await runImport(projectId, prefix, rows);
      if (headers) rememberMapping(prefix, headers, mapping);
      qc.invalidateQueries({ queryKey: ['items', projectId, prefix] });
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      toast.success(`${res.data.created.length} Anforderungen importiert`);
      onImported(res.data.created);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Import fehlgeschlagen');
    } finally {
      setImporting(false);
    }
  };

  const visibleRows = body
    .map((r, i) => ({ r, i, res: check?.rows[i] }))
    .filter(({ res }) => !onlyErrors || (res && res.errors.length > 0));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Kopf */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-800">Anforderungen aus Excel übernehmen</h2>
            <p className="text-xs text-gray-500">in Dokument <span className="font-mono">{prefix}</span></p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>

        {!table ? (
          // ── Schritt 1: Daten holen ───────────────────────────────────────────
          <div className="p-6 space-y-4 overflow-y-auto">
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>In Excel die Zeilen markieren (gern mit Überschriftenzeile) und <kbd className="px-1 py-0.5 text-xs border border-gray-300 rounded bg-gray-50 font-mono">Strg</kbd>+<kbd className="px-1 py-0.5 text-xs border border-gray-300 rounded bg-gray-50 font-mono">C</kbd> drücken.</li>
              <li>Hier ins Feld klicken und <kbd className="px-1 py-0.5 text-xs border border-gray-300 rounded bg-gray-50 font-mono">Strg</kbd>+<kbd className="px-1 py-0.5 text-xs border border-gray-300 rounded bg-gray-50 font-mono">V</kbd> drücken.</li>
              <li>Spalten zuordnen, Fehler direkt in der Vorschau korrigieren, importieren.</li>
            </ol>
            <textarea
              ref={pasteRef}
              onPaste={handlePaste}
              placeholder="Hier einfügen (Strg+V) …"
              className="w-full h-48 border-2 border-dashed border-gray-300 rounded-xl p-4 text-sm
                         focus:outline-none focus:border-primary-400 focus:bg-primary-50/30 resize-none"
              value=""
              onChange={() => { /* nur Einfügen */ }}
            />
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>oder</span>
              <button onClick={() => fileRef.current?.click()} disabled={loadingFile} className="btn-secondary text-sm py-1.5">
                {loadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                Datei wählen (.xlsx, .csv)
              </button>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
              />
            </div>
            <p className="text-xs text-gray-400 flex items-start gap-1.5">
              <ClipboardPaste className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              IDs aus der Tabelle werden nicht übernommen – ReqMan vergibt die UIDs selbst ({prefix}-…).
              Es wird erst importiert, wenn alle Zeilen die Regeln des Dokuments erfüllen.
            </p>
          </div>
        ) : (
          // ── Schritt 2: Zuordnen und prüfen ───────────────────────────────────
          <>
            <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-100 text-xs text-gray-600 shrink-0 flex-wrap">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasHeaderRow} onChange={(e) => toggleHeaderRow(e.target.checked)}
                       className="rounded border-gray-300 text-primary-600" />
                Erste Zeile enthält Spaltennamen
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)}
                       className="rounded border-gray-300 text-primary-600" />
                Nur fehlerhafte Zeilen
              </label>
              <button onClick={() => setTable(null)} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800">
                <RotateCcw className="w-3 h-3" /> Andere Daten einfügen
              </button>
              <div className="ml-auto flex items-center gap-3">
                {checking && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                {check && (
                  <>
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <CheckCircle className="w-3.5 h-3.5" /> {check.valid} gültig
                    </span>
                    {check.invalid > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" /> {check.invalid} fehlerhaft
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {(!textMapped || unmappedRequired.length > 0 || checkError) && (
              <div className="px-5 py-2 bg-yellow-50 border-b border-yellow-100 text-xs text-yellow-800 space-y-0.5 shrink-0">
                {!textMapped && <p>Bitte eine Spalte als <b>Anforderungstext</b> zuordnen.</p>}
                {missingRequired.length > 0 && (
                  <p>Pflichtattribute ohne Spalte: <b>{missingRequired.map((f) => f.label).join(', ')}</b> – bitte eine Spalte zuordnen, sonst ist jede Anforderung ungültig.</p>
                )}
                {defaultedRequired.length > 0 && (
                  <p className="text-yellow-700">Ohne Spalte, es gilt der Standardwert: <b>{defaultedRequired.map((f) => f.label).join(', ')}</b>.</p>
                )}
                {checkError && <p className="text-red-700">{checkError}</p>}
              </div>
            )}

            <div className="flex-1 overflow-auto">
              <table className="text-xs border-collapse min-w-full">
                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-gray-400 font-normal w-8">#</th>
                    {Array.from({ length: width }, (_, col) => {
                      const key = mapping[col] ?? '';
                      const field = fields.find((f) => f.key === key);
                      return (
                        <th key={col} className={clsx('px-1 py-1.5 text-left font-normal align-top',
                          key === 'text' ? 'min-w-[320px]' : 'min-w-[140px]')}>
                          {headers && (
                            <div className="text-[11px] text-gray-500 truncate mb-0.5" title={headers[col]}>
                              {headers[col] || <i>Spalte {col + 1}</i>}
                            </div>
                          )}
                          <select
                            value={key}
                            onChange={(e) => setColumn(col, e.target.value)}
                            className={clsx('w-full text-xs border rounded px-1 py-0.5',
                              key ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-400')}
                          >
                            <option value="">– nicht übernehmen –</option>
                            {fields.map((f) => (
                              <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                            ))}
                          </select>
                          {field?.hint && <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={field.hint}>{field.hint}</div>}
                          {!key && headers && isIdColumn(headers[col]) && (
                            <div className="text-[10px] text-gray-400 mt-0.5">UIDs vergibt ReqMan</div>
                          )}
                        </th>
                      );
                    })}
                    <th className="px-2 py-1.5 text-left text-gray-500 font-medium min-w-[220px]">Prüfung</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ r, i, res }) => {
                    const bad = !!res && res.errors.length > 0;
                    return (
                      <tr key={i} className={clsx('border-t border-gray-100 align-top', bad && 'bg-red-50/60')}>
                        <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                        {r.map((cell, col) => (
                          <td key={col} className={clsx('px-1 py-0.5', !mapping[col] && 'opacity-40')}>
                            <textarea
                              value={cell}
                              rows={Math.min(6, Math.max(1, cell.split('\n').length,
                                Math.ceil(cell.length / (mapping[col] === 'text' ? 55 : 22))))}
                              onChange={(e) => editCell(i, col, e.target.value)}
                              disabled={!mapping[col]}
                              className="w-full bg-transparent border border-transparent hover:border-gray-200
                                         focus:border-primary-300 focus:bg-white rounded px-1 py-0.5 resize-y
                                         focus:outline-none text-xs leading-snug"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1">
                          {!res ? null : bad ? (
                            <ul className="text-red-700 space-y-0.5">
                              {res.errors.map((er, k) => (
                                <li key={k} className="flex gap-1"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />{er}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="text-green-700 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> ok</span>
                              {res.notes.map((n, k) => (
                                <div key={k} className="text-gray-500 flex gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" />{n}</div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
              <p className="text-xs text-gray-500 flex-1">
                {check && check.invalid > 0
                  ? 'Importiert wird erst, wenn alle Zeilen gültig sind – Fehler direkt in der Tabelle korrigieren oder Spalten anders zuordnen.'
                  : 'Die Zuordnung der Spalten wird für dieses Dokument gemerkt.'}
              </p>
              <button onClick={onClose} className="btn-secondary text-sm py-2">Abbrechen</button>
              <button onClick={doImport} disabled={!canImport} className="btn-primary text-sm py-2 disabled:opacity-50">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                {check ? `${check.valid} Anforderungen importieren` : 'Importieren'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
