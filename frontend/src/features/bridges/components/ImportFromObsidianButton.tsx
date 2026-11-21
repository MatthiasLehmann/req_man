import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DownloadCloud, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { importFromObsidian } from '../../../shared/api/client';

/** Knopf „Änderungen aus Obsidian holen“: legt Vorschläge an (nichts wird übernommen) und springt zur Seite „Vorschläge“. */
export default function ImportFromObsidianButton({ projectId, className }: { projectId: string; className?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const run = useMutation({
    mutationFn: async () => (await importFromObsidian(projectId)).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      const notes = [
        r.conflicts > 0 ? `${r.conflicts} Notiz(en) übersprungen, weil sich ReqMan inzwischen geändert hat` : '',
        r.existing > 0 ? `${r.existing} bereits offen` : '',
      ].filter(Boolean).join(' · ');
      if (r.created === 0) {
        toast(`Keine neuen Änderungen in Obsidian gefunden${notes ? ` (${notes})` : ''}`);
        return;
      }
      toast.success(`${r.created} ${r.created === 1 ? 'Vorschlag' : 'Vorschläge'} angelegt${notes ? ` – ${notes}` : ''}`, {
        duration: 8000,
      });
      navigate(`/proposals/${projectId}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Import aus Obsidian fehlgeschlagen'),
  });

  return (
    <button
      onClick={() => run.mutate()}
      disabled={run.isPending || !projectId}
      title="Geänderte oder neue Notizen aus dem Obsidian-Ordner als Vorschläge anlegen. Übernommen wird erst nach deiner Entscheidung."
      className={clsx('btn-secondary flex items-center gap-1.5 text-sm', className)}
    >
      {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
      Änderungen aus Obsidian holen
    </button>
  );
}
