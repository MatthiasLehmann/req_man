import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { listDocuments, createDocument, parseImportFile, detectRoundtrip, exportForExcel } from '../../../../shared/api/client';
import type { Document } from '../../../../shared/types';
import ImportDialog from './ImportDialog';
import RoundtripDialog from './RoundtripDialog';

interface Props {
  projectId: string;
  /** Aktuell gewähltes Dokument – dann wird ohne Rückfrage dorthin importiert */
  selectedPrefix: string | null;
  /** Dokument nach dem Import (bzw. nach dem Anlegen) auswählen */
  onSelectDocument: (prefix: string) => void;
  className?: string;
}

/** Vorschlag für ein Präfix aus dem Dateinamen: "Anforderungen Kabine.xlsx" → "REQ" bzw. erste Buchstaben */
function suggestPrefix(fileName: string, existing: string[]) {
  const base = fileName.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  const candidates = ['REQ', base.slice(0, 3), 'SRS'].filter((c) => c.length >= 2);
  return candidates.find((c) => !existing.includes(c)) ?? '';
}

/**
 * Ein Klick: Excel-Datei wählen → (falls nötig) Dokument wählen oder anlegen → Vorschau mit Prüfung
 * → importieren. Die Prüfung aus U1 bleibt unverändert: importiert wird nur, wenn alle Zeilen gültig sind.
 */
export default function ExcelFileImport({ projectId, selectedPrefix, onSelectDocument, className }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [askTarget, setAskTarget] = useState(false);
  const [target, setTarget] = useState<{ prefix: string; table: string[][] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [roundtrip, setRoundtrip] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: docsRes } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => listDocuments(projectId),
    enabled: !!projectId,
  });
  const documents: Document[] = docsRes?.data || [];

  const openFor = async (prefix: string, f: File) => {
    setBusy(true);
    try {
      const res = await parseImportFile(projectId, prefix, f);
      if (!res.data.rows.length) { toast.error('Die Datei enthält keine Zeilen'); return; }
      onSelectDocument(prefix);
      setTarget({ prefix, table: res.data.rows });
      setAskTarget(false);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Datei konnte nicht gelesen werden');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File) => {
    setFile(f);
    // Aus ReqMan exportierte Datei (Rückweg)? Dann Änderungen zeigen statt neu importieren.
    setBusy(true);
    try {
      const res = await detectRoundtrip(projectId, f);
      if (res.data.prefix) {
        onSelectDocument(res.data.prefix);
        setRoundtrip(f);
        return;
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Datei konnte nicht gelesen werden');
      return;
    } finally {
      setBusy(false);
    }
    if (selectedPrefix) openFor(selectedPrefix, f);
    else setAskTarget(true);
  };

  const download = async () => {
    if (!selectedPrefix) return;
    setExporting(true);
    try {
      const res = await exportForExcel(projectId, selectedPrefix);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedPrefix}_zum_Bearbeiten.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Export fehlgeschlagen');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg',
          'bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-60')}
        title={selectedPrefix ? `Excel-Datei in ${selectedPrefix} laden` : 'Excel-Datei laden'}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
        Excel-Datei laden
      </button>
      {selectedPrefix && (
        <button
          onClick={download}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-green-600 text-green-700 bg-white hover:bg-green-50 transition-colors disabled:opacity-60"
          title={`${selectedPrefix} als Excel-Datei zum Bearbeiten und Kommentieren herunterladen – danach über „Excel-Datei laden“ zurückholen`}
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Für Excel exportieren
        </button>
      )}
      <input
        ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />

      {askTarget && file && (
        <TargetDialog
          fileName={file.name}
          documents={documents}
          busy={busy}
          onCancel={() => setAskTarget(false)}
          onChoose={async (prefix, isNew) => {
            if (isNew) {
              setBusy(true);
              try {
                await createDocument(projectId, { prefix, sep: '-' });
                qc.invalidateQueries({ queryKey: ['documents', projectId] });
                qc.invalidateQueries({ queryKey: ['project-structure', projectId] });
              } catch (e: any) {
                const d = e.response?.data?.detail;
                toast.error(Array.isArray(d) ? d[0]?.msg : d || 'Dokument konnte nicht angelegt werden');
                setBusy(false);
                return;
              }
              setBusy(false);
            }
            await openFor(prefix.toUpperCase(), file);
          }}
        />
      )}

      {target && (
        <ImportDialog
          projectId={projectId}
          prefix={target.prefix}
          initialTable={target.table}
          onClose={() => setTarget(null)}
          onImported={() => { setTarget(null); onSelectDocument(target.prefix); }}
        />
      )}

      {roundtrip && (
        <RoundtripDialog
          projectId={projectId}
          file={roundtrip}
          onClose={() => setRoundtrip(null)}
          onApplied={(prefix) => { setRoundtrip(null); onSelectDocument(prefix); }}
        />
      )}
    </div>
  );
}

// ─── Zieldokument wählen (nur wenn noch keins ausgewählt ist) ──────────────────

function TargetDialog({ fileName, documents, busy, onCancel, onChoose }: {
  fileName: string; documents: Document[]; busy: boolean;
  onCancel: () => void; onChoose: (prefix: string, isNew: boolean) => void;
}) {
  const existing = documents.map((d) => d.prefix);
  const [mode, setMode] = useState<'new' | 'existing'>(documents.length ? 'existing' : 'new');
  const [chosen, setChosen] = useState(existing[0] ?? '');
  const [prefix, setPrefix] = useState(() => suggestPrefix(fileName, existing));
  const valid = mode === 'existing' ? !!chosen : /^[A-Za-z][A-Za-z0-9]*$/.test(prefix) && !existing.includes(prefix.toUpperCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <form
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onSubmit={(e) => { e.preventDefault(); if (valid && !busy) onChoose(mode === 'new' ? prefix : chosen, mode === 'new'); }}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-800">Wohin sollen die Anforderungen?</h2>
            <p className="text-xs text-gray-500 truncate">{fileName}</p>
          </div>
          <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-3 text-sm">
          {documents.length > 0 && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} className="mt-1" />
              <span className="flex-1">
                In vorhandenes Dokument
                <select value={chosen} onChange={(e) => { setChosen(e.target.value); setMode('existing'); }}
                        className="input text-sm py-1 mt-1">
                  {existing.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </span>
            </label>
          )}
          <label className="flex items-start gap-2 cursor-pointer">
            {documents.length > 0 && (
              <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} className="mt-1" />
            )}
            <span className="flex-1">
              {documents.length ? 'In neues Dokument' : 'Das Projekt hat noch kein Dokument – neues Dokument anlegen'}
              <span className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">Präfix</span>
                <input value={prefix} autoFocus={!documents.length}
                       onChange={(e) => { setPrefix(e.target.value.toUpperCase()); setMode('new'); }}
                       className="input text-sm py-1 w-32 font-mono" placeholder="z. B. REQ" />
                <span className="text-xs text-gray-400">→ IDs {prefix || '…'}-001, {prefix || '…'}-002 …</span>
              </span>
              {mode === 'new' && prefix && !valid && (
                <span className="block text-xs text-red-600 mt-1">
                  {existing.includes(prefix.toUpperCase()) ? 'Dieses Dokument gibt es schon' : 'Nur Buchstaben und Ziffern, beginnend mit einem Buchstaben'}
                </span>
              )}
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-4">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm py-2">Abbrechen</button>
          <button type="submit" disabled={!valid || busy} className="btn-primary text-sm py-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Weiter zur Vorschau
          </button>
        </div>
      </form>
    </div>
  );
}
