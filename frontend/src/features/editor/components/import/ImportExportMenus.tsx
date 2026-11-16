import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown, ClipboardPaste, DownloadCloud, FileSpreadsheet, FileText, Gem, Loader2, Upload, Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { exportDocument, exportForExcel, exportPdf, type ExportFormat } from '../../../../shared/api/client';
import { ImportFromObsidianButton, OpenInObsidianButton } from '../../../bridges';
import ExcelFileImport, { type ExcelFileImportHandle } from './ExcelFileImport';
import ImportDialog from './ImportDialog';

interface Props {
  projectId: string;
  /** Aktuell gewähltes Dokument – Dokument-bezogene Einträge sind sonst gesperrt */
  selectedPrefix: string | null;
  onSelectDocument: (prefix: string) => void;
  /** Darf der Benutzer ändern? Sonst entfällt das Menü „Importieren“. */
  canEdit: boolean;
  className?: string;
}

// ─── Menü ─────────────────────────────────────────────────────────────────────

function Menu({ label, icon, busy, children }: {
  label: string; icon: ReactNode; busy?: boolean;
  /** Bekommt eine Funktion zum Schließen des Menüs */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-lg
                   border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
        {label}
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[260px]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Item({ icon, children, onClick, disabled, hint, separated }: {
  icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean; hint?: string; separated?: boolean;
}) {
  return (
    <button
      role="menuitem" onClick={onClick} disabled={disabled} title={hint}
      className={clsx('w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent',
        separated && 'border-t border-gray-100')}
    >
      <span className="w-4 shrink-0 text-gray-400">{icon}</span>
      {children}
    </button>
  );
}

// ─── Beide Menüs ──────────────────────────────────────────────────────────────

/**
 * Obere Leiste der Anforderungen-Seite: ein Menü „Importieren“ und ein Menü „Exportieren“.
 * Die Abläufe selbst (Excel-Vorschau, Rückweg, Zwischenablage, Obsidian) sind unverändert; nur der Einstieg ist hier.
 */
export default function ImportExportMenus({ projectId, selectedPrefix, onSelectDocument, canEdit, className }: Props) {
  const excelRef = useRef<ExcelFileImportHandle>(null);
  const obsidianOut = useRef<HTMLDivElement>(null);
  const obsidianIn = useRef<HTMLDivElement>(null);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const noDoc = 'Zuerst links ein Dokument auswählen';

  const run = async (fn: () => Promise<unknown>, ok?: string, fail = 'Export fehlgeschlagen') => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); }
    catch (e: any) { toast.error(e.message || fail); }
    finally { setBusy(false); }
  };

  const downloadForExcel = async () => {
    if (!selectedPrefix) return;
    setBusy(true);
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
      setBusy(false);
    }
  };

  const exportAs = (fmt: ExportFormat) => selectedPrefix && run(
    () => exportDocument(projectId, selectedPrefix, fmt),
    `${selectedPrefix}.${fmt === 'yaml' ? 'yml' : fmt} heruntergeladen`,
  );

  // Die Obsidian-Knöpfe liefern ihre eigenen Dialoge und Meldungen; sie bleiben unsichtbar eingebaut,
  // das Menü löst sie aus.
  const clickIn = (el: HTMLDivElement | null) => el?.querySelector('button')?.click();

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {canEdit && (
        <Menu label="Importieren" icon={<Upload className="w-3.5 h-3.5" />}>
          {(close) => (<>
            <Item icon={<FileSpreadsheet className="w-4 h-4 text-green-600" />}
                  hint={selectedPrefix ? `Excel-Datei in ${selectedPrefix} laden` : 'Excel-Datei laden'}
                  onClick={() => { close(); excelRef.current?.pick(); }}>
              Excel-Datei laden
            </Item>
            <Item icon={<ClipboardPaste className="w-4 h-4" />} disabled={!selectedPrefix} hint={selectedPrefix ? 'Tabelle aus Excel einfügen (auch per Strg+V in der Liste)' : noDoc}
                  onClick={() => { close(); setClipboardOpen(true); }}>
              Aus Zwischenablage einfügen
            </Item>
            <Item icon={<DownloadCloud className="w-4 h-4" />} separated
                  hint="Geänderte oder neue Notizen aus dem Obsidian-Ordner als Vorschläge anlegen"
                  onClick={() => { close(); clickIn(obsidianIn.current); }}>
              Änderungen aus Obsidian holen
            </Item>
          </>)}
        </Menu>
      )}

      <Menu label="Exportieren" icon={<Download className="w-3.5 h-3.5" />} busy={busy}>
        {(close) => (<>
          <Item icon={<FileSpreadsheet className="w-4 h-4 text-green-600" />} disabled={!selectedPrefix}
                hint={selectedPrefix ? 'Zum Bearbeiten und Kommentieren – danach über „Excel-Datei laden“ zurückholen' : noDoc}
                onClick={() => { close(); downloadForExcel(); }}>
            Excel (zum Bearbeiten und Zurückladen)
          </Item>
          {(['csv', 'tsv', 'yaml'] as ExportFormat[]).map((fmt) => (
            <Item key={fmt} icon={<FileText className="w-4 h-4" />} disabled={!selectedPrefix} hint={selectedPrefix ? undefined : noDoc}
                  onClick={() => { close(); exportAs(fmt); }}>
              {fmt.toUpperCase()}
            </Item>
          ))}
          <Item icon={<FileText className="w-4 h-4" />} disabled={!selectedPrefix} hint={selectedPrefix ? undefined : noDoc}
                onClick={() => { close(); if (selectedPrefix) run(() => exportPdf(projectId, selectedPrefix), undefined, 'PDF-Satz fehlgeschlagen'); }}>
            PDF (gesetzt)
          </Item>
          <Item icon={<Gem className="w-4 h-4" />} separated
                hint="Projekt als Obsidian-Ordner ausliefern (Graph, Tabellen, Landkarte)"
                onClick={() => { close(); clickIn(obsidianOut.current); }}>
            Nach Obsidian
          </Item>
        </>)}
      </Menu>

      {/* Unsichtbar eingebaut: Ablauf und Dialoge der bestehenden Bausteine */}
      <div className="contents">
        <div ref={obsidianOut} className="contents"><OpenInObsidianButton projectId={projectId} className="!hidden" /></div>
        <div ref={obsidianIn} className="contents"><ImportFromObsidianButton projectId={projectId} className="!hidden" /></div>
      </div>
      {canEdit && <ExcelFileImport ref={excelRef} projectId={projectId} selectedPrefix={selectedPrefix} onSelectDocument={onSelectDocument} />}
      {clipboardOpen && selectedPrefix && (
        <ImportDialog
          projectId={projectId} prefix={selectedPrefix} initialTable={null}
          onClose={() => setClipboardOpen(false)}
          onImported={() => setClipboardOpen(false)}
        />
      )}
    </div>
  );
}
