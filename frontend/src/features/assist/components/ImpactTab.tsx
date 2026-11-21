import { Loader2 } from 'lucide-react';
import { useImpact, isEmbeddingUnavailable } from '../hooks/useAssist';
import type { ImpactResult } from '../../../shared/api/client';

type Item = ImpactResult['downstream'][number];

interface Props {
  projectId: string;
  uid: string;
  onOpen: (uid: string, prefix: string) => void;
}

function Row({ it, onOpen, warn }: { it: Item; onOpen: Props['onOpen']; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-xs py-1">
      <button
        className="font-mono font-semibold text-primary-600 hover:underline shrink-0"
        onClick={() => onOpen(it.uid, it.prefix)}
      >
        {it.uid}
      </button>
      <span className="text-gray-400 shrink-0">{it.prefix}</span>
      <span className="flex-1 text-gray-600">
        {it.text}
        {warn && it.reviewed === true && (
          <span className="block text-yellow-700">Review wird ungültig, wenn sich die verlinkte Anforderung ändert</span>
        )}
      </span>
    </li>
  );
}

function ByDepth({ items, onOpen, warn }: { items: Item[]; onOpen: Props['onOpen']; warn?: boolean }) {
  if (items.length === 0) return <p className="text-xs text-gray-400 italic">Keine.</p>;
  const depths = [...new Set(items.map((i) => i.depth))].sort((a, b) => a - b);
  return (
    <>
      {depths.map((d) => (
        <div key={d}>
          {depths.length > 1 && (
            <p className="text-[11px] text-gray-400 mt-1">
              {d === 1 ? 'direkt' : `über ${d - 1} Zwischenstufe${d > 2 ? 'n' : ''}`}
            </p>
          )}
          <ul>
            {items
              .filter((i) => i.depth === d)
              .map((i) => (
                <Row key={i.uid} it={i} onOpen={onOpen} warn={warn} />
              ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** Auswirkungen einer Änderung: was über Links daran hängt, plus ähnliche unverlinkte Anforderungen. */
export default function ImpactTab({ projectId, uid, onOpen }: Props) {
  const { data, isLoading, error } = useImpact(projectId, uid);

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-gray-400" />;
  if (isEmbeddingUnavailable(error)) {
    return <p className="text-xs text-gray-400">Auswirkungen nicht verfügbar (Embedding-Modell nicht erreichbar).</p>;
  }
  if (error || !data) {
    return (
      <p className="text-xs text-gray-400">
        Keine Auswirkungsanalyse möglich (Überschrift, inaktiv oder zu kurzer Text).
      </p>
    );
  }
  const docs = new Set(data.downstream.map((d) => d.prefix));
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Eine Änderung an <strong className="font-mono">{uid}</strong> betrifft {data.downstream.length}{' '}
        {data.downstream.length === 1 ? 'Anforderung' : 'Anforderungen'} in {docs.size}{' '}
        {docs.size === 1 ? 'Dokument' : 'Dokumenten'}.
      </p>
      <section>
        <h4 className="text-xs font-semibold text-gray-700 mb-1">Hängt davon ab (abwärts)</h4>
        <ByDepth items={data.downstream} onOpen={onOpen} warn />
      </section>
      <section>
        <h4 className="text-xs font-semibold text-gray-700 mb-1">Hängt ab von (aufwärts)</h4>
        <ByDepth items={data.upstream} onOpen={onOpen} />
      </section>
      <section>
        <h4 className="text-xs font-semibold text-gray-700 mb-1">Ähnlich, aber nicht verlinkt</h4>
        {data.similar_unlinked.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Keine.</p>
        ) : (
          <ul>
            {data.similar_unlinked.map((h) => (
              <Row
                key={h.uid}
                it={{ uid: h.uid, prefix: h.prefix, text: h.text, depth: 0, reviewed: null }}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
