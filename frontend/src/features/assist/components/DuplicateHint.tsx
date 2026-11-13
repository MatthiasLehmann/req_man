import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useDebounced } from '../../../shared/search';
import { useSimilarText } from '../hooks/useAssist';
import { DUPLICATE_MIN, SIMILAR_MIN } from '../constants';

interface Props {
  projectId: string;
  uid: string;
  text: string;
  /** Bereits verlinkte Anforderungen (Eltern sind erwartungsgemäß ähnlich, keine Dubletten). */
  excludeUids: string[];
  onOpen: (uid: string, prefix: string) => void;
}

const plain = (t: string) =>
  t.replace(/<[^>]+>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

/** Warnt beim Schreiben, wenn es die Anforderung inhaltlich schon gibt. */
export default function DuplicateHint({ projectId, uid, text, excludeUids, onOpen }: Props) {
  const [more, setMore] = useState(false);
  const clean = plain(text);
  const debounced = useDebounced(clean, 800);
  const { data } = useSimilarText(projectId, uid, debounced, debounced.length >= 20);

  const hits = (data ?? []).filter((h) => !excludeUids.includes(h.uid));
  const dup = hits.filter((h) => h.score >= DUPLICATE_MIN);
  const similar = hits.filter((h) => h.score >= SIMILAR_MIN && h.score < DUPLICATE_MIN);
  if (dup.length === 0 && similar.length === 0) return null;

  return (
    <div className="mb-2 space-y-1.5">
      {dup.map((h) => (
        <div
          key={h.uid}
          className="flex items-start gap-2 p-2 rounded-lg border border-yellow-300 bg-yellow-50 text-xs text-yellow-900"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="flex-1">
            Sehr ähnlich zu <strong className="font-mono">{h.uid}</strong>: {h.text}
          </span>
          <button className="underline shrink-0" onClick={() => onOpen(h.uid, h.prefix)}>
            Öffnen
          </button>
        </div>
      ))}
      {similar.length > 0 && (
        <div className="text-xs text-gray-600">
          <button className="flex items-center gap-1 text-gray-500 hover:text-gray-700" onClick={() => setMore(!more)}>
            {more ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Weitere ähnliche Anforderungen ({similar.length})
          </button>
          {more && (
            <ul className="mt-1 space-y-1">
              {similar.map((h) => (
                <li key={h.uid} className="flex items-start gap-2">
                  <span className="font-mono font-semibold shrink-0">{h.uid}</span>
                  <span className="flex-1 line-clamp-2">{h.text}</span>
                  <button className="underline shrink-0" onClick={() => onOpen(h.uid, h.prefix)}>
                    Öffnen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
