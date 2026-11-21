import { Link2, Lightbulb } from 'lucide-react';
import { useLinkSuggestions, isEmbeddingUnavailable } from '../hooks/useAssist';

interface Props {
  projectId: string;
  uid: string;
  currentLinks: string[];
  onAdd: (uid: string) => void;
}

/** Link-Vorschläge: die passendsten Anforderungen aus dem Eltern-Dokument, ein Klick verlinkt. */
export default function LinkSuggestions({ projectId, uid, currentLinks, onAdd }: Props) {
  const { data, error } = useLinkSuggestions(projectId, uid);

  if (isEmbeddingUnavailable(error)) {
    return <p className="mt-2 text-xs text-gray-400">Vorschläge nicht verfügbar (Embedding-Modell nicht erreichbar).</p>;
  }
  const shown = (data?.suggestions ?? []).filter((s) => !currentLinks.includes(s.uid)).slice(0, 5);
  if (!data?.parent_document || shown.length === 0) return null;

  return (
    <div className="mt-3 p-2 rounded-lg border border-amber-100 bg-amber-50/50">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 mb-1">
        <Lightbulb className="w-3.5 h-3.5" />
        Vorschläge aus {data.parent_document}
      </div>
      <ul className="space-y-1">
        {shown.map((s) => (
          <li key={s.uid} className="flex items-start gap-2 text-xs">
            <span className="font-mono font-semibold text-gray-700 shrink-0">{s.uid}</span>
            <span className="text-gray-600 flex-1 line-clamp-2">{s.text}</span>
            <button className="btn-secondary text-xs py-0.5 shrink-0" onClick={() => onAdd(s.uid)}>
              <Link2 className="w-3 h-3" /> Verlinken
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
