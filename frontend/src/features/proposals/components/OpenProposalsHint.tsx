import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listProposals } from '../../../shared/api/client';

/** Schmaler Hinweis über den Tabs des Editors, wenn es offene Vorschläge zu dieser Anforderung gibt. */
export default function OpenProposalsHint({ projectId, uid }: { projectId: string; uid: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['proposals', projectId, 'uid', uid],
    queryFn: async () => (await listProposals(projectId, { status: 'open', uid })).data,
    enabled: !!projectId && !!uid,
    retry: false,
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 shrink-0">
      <Inbox className="w-3.5 h-3.5" />
      <span>
        {data.length} offene{data.length === 1 ? 'r Vorschlag' : ' Vorschläge'} zu dieser Anforderung –{' '}
        <button className="underline" onClick={() => navigate(`/proposals/${projectId}`)}>
          ansehen
        </button>
      </span>
    </div>
  );
}
