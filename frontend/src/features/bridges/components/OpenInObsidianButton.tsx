import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Gem, Loader2, X } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { exportToObsidian, getObsidianStatus, ObsidianExport } from '../../../shared/api/client';

/** Knopf „In Obsidian öffnen“: schreibt das Projekt als Obsidian-Ordner und zeigt Pfad und Öffnen-Link. */
export default function OpenInObsidianButton({ projectId, className }: { projectId: string; className?: string }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<ObsidianExport | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['obsidian-status', projectId],
    queryFn: async () => (await getObsidianStatus(projectId)).data,
    enabled: !!projectId,
    retry: false,
  });

  const run = useMutation({
    mutationFn: async () => (await exportToObsidian(projectId)).data,
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['obsidian-status', projectId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Export nach Obsidian fehlgeschlagen'),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Kopieren nicht möglich – Pfad bitte von Hand markieren');
    }
  };

  const hint = status?.exported
    ? status.pending_changes
      ? `${status.pending_changes} Datei(en) seit dem letzten Export geändert`
      : 'Export ist aktuell'
    : 'Noch nicht exportiert';

  return (
    <>
      <button
        onClick={() => run.mutate()}
        disabled={run.isPending || !projectId}
        title={`Projekt als Obsidian-Ordner ausliefern (Graph, Tabellen, Landkarte). ${hint}.`}
        className={clsx('btn-secondary flex items-center gap-1.5 text-sm', className)}
      >
        {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gem className="w-4 h-4" />}
        In Obsidian öffnen
      </button>

      {result && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Gem className="w-5 h-5 text-primary-600" />
                Obsidian-Ordner erstellt
              </h2>
              <button onClick={() => setResult(null)} className="p-1 rounded hover:bg-gray-100" title="Schließen">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm text-gray-700">
              <p>
                {result.requirements} Anforderungen in {result.documents} Dokumenten · {result.written} Datei(en)
                geschrieben, {result.removed} entfernt, {result.unchanged} unverändert ({result.seconds} s).
                {result.kept_edited > 0 &&
                  ` ${result.kept_edited} in Obsidian geänderte Datei(en) blieben unangetastet.`}
              </p>
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  Beim ersten Mal in Obsidian: „Ordner als Vault öffnen“ und diesen Ordner wählen:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs break-all">
                    {result.path}
                  </code>
                  <button onClick={() => copy(result.path)} className="btn-secondary p-2" title="Pfad kopieren">
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Läuft ReqMan in Docker, ist das der Pfad im Container; auf dem Rechner liegt der Ordner unter
                  data/obsidian/ im Projektverzeichnis von ReqMan.
                </p>
              </div>
              <p className="text-xs text-gray-500">
                Danach in Obsidian die Notiz „Start“ öffnen: dort stehen Hierarchie, Nächste Schritte und die
                Ansichten (Uebersicht.base, Traceability.canvas).
              </p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button onClick={() => setResult(null)} className="btn-secondary text-sm">Schließen</button>
              <a href={result.open_url} className="btn-primary text-sm flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4" />
                In Obsidian öffnen
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
