import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTraceability } from '../../../shared/api/client';
import { useOpenRequirement } from '../../../shared/search';
import { buildGraph, neighborhood } from '../graphData';
import ForceGraph from './ForceGraph';

interface Props {
  projectId: string;
  uid: string;
  /** Anfangstiefe 1–3 */
  initialDepth?: number;
}

/** Umfeld einer Anforderung bis Tiefe 1–3 (Breitensuche in beide Richtungen), Klick öffnet den Nachbarn. */
export default function LocalGraph({ projectId, uid, initialDepth = 1 }: Props) {
  const [depth, setDepth] = useState(initialDepth);
  const openRequirement = useOpenRequirement();

  const { data: res, isLoading } = useQuery({
    queryKey: ['traceability', projectId],
    queryFn: () => getTraceability(projectId),
  });

  const graph = useMemo(() => {
    const nodes = res?.data.nodes ?? [];
    const links = res?.data.links ?? [];
    const docList = [...new Set(nodes.map((n) => n.document))].sort();
    const reach = neighborhood(uid, depth, links);
    const sub = buildGraph(
      nodes.filter((n) => reach.has(n.uid)),
      links.filter((l) => reach.has(l.source) && reach.has(l.target)),
      docList,
      links,
    );
    return { sub, docList };
  }, [res, uid, depth]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4" data-testid="local-graph">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-gray-200 text-xs text-gray-600">
        <span className="font-medium">Umfeld · {graph.sub.nodes.length} Anforderungen</span>
        <label className="flex items-center gap-2">
          Tiefe {depth}
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            aria-label="Tiefe des Umfelds"
          />
        </label>
      </div>
      {isLoading ? (
        <div className="h-[260px] flex items-center justify-center text-xs text-gray-400">Lädt …</div>
      ) : graph.sub.nodes.length <= 1 ? (
        <div className="h-[260px] flex items-center justify-center text-xs text-gray-400">
          Diese Anforderung hat keine Verlinkungen.
        </div>
      ) : (
        <ForceGraph
          key={`${uid}-${depth}`}
          data={graph.sub}
          docList={graph.docList}
          height={260}
          focusUid={uid}
          onOpen={(n) => n.id !== uid && openRequirement(projectId, n.document, n.id)}
        />
      )}
    </div>
  );
}
