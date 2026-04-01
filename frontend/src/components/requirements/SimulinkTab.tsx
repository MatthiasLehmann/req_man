import { useRef, useState } from 'react';
import { Upload, Boxes, FileCode2, CheckCircle2, Clock, Trash2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useSimulinkLinks, useImportSimulink, useDeleteSimulinkLinks } from '../../hooks/useSimulinkLinks';
import type { SimulinkLink } from '../../types';

interface Props {
  projectId: string;
  uid: string;
}

// ── Link-Typ Badge ────────────────────────────────────────────────────────────

const LINK_TYPE_STYLES: Record<string, string> = {
  implements: 'bg-blue-100 text-blue-700',
  verifies:   'bg-purple-100 text-purple-700',
  refines:    'bg-orange-100 text-orange-700',
};

function LinkTypeBadge({ type }: { type: string }) {
  return (
    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium', LINK_TYPE_STYLES[type] ?? 'bg-gray-100 text-gray-600')}>
      {type}
    </span>
  );
}

// ── Block-Karte ───────────────────────────────────────────────────────────────

function openInVSCode(file: string, line?: number) {
  const loc = line ? `${file}:${line}` : file;
  window.open(`vscode://file/${loc}`, '_self');
}

function BlockCard({ link }: { link: SimulinkLink }) {
  const [expanded, setExpanded] = useState(false);
  const isMatlabLink = link.source_type === 'matlab';

  // Titel & Subtitle je nach Quelle
  const title = isMatlabLink
    ? (link.file ? link.file.split('/').pop()! : 'MATLAB-Datei')
    : (link.block_path ? link.block_path.split('/').pop()! : '—');

  const subtitle = isMatlabLink
    ? (link.file ?? '')
    : link.block_path.split('/').slice(0, -1).join(' / ');

  return (
    <div className="border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        {isMatlabLink
          ? <FileCode2 className="w-4 h-4 text-emerald-500 shrink-0" />
          : <Boxes    className="w-4 h-4 text-blue-500 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800 truncate">{title}</span>
            <LinkTypeBadge type={link.link_type} />
            {isMatlabLink
              ? link.line != null && (
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                    Zeile {link.line}
                  </span>
                )
              : link.block_type && (
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                    {link.block_type}
                  </span>
                )
            }
          </div>
          {subtitle && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-100 space-y-1.5">
          {isMatlabLink ? (
            <>
              <div className="flex gap-2 text-xs items-start">
                <span className="text-gray-400 w-32 shrink-0">Datei</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-gray-700 break-all font-mono text-[11px]">{link.file ?? '—'}</span>
                  {link.file && (
                    <button
                      onClick={() => openInVSCode(link.file!, link.line)}
                      title="In VS Code öffnen"
                      className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {link.line != null && (
                <DetailRow label="Zeile" value={String(link.line)} mono />
              )}
            </>
          ) : (
            <>
              <DetailRow label="Vollständiger Pfad" value={link.block_path || '—'} mono />
              <DetailRow label="Modell-Datei"       value={link.model_file || '—'} />
              <DetailRow label="Block-Typ"          value={link.block_type || '—'} />
            </>
          )}
          <DetailRow label="Link-Typ"     value={link.link_type} />
          <DetailRow label="Importiert am" value={formatDate(link.imported_at)} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 w-32 shrink-0">{label}</span>
      <span className={clsx('text-gray-700 break-all', mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}

// ── Import-Button ─────────────────────────────────────────────────────────────

function ImportButton({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importMut = useImportSimulink(projectId);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importMut.mutateAsync(file);
      toast.success(
        `Import erfolgreich: ${result.data.imported} Links, ${result.data.updated_requirements.length} Anforderungen aktualisiert`,
      );
      if (result.data.unknown_uids.length > 0) {
        toast(
          `⚠️ Unbekannte UIDs: ${result.data.unknown_uids.join(', ')}`,
          { duration: 6000 },
        );
      }
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Import fehlgeschlagen');
    }
    // Input zurücksetzen damit dieselbe Datei nochmal gewählt werden kann
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importMut.isPending}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
          importMut.isPending
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        )}
      >
        <Upload className="w-3.5 h-3.5" />
        {importMut.isPending ? 'Importiere…' : 'JSON importieren'}
      </button>
    </>
  );
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Haupt-Tab ─────────────────────────────────────────────────────────────────

export default function SimulinkTab({ projectId, uid }: Props) {
  const { data: sidecar, isLoading, refetch } = useSimulinkLinks(projectId, uid);
  const deleteMut = useDeleteSimulinkLinks(projectId);

  const handleDelete = async () => {
    if (!confirm('Alle Simulink-Links dieses Projekts löschen?')) return;
    try {
      const res = await deleteMut.mutateAsync();
      toast.success(res.data.message);
    } catch {
      toast.error('Löschen fehlgeschlagen');
    }
  };

  // ── Leer-Zustand ──
  if (!isLoading && !sidecar) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Simulink-Traceability</h3>
          <ImportButton projectId={projectId} onDone={refetch} />
        </div>

        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center space-y-3">
          <Boxes className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-medium text-gray-500">
            Keine Simulink-Links für <span className="font-mono text-gray-700">{uid}</span>
          </p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Trage die UID im Simulink-Block ein (<code className="bg-gray-100 px-1 rounded">REQ: {uid}</code>),
            exportiere mit <code className="bg-gray-100 px-1 rounded">export_simulink_trace.m</code>
            und importiere die JSON-Datei.
          </p>
        </div>

        <WorkflowHint uid={uid} />
      </div>
    );
  }

  // ── Lade-Zustand ──
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Lade Simulink-Links…
      </div>
    );
  }

  // ── Ergebnis-Ansicht ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Simulink-Traceability</h3>
          <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            {sidecar!.links.length} {sidecar!.links.length === 1 ? 'Treffer' : 'Treffer'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton projectId={projectId} onDone={refetch} />
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            title="Alle Links dieses Projekts löschen"
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modell-Info */}
      <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          Modell: <span className="font-medium text-gray-700">{sidecar!.model}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {formatDate(sidecar!.last_import)}
        </span>
      </div>

      {/* Block-Karten */}
      <div className="space-y-2">
        {sidecar!.links.map((link, i) => (
          <BlockCard key={`${link.block_path}-${i}`} link={link} />
        ))}
      </div>
    </div>
  );
}

// ── Workflow-Hinweis ──────────────────────────────────────────────────────────

function WorkflowHint({ uid }: { uid: string }) {
  const steps = [
    {
      num: '1',
      title: 'UID in Simulink eintragen',
      desc: (
        <>
          Block-Properties öffnen → Feld <em>Description</em>:{' '}
          <code className="bg-gray-100 px-1 rounded text-[11px]">REQ: {uid}</code>
        </>
      ),
    },
    {
      num: '2',
      title: 'MATLAB-Skript ausführen',
      desc: (
        <>
          <code className="bg-gray-100 px-1 rounded text-[11px]">{'>>'} export_simulink_trace</code>
          {' '}→ erzeugt <code className="bg-gray-100 px-1 rounded text-[11px]">simulink_trace.json</code>
        </>
      ),
    },
    {
      num: '3',
      title: 'JSON hier importieren',
      desc: 'Schaltfläche „JSON importieren" oben rechts → Datei auswählen.',
    },
  ];

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Workflow</p>
      <ol className="space-y-2">
        {steps.map(s => (
          <li key={s.num} className="flex gap-3 text-xs text-gray-600">
            <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
              {s.num}
            </span>
            <div>
              <span className="font-medium text-gray-700">{s.title}</span>
              <br />
              {s.desc}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
