import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, Inbox, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { acceptProposal, listProposals, rejectProposal } from '../../../shared/api/client';
import type { Proposal } from '../../../shared/api/client';
import { useAuthStore } from '../../../shared/auth/authStore';
import { useProjectStore } from '../../../shared/store/projectStore';
import { useOpenRequirement } from '../../../shared/search';

const KIND: Record<string, string> = {
  change_text: 'Textänderung',
  new_item: 'Neue Anforderung',
  add_link: 'Neue Verlinkung',
};
const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Offen', cls: 'badge-yellow' },
  accepted: { label: 'Übernommen', cls: 'badge-green' },
  rejected: { label: 'Abgelehnt', cls: 'badge-gray' },
  stale: { label: 'Veraltet', cls: 'badge-red' },
};

function Card({ p, projectId, canDecide }: { p: Proposal; projectId: string; canDecide: boolean }) {
  const qc = useQueryClient();
  const openRequirement = useOpenRequirement();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['proposals'] });
    qc.invalidateQueries({ queryKey: ['proposal-count'] });
    qc.invalidateQueries({ queryKey: ['items'] });
    qc.invalidateQueries({ queryKey: ['item', projectId] });
  };
  const accept = useMutation({
    mutationFn: () => acceptProposal(projectId, p.id),
    onSuccess: () => { toast.success('Vorschlag übernommen'); refresh(); },
    onError: (e: any) => {
      toast.error(e.response?.status === 409 ? 'Veraltet: Die Anforderung wurde inzwischen geändert.' : (e.response?.data?.detail || 'Fehler'));
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: () => rejectProposal(projectId, p.id),
    onSuccess: () => { toast.success('Vorschlag abgelehnt'); refresh(); },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler'),
  });
  const st = STATUS[p.status] ?? { label: p.status, cls: 'badge-gray' };
  const prefix = p.uid?.replace(/[0-9\-_.]+$/, '') || p.prefix || '';

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm text-gray-800">{KIND[p.kind] ?? p.kind}</span>
        {p.uid && (
          <button className="font-mono text-xs text-primary-600 hover:underline" onClick={() => openRequirement(projectId, prefix, p.uid!)}>
            {p.uid}
          </button>
        )}
        {p.kind === 'new_item' && <span className="text-xs text-gray-500">in {p.prefix}</span>}
        <span className={clsx(st.cls, 'text-xs')}>{st.label}</span>
        <span className="ml-auto text-xs text-gray-400">
          {p.source} · {p.created_by} · {p.created_at ? new Date(p.created_at).toLocaleString('de-DE') : ''}
        </span>
      </div>
      <p className="text-sm text-gray-700"><span className="text-gray-500">Begründung: </span>{p.reason}</p>

      {p.kind === 'change_text' && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-red-50 border border-red-100 whitespace-pre-wrap">
            <div className="font-semibold text-red-700 mb-1">Bisher</div>{p.old_text}
          </div>
          <div className="p-2 rounded bg-green-50 border border-green-100 whitespace-pre-wrap">
            <div className="font-semibold text-green-700 mb-1">Vorschlag</div>{p.new_text}
          </div>
        </div>
      )}
      {p.kind === 'new_item' && (
        <div className="p-2 rounded bg-green-50 border border-green-100 text-xs whitespace-pre-wrap">
          {p.text}
          {p.links && p.links.length > 0 && <div className="mt-1 text-gray-500">Verlinkt auf: {p.links.join(', ')}</div>}
        </div>
      )}
      {p.kind === 'add_link' && (
        <p className="text-xs text-gray-700">
          <span className="font-mono">{p.uid}</span> soll auf <span className="font-mono">{p.target_uid}</span> verlinken.
        </p>
      )}

      {p.status === 'open' && canDecide && (
        <div className="flex gap-2 pt-1">
          <button className="btn-primary text-xs py-1" disabled={accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Übernehmen
          </button>
          <button className="btn-secondary text-xs py-1" disabled={reject.isPending} onClick={() => reject.mutate()}>
            <X className="w-3 h-3" /> Ablehnen
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProposalsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const currentProject = useProjectStore((s) => s.currentProject);
  const pid = projectId ?? currentProject?.id ?? '';
  const canDecide = useAuthStore((s) => s.user?.role !== 'viewer');
  const [showDone, setShowDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['proposals', pid, showDone],
    queryFn: async () => (await listProposals(pid, showDone ? undefined : { status: 'open' })).data,
    enabled: !!pid,
  });

  if (!pid) return <p className="p-8 text-gray-400">Kein Projekt ausgewählt.</p>;
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Inbox className="w-5 h-5 text-gray-500" />
        <h2 className="text-lg font-semibold text-gray-800">Vorschläge</h2>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Erledigte anzeigen
        </label>
      </div>
      <p className="text-xs text-gray-500">
        Agenten und der Assistent legen hier Änderungen ab. Nichts wird übernommen, bevor du es bestätigst.
      </p>
      {isLoading && <Loader2 className="w-5 h-5 animate-spin text-gray-400" />}
      {data && data.length === 0 && <p className="text-sm text-gray-400 italic">Keine {showDone ? '' : 'offenen '}Vorschläge.</p>}
      {data?.map((p) => <Card key={p.id} p={p} projectId={pid} canDecide={canDecide} />)}
    </div>
  );
}
